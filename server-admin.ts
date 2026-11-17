import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminPermissions,
  PaymentStatus,
  PlanConfig,
  PlanKey,
  SiteAppearanceConfig,
  SiteConfig,
  SubscriptionSummary,
  SystemControlsConfig,
  UserProfile,
} from './types.ts';
import { dispatchUserCommunication, getCommunicationTemplates } from './server-modules.ts';

export interface AuthedRequest extends Request {
  user?: UserProfile;
  sessionId?: string;
}

export interface AdminRouteDeps {
  db: Database.Database;
  requireAdmin: (req: AuthedRequest, res: Response, next: NextFunction) => Promise<void>;
  getSiteSettings: () => SiteConfig;
  getPublishedAppearance: () => SiteAppearanceConfig;
  getDraftAppearance: () => SiteAppearanceConfig;
  getSystemControls: () => SystemControlsConfig;
  getDefaultAppearance: () => SiteAppearanceConfig;
  getUserSubscriptionSummary: (userId: string, isSuspended: boolean) => SubscriptionSummary;
  expireOverdueSubscriptions: () => number;
  computeExpirationIso: (planKey: PlanKey, approvedDate?: Date) => string | null;
  mapProfile: (row: any) => UserProfile;
  logAudit: (
    adminId: string | null,
    action: string,
    recordId: string | null,
    details?: Record<string, unknown>,
    result?: string
  ) => void;
  createNotification: (opts: {
    type: string;
    title: string;
    message: string;
    targetTab: string;
    recordId?: string | null;
  }) => void;
  recordIntegrationEvent: (service: 'mercadopago' | 'supabase', status: 'ok' | 'error', message: string) => void;
  getIntegrationEvents: () => Record<string, { lastEventAt: string | null; lastStatus: string; lastMessage: string; lastErrorAt: string | null; lastErrorMessage: string | null }>;
  parseBrlToCents: (value: string | number | undefined) => number;
  hashPassword: (password: string) => string;
  isAdult: (birthDateStr: string) => boolean;
  supabaseConfigured: boolean;
  supabaseUrl: string;
  supabaseAdmin: SupabaseClient | null;
  mercadoPagoToken: string;
  webhookSecretConfigured: boolean;
  proofsDir: string;
  dbPath: string;
}

function escapeCsvCell(val: unknown): string {
  let s = String(val ?? '');
  if (s.length > 1 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function maskToken(token: string): string {
  if (!token) return 'Não configurado';
  if (token.length <= 12) return '••••••••••••';
  return `${token.slice(0, 8)}••••${token.slice(-4)}`;
}

function hasPerm(user: UserProfile | undefined, perm: keyof AdminPermissions): boolean {
  if (!user || user.role !== 'admin') return false;
  if (!user.permissions) return true;
  return Boolean(user.permissions[perm]);
}

export function registerAdminRoutes(app: Express, deps: AdminRouteDeps) {
  const {
    db,
    requireAdmin,
    getSiteSettings,
    getPublishedAppearance,
    getDraftAppearance,
    getSystemControls,
    getDefaultAppearance,
    getUserSubscriptionSummary,
    expireOverdueSubscriptions,
    computeExpirationIso,
    mapProfile,
    logAudit,
    createNotification,
    recordIntegrationEvent,
    getIntegrationEvents,
    parseBrlToCents,
    hashPassword,
    isAdult,
    supabaseConfigured,
    supabaseUrl,
    supabaseAdmin,
    mercadoPagoToken,
    webhookSecretConfigured,
    proofsDir,
    dbPath,
  } = deps;

  const upsertSetting = db.prepare(`
    INSERT INTO site_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `);

  // -------------------------------------------------------------------------
  // 1. Dashboard Overview (with Period Filtering, Sales, Expiring, Alerts)
  // -------------------------------------------------------------------------
  app.get('/api/admin/overview', requireAdmin, (req: AuthedRequest, res: Response) => {
    expireOverdueSubscriptions();

    const period = String(req.query?.period || '30d');
    const periodDaysMap: Record<string, number | null> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      all: null,
    };
    const daysWindow = periodDaysMap[period] !== undefined ? periodDaysMap[period] : 30;
    const cutoffIso = daysWindow
      ? new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const profiles = db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all() as any[];
    const clients = profiles.filter((p) => p.role === 'client');
    const payments = db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all() as any[];
    const proofs = db.prepare('SELECT * FROM payment_proofs ORDER BY created_at DESC').all() as any[];
    const audits = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10').all() as any[];

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const in5DaysIso = new Date(nowMs + 5 * 24 * 60 * 60 * 1000).toISOString();
    const monthPrefix = nowIso.slice(0, 7);

    const approvedPayments = payments.filter((p) => p.status === 'aprovado');
    const activeApprovedPayments = approvedPayments.filter(
      (p) => !p.expires_at || p.expires_at > nowIso
    );
    const validSubscriberIds = new Set(activeApprovedPayments.map((p) => p.user_id));

    const expiringSubscriptionsList = activeApprovedPayments.filter(
      (p) => p.expires_at && p.expires_at > nowIso && p.expires_at <= in5DaysIso
    );

    const pendingStatuses = new Set(['aguardando_pagamento', 'aguardando_analise', 'em_analise']);
    const pendingPayments = payments.filter((p) => pendingStatuses.has(p.status));
    const pendingProofs = proofs.filter(
      (pr) => pr.status === 'aguardando_analise' || pr.status === 'em_analise'
    );
    const rejectedPayments = payments.filter((p) => p.status === 'recusado');
    const expiredSubscriptions = payments.filter((p) => p.status === 'expirado');

    // Confirmed revenue ONLY (approved or formerly approved & now expired — NEVER pending)
    const confirmedRevenueRows = payments.filter(
      (p) => p.status === 'aprovado' || p.status === 'expirado'
    );
    const periodRevenueRows = cutoffIso
      ? confirmedRevenueRows.filter((p) => (p.approved_at || p.created_at) >= cutoffIso)
      : confirmedRevenueRows;
    const monthRevenueRows = confirmedRevenueRows.filter(
      (p) => (p.approved_at || p.created_at).slice(0, 7) === monthPrefix
    );
    const newClientsCount = cutoffIso
      ? clients.filter((c) => c.created_at >= cutoffIso).length
      : clients.length;

    const sumCents = (arr: any[]) => arr.reduce((acc, item) => acc + Number(item.amount_cents || 0), 0);

    const weeklyRows = periodRevenueRows.filter((p) => p.plan_key === 'semanal');
    const monthlyRows = periodRevenueRows.filter((p) => p.plan_key === 'mensal');
    const lifetimeRows = periodRevenueRows.filter((p) => p.plan_key === 'vitalicio');

    const activeByPlan = (planKey: PlanKey) =>
      new Set(activeApprovedPayments.filter((p) => p.plan_key === planKey).map((p) => p.user_id)).size;

    const revenueByPlan: Array<{
      planKey: PlanKey;
      label: string;
      count: number;
      activeSubscribers: number;
      revenueCents: number;
    }> = [
      {
        planKey: 'semanal',
        label: 'Semanal',
        count: weeklyRows.length,
        activeSubscribers: activeByPlan('semanal'),
        revenueCents: sumCents(weeklyRows),
      },
      {
        planKey: 'mensal',
        label: 'Mensal',
        count: monthlyRows.length,
        activeSubscribers: activeByPlan('mensal'),
        revenueCents: sumCents(monthlyRows),
      },
      {
        planKey: 'vitalicio',
        label: 'Vitalício',
        count: lifetimeRows.length,
        activeSubscribers: activeByPlan('vitalicio'),
        revenueCents: sumCents(lifetimeRows),
      },
    ];

    const statusLabels: Record<PaymentStatus, string> = {
      aguardando_pagamento: 'Aguardando pagamento',
      aguardando_analise: 'Aguardando análise',
      em_analise: 'Em análise',
      aprovado: 'Aprovado',
      recusado: 'Recusado',
      cancelado: 'Cancelado',
      reembolsado: 'Reembolsado',
      expirado: 'Expirado',
    };

    const statusBreakdown = (Object.keys(statusLabels) as PaymentStatus[]).map((st) => ({
      status: st,
      label: statusLabels[st],
      count: payments.filter((p) => p.status === st).length,
    }));

    const chartDays = daysWindow === 7 ? 7 : daysWindow === 90 ? 14 : 7;
    const dailyRevenue: Array<{ date: string; revenueCents: number; count: number }> = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayKey = d.toISOString().slice(0, 10);
      const dayMatches = confirmedRevenueRows.filter(
        (p) => (p.approved_at || p.created_at).slice(0, 10) === dayKey
      );
      dailyRevenue.push({
        date: dayKey,
        revenueCents: sumCents(dayMatches),
        count: dayMatches.length,
      });
    }

    const dailySignups: Array<{ date: string; count: number }> = [];
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayKey = d.toISOString().slice(0, 10);
      dailySignups.push({
        date: dayKey,
        count: clients.filter((c) => c.created_at.slice(0, 10) === dayKey).length,
      });
    }

    const conversionRatePercent =
      clients.length > 0 ? Math.round((validSubscriberIds.size / clients.length) * 100) : 0;

    const openSupportTickets = (
      db
        .prepare("SELECT COUNT(*) AS cnt FROM support_tickets WHERE status IN ('aberto', 'em_atendimento')")
        .get() as { cnt: number }
    ).cnt;

    const activeCoupons = (
      db.prepare('SELECT COUNT(*) AS cnt FROM coupons WHERE active = 1').get() as { cnt: number }
    ).cnt;

    const inconsistentOrders = (
      db
        .prepare(`
          SELECT COUNT(*) AS cnt FROM payments
          WHERE (status = 'aprovado' AND (approved_at IS NULL OR (plan_key <> 'vitalicio' AND expires_at IS NULL)))
             OR (status = 'expirado' AND expires_at IS NULL)
        `)
        .get() as { cnt: number }
    ).cnt;

    const sevenDaysAgoIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    const securityWarnings = (
      db
        .prepare(`
          SELECT COUNT(*) AS cnt FROM audit_logs
          WHERE created_at >= ?
            AND action IN ('tentativa_acesso_negado', 'tentativa_login_bloqueada', 'tentativa_login_admin_invalida', 'bloqueio_csrf_origem')
        `)
        .get(sevenDaysAgoIso) as { cnt: number }
    ).cnt;

    const recentTickets = db
      .prepare(`
        SELECT t.id, t.subject, t.status, t.updated_at, p.display_name AS customer_name
        FROM support_tickets t
        LEFT JOIN profiles p ON p.id = t.user_id
        ORDER BY t.updated_at DESC LIMIT 4
      `)
      .all() as any[];

    const recentSales = confirmedRevenueRows.slice(0, 6).map((p) => {
      const owner = profiles.find((u) => u.id === p.user_id);
      return {
        id: p.id,
        customerName: owner?.display_name || 'Cliente',
        planKey: p.plan_key as PlanKey,
        amountCents: p.amount_cents,
        approvedAt: p.approved_at || p.created_at,
      };
    });

    const recentActivities = [
      ...clients.slice(0, 6).map((c) => ({
        id: `sig-${c.id}`,
        type: 'signup' as const,
        title: `Novo cadastro: ${c.display_name}`,
        subtitle: c.email,
        createdAt: c.created_at,
      })),
      ...payments.slice(0, 6).map((p) => {
        const owner = profiles.find((u) => u.id === p.user_id);
        return {
          id: `pay-${p.id}`,
          type: 'payment' as const,
          title: `Pagamento (${statusLabels[p.status as PaymentStatus] || p.status})`,
          subtitle: `${owner?.display_name || 'Cliente'} · ${p.plan_key} · R$ ${(p.amount_cents / 100)
            .toFixed(2)
            .replace('.', ',')}`,
          createdAt: p.updated_at || p.created_at,
        };
      }),
      ...proofs.slice(0, 4).map((pr) => ({
        id: `prf-${pr.id}`,
        type: 'proof' as const,
        title: `Comprovante (${pr.original_filename})`,
        subtitle: `Status: ${pr.status}`,
        createdAt: pr.created_at,
      })),
      ...recentTickets.map((tk) => ({
        id: `tkt-${tk.id}`,
        type: 'support' as const,
        title: `Chamado: ${tk.subject}`,
        subtitle: `${tk.customer_name || 'Cliente'} · ${tk.status}`,
        createdAt: tk.updated_at,
      })),
      ...audits.slice(0, 4).map((au) => ({
        id: `aud-${au.id}`,
        type: 'audit' as const,
        title: `Ação: ${au.action}`,
        subtitle: au.record_id ? `Registro ${au.record_id.slice(0, 8)}` : 'Sistema',
        createdAt: au.created_at,
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 14);

    const unreadNotifications = (
      db.prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE read_at IS NULL').get() as { cnt: number }
    ).cnt;

    const pendingGroupRequests = (
      db
        .prepare("SELECT COUNT(*) AS cnt FROM vip_group_requests WHERE status = 'pendente_whatsapp'")
        .get() as { cnt: number }
    ).cnt;

    const alerts: Array<{ id: string; severity: 'warn' | 'info' | 'err'; text: string; targetTab: string }> = [];
    if (pendingProofs.length > 0) {
      alerts.push({
        id: 'alert-proofs',
        severity: 'warn',
        text: `${pendingProofs.length} comprovante(s) aguardando análise manual.`,
        targetTab: 'proofs',
      });
    }
    if (openSupportTickets > 0) {
      alerts.push({
        id: 'alert-support',
        severity: 'warn',
        text: `${openSupportTickets} chamado(s) de suporte em aberto aguardando retorno.`,
        targetTab: 'support',
      });
    }
    if (pendingGroupRequests > 0) {
      alerts.push({
        id: 'alert-vip-group',
        severity: 'info',
        text: `${pendingGroupRequests} solicitação(ões) de entrada no Grupo VIP pendente(s).`,
        targetTab: 'vip-group',
      });
    }
    if (expiringSubscriptionsList.length > 0) {
      alerts.push({
        id: 'alert-expiring',
        severity: 'warn',
        text: `${expiringSubscriptionsList.length} assinatura(s) vencem nos próximos 5 dias.`,
        targetTab: 'subscriptions',
      });
    }
    if (inconsistentOrders > 0) {
      alerts.push({
        id: 'alert-inconsistent',
        severity: 'err',
        text: `${inconsistentOrders} pedido(s) com inconsistência de datas/status detectados.`,
        targetTab: 'diagnostics',
      });
    }
    if (securityWarnings > 0) {
      alerts.push({
        id: 'alert-security',
        severity: 'err',
        text: `${securityWarnings} evento(s) de bloqueio/acesso negado nos últimos 7 dias.`,
        targetTab: 'audit',
      });
    }
    if (!supabaseConfigured || !mercadoPagoToken) {
      alerts.push({
        id: 'alert-integrations',
        severity: 'info',
        text: 'Integrações externas pendentes de variáveis de ambiente no servidor.',
        targetTab: 'integrations',
      });
    }

    res.json({
      period,
      metrics: {
        totalClients: clients.length,
        activeClients: clients.filter((c) => !c.suspended).length,
        newClientsCount,
        validSubscribers: validSubscriberIds.size,
        conversionRatePercent,
        expiringSubscriptions: expiringSubscriptionsList.length,
        approvedPayments: approvedPayments.length,
        pendingPayments: pendingPayments.length,
        pendingProofs: pendingProofs.length,
        rejectedPayments: rejectedPayments.length,
        canceledPayments: payments.filter((p) => p.status === 'cancelado').length,
        refundedPayments: payments.filter((p) => p.status === 'reembolsado').length,
        expiredSubscriptions: expiredSubscriptions.length,
        openSupportTickets,
        activeCoupons,
        inconsistentOrders,
        securityWarnings,
        totalRevenueCents: sumCents(confirmedRevenueRows),
        monthRevenueCents: sumCents(monthRevenueRows),
        periodRevenueCents: sumCents(periodRevenueRows),
        weeklyRevenueCents: sumCents(weeklyRows),
        monthlyRevenueCents: sumCents(monthlyRows),
        lifetimeRevenueCents: sumCents(lifetimeRows),
        unreadNotifications,
      },
      revenueByPlan,
      statusBreakdown,
      dailyRevenue,
      dailySignups,
      recentSignups: clients.slice(0, 6).map((c) => ({
        id: c.id,
        displayName: c.display_name,
        email: c.email,
        createdAt: c.created_at,
      })),
      recentSales,
      recentActivities,
      alerts,
      integrationStatus: {
        supabaseConfigured,
        mercadoPagoConfigured: Boolean(mercadoPagoToken),
        webhookSecretConfigured,
        storageMode: supabaseConfigured ? 'supabase' : 'sqlite_local',
      },
    });
  });

  // -------------------------------------------------------------------------
  // 2. Customers Management (Create Client + Admin Notes)
  // -------------------------------------------------------------------------
  app.post('/api/admin/customers', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageClients')) {
      res.status(403).json({ error: 'Sem permissão para cadastrar clientes.' });
      return;
    }

    const displayName = String(req.body?.displayName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    const birthDate = String(req.body?.birthDate || '1995-01-01').trim();
    const password = String(req.body?.password || '').trim();
    const adminNotes = String(req.body?.adminNotes || '').trim() || null;

    if (displayName.length < 3) {
      res.status(400).json({ error: 'Informe nome completo (mínimo 3 caracteres).' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      res.status(400).json({ error: 'Informe um telefone válido com DDD.' });
      return;
    }
    if (!isAdult(birthDate)) {
      res.status(400).json({ error: 'Cliente deve ser maior de 18 anos.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Informe uma senha inicial de no mínimo 6 caracteres.' });
      return;
    }

    const exists = db.prepare('SELECT id FROM profiles WHERE lower(email) = ?').get(email);
    if (exists) {
      res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO profiles (
        id, display_name, username, email, phone, birth_date, password_hash,
        role, suspended, admin_notes, terms_accepted_at, privacy_accepted_at, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'client', 0, ?, ?, ?, ?, ?)
    `).run(id, displayName, email, phone, birthDate, hashPassword(password), adminNotes, now, now, now, now);

    logAudit(req.user!.id, 'criar_cliente_admin', id, { displayName, email });
    res.status(201).json({ ok: true, id });
  });

  app.patch('/api/admin/customers/:id/notes', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageClients')) {
      res.status(403).json({ error: 'Sem permissão para editar observações de clientes.' });
      return;
    }
    const target = db.prepare('SELECT id, display_name FROM profiles WHERE id = ?').get(req.params.id) as any;
    if (!target) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    const notes = String(req.body?.adminNotes || '').trim() || null;
    db.prepare('UPDATE profiles SET admin_notes = ?, updated_at = ? WHERE id = ?').run(
      notes,
      new Date().toISOString(),
      target.id
    );
    logAudit(req.user!.id, 'atualizar_observacao_cliente', target.id, { displayName: target.display_name });
    res.json({ ok: true, adminNotes: notes });
  });

  // -------------------------------------------------------------------------
  // 4. Comprovantes Queue (Dedicated mobile review queue)
  // -------------------------------------------------------------------------
  app.get('/api/admin/proofs', requireAdmin, (req: AuthedRequest, res: Response) => {
    const statusFilter = String(req.query?.status || 'all');
    const rows = db
      .prepare(`
        SELECT pr.*, pay.plan_key, pay.amount_cents, pay.external_reference,
               prof.display_name AS customer_name, prof.email AS customer_email, prof.phone AS customer_phone
        FROM payment_proofs pr
        JOIN payments pay ON pay.id = pr.payment_id
        JOIN profiles prof ON prof.id = pr.user_id
        ORDER BY
          CASE WHEN pr.status IN ('aguardando_analise', 'em_analise') THEN 0 ELSE 1 END,
          pr.created_at DESC
      `)
      .all() as any[];

    const mapped = rows
      .filter((r) => statusFilter === 'all' || r.status === statusFilter)
      .map((pr) => ({
        id: pr.id,
        paymentId: pr.payment_id,
        userId: pr.user_id,
        originalFilename: pr.original_filename,
        mimeType: pr.mime_type,
        sizeBytes: pr.size_bytes,
        status: pr.status,
        extractedAmountCents: pr.extracted_amount_cents,
        extractedReference: pr.extracted_reference,
        reviewNotes: pr.review_notes,
        reviewedBy: pr.reviewed_by,
        reviewedAt: pr.reviewed_at,
        createdAt: pr.created_at,
        customerName: pr.customer_name,
        customerEmail: pr.customer_email,
        customerPhone: pr.customer_phone,
        planKey: pr.plan_key,
        amountCents: pr.amount_cents,
        externalReference: pr.external_reference,
      }));

    res.json({ proofs: mapped });
  });

  // -------------------------------------------------------------------------
  // 5. Assinaturas Management (List, Extend, Revoke, Sweep)
  // -------------------------------------------------------------------------
  app.get('/api/admin/subscriptions', requireAdmin, (_req: AuthedRequest, res: Response) => {
    expireOverdueSubscriptions();
    const rows = db
      .prepare(`
        SELECT pay.*, prof.display_name AS customer_name, prof.email AS customer_email,
               prof.phone AS customer_phone, prof.suspended AS customer_suspended
        FROM payments pay
        JOIN profiles prof ON prof.id = pay.user_id
        WHERE pay.status IN ('aprovado', 'expirado', 'recusado', 'cancelado', 'reembolsado')
        ORDER BY
          CASE WHEN pay.status = 'aprovado' THEN 0 WHEN pay.status = 'expirado' THEN 1 ELSE 2 END,
          COALESCE(pay.expires_at, '9999-12-31') ASC
      `)
      .all() as any[];

    const nowMs = Date.now();
    const subscriptions = rows.map((r) => {
      const daysRemaining = r.expires_at
        ? Math.ceil((new Date(r.expires_at).getTime() - nowMs) / (24 * 60 * 60 * 1000))
        : null;
      return {
        id: r.id,
        userId: r.user_id,
        customerName: r.customer_name,
        customerEmail: r.customer_email,
        customerPhone: r.customer_phone,
        customerSuspended: Boolean(r.customer_suspended),
        planKey: r.plan_key,
        amountCents: r.amount_cents,
        activationOrigin: r.activation_origin || r.provider || null,
        status: r.status,
        approvedAt: r.approved_at,
        expiresAt: r.expires_at,
        daysRemaining,
        rejectionReason: r.rejection_reason,
      };
    });

    res.json({ subscriptions });
  });

  app.post('/api/admin/subscriptions/:paymentId/extend', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageClients')) {
      res.status(403).json({ error: 'Sem permissão para estender assinaturas.' });
      return;
    }
    const days = Number(req.body?.days || 0);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      res.status(400).json({ error: 'Informe um número de dias entre 1 e 365.' });
      return;
    }

    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.paymentId) as any;
    if (!pay) {
      res.status(404).json({ error: 'Assinatura não encontrada.' });
      return;
    }
    if (pay.plan_key === 'vitalicio') {
      res.status(400).json({ error: 'Assinatura vitalícia não possui expiração.' });
      return;
    }

    const baseDate =
      pay.expires_at && new Date(pay.expires_at).getTime() > Date.now()
        ? new Date(pay.expires_at)
        : new Date();
    const nextExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    db.prepare(`
      UPDATE payments
      SET status = 'aprovado',
          activation_origin = COALESCE(activation_origin, 'extensao_admin'),
          expires_at = ?,
          approved_at = COALESCE(approved_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(nextExpiry, nowIso, nowIso, pay.id);

    dispatchUserCommunication(db, {
      userId: pay.user_id,
      eventKey: 'renewed',
      vars: { plano: pay.plan_key },
    });

    logAudit(req.user!.id, 'estender_assinatura', pay.id, { days, nextExpiry });
    res.json({ ok: true, expiresAt: nextExpiry });
  });

  app.post('/api/admin/subscriptions/:paymentId/revoke', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageClients')) {
      res.status(403).json({ error: 'Sem permissão para revogar assinaturas.' });
      return;
    }
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.paymentId) as any;
    if (!pay) {
      res.status(404).json({ error: 'Assinatura não encontrada.' });
      return;
    }
    const reason = String(req.body?.reason || 'Acesso revogado manualmente pela administração.').trim();
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE payments
      SET status = 'expirado', expires_at = ?, rejection_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, reason, nowIso, pay.id);

    logAudit(req.user!.id, 'revogar_assinatura', pay.id, { reason });
    res.json({ ok: true });
  });

  app.post('/api/admin/subscriptions/sweep', requireAdmin, (req: AuthedRequest, res: Response) => {
    const expiredCount = expireOverdueSubscriptions();
    logAudit(req.user!.id, 'varredura_assinaturas_vencidas', 'payments', { expiredCount });
    res.json({ ok: true, expiredCount });
  });

  // -------------------------------------------------------------------------
  // 6. Grupo VIP — Solicitações de Entrada (WhatsApp Nicolly Flow)
  // -------------------------------------------------------------------------
  app.get('/api/admin/group-requests', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare(`
        SELECT r.*, p.display_name AS customer_name, p.email AS customer_email, p.phone AS customer_phone
        FROM vip_group_requests r
        JOIN profiles p ON p.id = r.user_id
        ORDER BY
          CASE WHEN r.status = 'pendente_whatsapp' THEN 0 ELSE 1 END,
          r.created_at DESC
      `)
      .all() as any[];

    res.json({
      requests: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        customerName: r.customer_name,
        customerEmail: r.customer_email,
        customerPhone: r.customer_phone,
        planKey: r.plan_key,
        status: r.status,
        adminNotes: r.admin_notes,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at,
        createdAt: r.created_at,
      })),
    });
  });

  app.patch('/api/admin/group-requests/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const decision = String(req.body?.status || '') as 'aceito_no_grupo' | 'recusado_no_grupo';
    const notes = String(req.body?.adminNotes || '').trim() || null;

    if (!['aceito_no_grupo', 'recusado_no_grupo'].includes(decision)) {
      res.status(400).json({ error: 'Status de entrada no grupo inválido.' });
      return;
    }

    const row = db.prepare('SELECT * FROM vip_group_requests WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Solicitação não encontrada.' });
      return;
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE vip_group_requests
      SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = ?
      WHERE id = ?
    `).run(decision, notes, req.user!.id, nowIso, row.id);

    logAudit(req.user!.id, `grupo_vip_${decision}`, row.id, { userId: row.user_id, notes });
    res.json({ ok: true, status: decision });
  });

  // -------------------------------------------------------------------------
  // 7. Planos (Edição completa para novas compras + histórico sem afetar antigas)
  // -------------------------------------------------------------------------
  app.get('/api/admin/plans/history', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const row = db.prepare("SELECT value FROM site_settings WHERE key = 'plan_history'").get() as { value: string } | undefined;
    let history: any[] = [];
    if (row) {
      try {
        history = JSON.parse(row.value);
      } catch {
        history = [];
      }
    }
    res.json({ history });
  });

  app.put('/api/admin/plans', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageSettings')) {
      res.status(403).json({ error: 'Sem permissão para alterar planos.' });
      return;
    }
    const incomingPlans = req.body?.plans;
    if (!incomingPlans || typeof incomingPlans !== 'object') {
      res.status(400).json({ error: 'Payload de planos inválido.' });
      return;
    }

    const current = getSiteSettings();
    const updatedPlans: Record<PlanKey, PlanConfig> = { ...current.plans };
    const changes: Array<{ planKey: string; oldPrice: string; newPrice: string; active: boolean }> = [];

    for (const key of ['semanal', 'mensal', 'vitalicio'] as PlanKey[]) {
      const inc = incomingPlans[key];
      if (!inc) continue;
      const link = String(inc.link || updatedPlans[key].link).trim();
      if (!/^https:\/\//.test(link)) {
        res.status(400).json({ error: `O link do plano ${key} deve começar com https://` });
        return;
      }
      const preco = String(inc.preco || updatedPlans[key].preco).trim();
      const amountCents = parseBrlToCents(preco);
      if (!amountCents || amountCents < 100) {
        res.status(400).json({ error: `Informe um valor válido para o plano ${key}.` });
        return;
      }
      const duracao = key === 'vitalicio' ? 0 : Math.max(1, Number(inc.duracao || updatedPlans[key].duracao));
      const active = inc.active !== undefined ? Boolean(inc.active) : updatedPlans[key].active !== false;

      if (preco !== updatedPlans[key].preco || active !== (updatedPlans[key].active !== false)) {
        changes.push({ planKey: key, oldPrice: updatedPlans[key].preco, newPrice: preco, active });
      }

      updatedPlans[key] = {
        name: String(inc.name || updatedPlans[key].name).trim(),
        preco,
        amountCents,
        duracao,
        link,
        active,
        offerBadge: String(inc.offerBadge ?? updatedPlans[key].offerBadge ?? '').trim(),
        description: String(inc.description ?? updatedPlans[key].description ?? '').trim(),
      };
    }

    const now = new Date().toISOString();
    upsertSetting.run('plans', JSON.stringify(updatedPlans), now, req.user!.id);

    // Record plan edit history
    const histRow = db.prepare("SELECT value FROM site_settings WHERE key = 'plan_history'").get() as { value: string } | undefined;
    let history: any[] = [];
    try {
      history = histRow ? JSON.parse(histRow.value) : [];
    } catch {
      history = [];
    }
    history.unshift({
      id: crypto.randomUUID(),
      adminName: req.user!.displayName,
      changes,
      snapshot: updatedPlans,
      createdAt: now,
    });
    upsertSetting.run('plan_history', JSON.stringify(history.slice(0, 30)), now, req.user!.id);

    logAudit(req.user!.id, 'atualizar_planos', 'plans', { changes });
    res.json({ ok: true, plans: updatedPlans });
  });

  // -------------------------------------------------------------------------
  // 8 & 9. Financeiro & Relatórios (CSV Export + Date Range)
  // -------------------------------------------------------------------------
  app.get('/api/admin/finance', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageFinance')) {
      res.status(403).json({ error: 'Sem permissão para acessar dados financeiros.' });
      return;
    }

    const fromDate = String(req.query?.from || '').trim();
    const toDate = String(req.query?.to || '').trim();
    const statusFilter = String(req.query?.status || 'confirmed').trim();

    const payments = db
      .prepare(`
        SELECT pay.*, prof.display_name AS customer_name, prof.email AS customer_email
        FROM payments pay
        JOIN profiles prof ON prof.id = pay.user_id
        ORDER BY COALESCE(pay.approved_at, pay.created_at) DESC
      `)
      .all() as any[];

    const inRange = (p: any) => {
      const refDate = (p.approved_at || p.created_at).slice(0, 10);
      if (fromDate && refDate < fromDate) return false;
      if (toDate && refDate > toDate) return false;
      return true;
    };

    const filtered = payments.filter(inRange);
    const confirmed = filtered.filter((p) => p.status === 'aprovado' || p.status === 'expirado');
    const pending = filtered.filter((p) => ['aguardando_pagamento', 'aguardando_analise', 'em_analise'].includes(p.status));
    const rejected = filtered.filter((p) => p.status === 'recusado');
    const canceled = filtered.filter((p) => p.status === 'cancelado');
    const refunded = filtered.filter((p) => p.status === 'reembolsado');

    const totalConfirmedCents = confirmed.reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
    const pendingPotentialCents = pending.reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
    const canceledCents = canceled.reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
    const refundedCents = refunded.reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
    const averageTicketCents = confirmed.length > 0 ? Math.round(totalConfirmedCents / confirmed.length) : 0;

    // Today, current month, previous month, and annual totals
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currMonth = now.toISOString().slice(0, 7);
    const currYear = now.toISOString().slice(0, 4);
    const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonth = prevDate.toISOString().slice(0, 7);

    const allConfirmed = payments.filter((p) => p.status === 'aprovado' || p.status === 'expirado');
    const todayConfirmedCents = allConfirmed
      .filter((p) => (p.approved_at || p.created_at).slice(0, 10) === todayStr)
      .reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
    const currentMonthCents = allConfirmed
      .filter((p) => (p.approved_at || p.created_at).slice(0, 7) === currMonth)
      .reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
    const previousMonthCents = allConfirmed
      .filter((p) => (p.approved_at || p.created_at).slice(0, 7) === prevMonth)
      .reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
    const currentYearCents = allConfirmed
      .filter((p) => (p.approved_at || p.created_at).slice(0, 4) === currYear)
      .reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);

    const byPlan = (['semanal', 'mensal', 'vitalicio'] as PlanKey[]).map((k) => {
      const rows = confirmed.filter((p) => p.plan_key === k);
      return {
        planKey: k,
        count: rows.length,
        revenueCents: rows.reduce((acc, p) => acc + Number(p.amount_cents || 0), 0),
      };
    });

    const ledgerRows =
      statusFilter === 'all'
        ? filtered
        : statusFilter === 'pending'
        ? pending
        : statusFilter === 'rejected'
        ? rejected
        : statusFilter === 'canceled'
        ? canceled
        : statusFilter === 'refunded'
        ? refunded
        : confirmed;

    res.json({
      summary: {
        todayConfirmedCents,
        totalConfirmedCents,
        confirmedCount: confirmed.length,
        pendingPotentialCents,
        pendingCount: pending.length,
        rejectedCount: rejected.length,
        canceledCount: canceled.length,
        canceledCents,
        refundedCount: refunded.length,
        refundedCents,
        averageTicketCents,
        currentMonthCents,
        previousMonthCents,
        currentYearCents,
      },
      byPlan,
      transactions: ledgerRows.slice(0, 200).map((p) => ({
        id: p.id,
        customerName: p.customer_name,
        customerEmail: p.customer_email,
        planKey: p.plan_key,
        amountCents: p.amount_cents,
        discountCents: p.discount_cents || 0,
        couponCode: p.coupon_code || null,
        status: p.status,
        provider: p.provider,
        externalReference: p.external_reference,
        approvedAt: p.approved_at || p.created_at,
        expiresAt: p.expires_at,
      })),
    });
  });

  app.get('/api/admin/export/:kind', requireAdmin, (req: AuthedRequest, res: Response) => {
    const kind = String(req.params.kind || '');
    const nowDate = new Date().toISOString().slice(0, 10);
    let csv = '';

    if (kind === 'customers') {
      const rows = db.prepare("SELECT * FROM profiles WHERE role = 'client' ORDER BY created_at DESC").all() as any[];
      const headers = ['ID', 'Nome', 'Email', 'Telefone', 'Nascimento', 'Status', 'Assinatura', 'Plano', 'Validade', 'Cadastro'];
      const lines = rows.map((r) => {
        const sub = getUserSubscriptionSummary(r.id, Boolean(r.suspended));
        return [
          r.id,
          r.display_name,
          r.email,
          r.phone,
          r.birth_date,
          r.suspended ? 'Suspenso' : 'Ativo',
          sub.statusLabel,
          sub.planName || '',
          sub.expiresAt || '',
          r.created_at,
        ].map(escapeCsvCell).join(';');
      });
      csv = '\uFEFF' + [headers.join(';'), ...lines].join('\n');
    } else if (kind === 'payments' || kind === 'finance') {
      const onlyConfirmed = kind === 'finance';
      const rows = db
        .prepare(`
          SELECT pay.*, prof.display_name AS customer_name, prof.email AS customer_email
          FROM payments pay
          JOIN profiles prof ON prof.id = pay.user_id
          ${onlyConfirmed ? "WHERE pay.status IN ('aprovado', 'expirado')" : ''}
          ORDER BY pay.created_at DESC
        `)
        .all() as any[];
      const headers = ['ID', 'Cliente', 'Email', 'Plano', 'Valor_BRL', 'Cupom', 'Desconto_BRL', 'Status', 'Provedor', 'Origem', 'Referencia', 'Aprovado_Em', 'Vencimento', 'Criado_Em'];
      const lines = rows.map((p) =>
        [
          p.id,
          p.customer_name,
          p.customer_email,
          p.plan_key,
          (Number(p.amount_cents || 0) / 100).toFixed(2).replace('.', ','),
          p.coupon_code || '',
          (Number(p.discount_cents || 0) / 100).toFixed(2).replace('.', ','),
          p.status,
          p.provider,
          p.activation_origin || '',
          p.external_reference,
          p.approved_at || '',
          p.expires_at || '',
          p.created_at,
        ].map(escapeCsvCell).join(';')
      );
      csv = '\uFEFF' + [headers.join(';'), ...lines].join('\n');
    } else if (kind === 'subscriptions') {
      expireOverdueSubscriptions();
      const rows = db
        .prepare(`
          SELECT pay.*, prof.display_name AS customer_name, prof.email AS customer_email, prof.phone AS customer_phone
          FROM payments pay
          JOIN profiles prof ON prof.id = pay.user_id
          WHERE pay.status IN ('aprovado', 'expirado')
          ORDER BY pay.created_at DESC
        `)
        .all() as any[];
      const headers = ['ID_Assinatura', 'Cliente', 'Email', 'Telefone', 'Plano', 'Status', 'Origem', 'Inicio', 'Vencimento'];
      const lines = rows.map((r) =>
        [
          r.id,
          r.customer_name,
          r.customer_email,
          r.customer_phone,
          r.plan_key,
          r.status,
          r.activation_origin || r.provider,
          r.approved_at || '',
          r.expires_at || 'Vitalício',
        ]
          .map(escapeCsvCell)
          .join(';')
      );
      csv = '\uFEFF' + [headers.join(';'), ...lines].join('\n');
    } else if (kind === 'vip-access') {
      const rows = db
        .prepare(`
          SELECT r.*, p.display_name AS customer_name, p.email AS customer_email, p.phone AS customer_phone
          FROM vip_group_requests r
          JOIN profiles p ON p.id = r.user_id
          ORDER BY r.created_at DESC
        `)
        .all() as any[];
      const headers = ['ID', 'Cliente', 'Email', 'Telefone', 'Plano', 'Status_Grupo', 'Observacao', 'Solicitado_Em'];
      const lines = rows.map((r) =>
        [r.id, r.customer_name, r.customer_email, r.customer_phone, r.plan_key, r.status, r.admin_notes || '', r.created_at]
          .map(escapeCsvCell)
          .join(';')
      );
      csv = '\uFEFF' + [headers.join(';'), ...lines].join('\n');
    } else if (kind === 'coupons') {
      const rows = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all() as any[];
      const headers = ['ID', 'Codigo', 'Tipo', 'Valor', 'Planos', 'Usos', 'Limite', 'Ativo', 'Validade', 'Criado_Em'];
      const lines = rows.map((c) =>
        [
          c.id,
          c.code,
          c.discount_type,
          c.discount_type === 'percent' ? `${c.discount_value}%` : `R$ ${(c.discount_value / 100).toFixed(2).replace('.', ',')}`,
          c.applicable_plans,
          c.used_count,
          c.max_uses ?? 'Ilimitado',
          c.active ? 'Sim' : 'Não',
          c.valid_until || 'Sem vencimento',
          c.created_at,
        ]
          .map(escapeCsvCell)
          .join(';')
      );
      csv = '\uFEFF' + [headers.join(';'), ...lines].join('\n');
    } else if (kind === 'audit') {
      const rows = db
        .prepare(`
          SELECT a.*, p.display_name AS admin_name
          FROM audit_logs a
          LEFT JOIN profiles p ON p.id = a.admin_id
          ORDER BY a.created_at DESC LIMIT 500
        `)
        .all() as any[];
      const headers = ['ID', 'Administrador', 'Acao', 'Registro', 'Resultado', 'Detalhes', 'Data'];
      const lines = rows.map((a) =>
        [a.id, a.admin_name || 'Sistema', a.action, a.record_id || '', a.result || 'sucesso', a.details || '{}', a.created_at]
          .map(escapeCsvCell)
          .join(';')
      );
      csv = '\uFEFF' + [headers.join(';'), ...lines].join('\n');
    } else {
      res.status(400).json({ error: 'Tipo de relatório inválido.' });
      return;
    }

    logAudit(req.user!.id, 'exportar_relatorio_csv', kind, { date: nowDate });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vip-nicolly-${kind}-${nowDate}.csv"`);
    res.send(csv);
  });

  // -------------------------------------------------------------------------
  // 10. Notificações Administrativas Persistentes
  // -------------------------------------------------------------------------
  app.get('/api/admin/notifications', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const rows = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 80').all() as any[];
    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        targetTab: n.target_tab,
        recordId: n.record_id,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
    });
  });

  app.patch('/api/admin/notifications/:id/read', requireAdmin, (req: AuthedRequest, res: Response) => {
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?').run(nowIso, req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/admin/notifications/read-all', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(nowIso);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // 12. Aparência do Site (Draft + Preview + Publish)
  // -------------------------------------------------------------------------
  app.get('/api/admin/appearance', requireAdmin, (_req: AuthedRequest, res: Response) => {
    res.json({
      published: getPublishedAppearance(),
      draft: getDraftAppearance(),
      controls: getSystemControls(),
    });
  });

  app.put('/api/admin/appearance/draft', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageSettings')) {
      res.status(403).json({ error: 'Sem permissão para editar aparência.' });
      return;
    }
    const base = getDraftAppearance();
    const inc = req.body?.appearance || {};
    const safeUrlOrLocal = (val: unknown, fallback: string) => {
      const s = String(val ?? '').trim();
      if (!s) return fallback;
      if (s.startsWith('/') || /^https?:\/\//i.test(s)) return s;
      return fallback;
    };
    const merged: SiteAppearanceConfig = {
      siteName: String(inc.siteName ?? base.siteName).trim() || base.siteName,
      logoText: String(inc.logoText ?? base.logoText).trim() || base.logoText,
      primaryColor: /^#[0-9a-fA-F]{6}$/.test(inc.primaryColor) ? inc.primaryColor : base.primaryColor,
      secondaryColor: /^#[0-9a-fA-F]{6}$/.test(inc.secondaryColor) ? inc.secondaryColor : base.secondaryColor,
      backgroundColor: /^#[0-9a-fA-F]{6}$/.test(inc.backgroundColor) ? inc.backgroundColor : base.backgroundColor,
      faviconColor: /^#[0-9a-fA-F]{6}$/.test(inc.faviconColor) ? inc.faviconColor : base.faviconColor,
      heroImageUrl: safeUrlOrLocal(inc.heroImageUrl, base.heroImageUrl),
      vipBannerUrl: safeUrlOrLocal(inc.vipBannerUrl, base.vipBannerUrl),
      heroTitle: String(inc.heroTitle ?? base.heroTitle).trim(),
      heroSubtitle: String(inc.heroSubtitle ?? base.heroSubtitle).trim(),
      welcomeMessage: String(inc.welcomeMessage ?? base.welcomeMessage).trim(),
      vipTitle: String(inc.vipTitle ?? base.vipTitle).trim(),
      vipDescription: String(inc.vipDescription ?? base.vipDescription).trim(),
      paymentText: String(inc.paymentText ?? base.paymentText).trim(),
      approvedMessage: String(inc.approvedMessage ?? base.approvedMessage).trim(),
      expiredMessage: String(inc.expiredMessage ?? base.expiredMessage).trim(),
      loginButtonLabel: String(inc.loginButtonLabel ?? base.loginButtonLabel).trim() || base.loginButtonLabel,
      registerButtonLabel: String(inc.registerButtonLabel ?? base.registerButtonLabel).trim() || base.registerButtonLabel,
      vipGroupButtonLabel: String(inc.vipGroupButtonLabel ?? base.vipGroupButtonLabel).trim() || base.vipGroupButtonLabel,
      supportTitle: String(inc.supportTitle ?? base.supportTitle).trim() || base.supportTitle,
      supportDescription: String(inc.supportDescription ?? base.supportDescription).trim() || base.supportDescription,
      supportHours: String(inc.supportHours ?? base.supportHours).trim() || base.supportHours,
      footerText: String(inc.footerText ?? base.footerText).trim(),
      termsText: String(inc.termsText ?? base.termsText),
      privacyText: String(inc.privacyText ?? base.privacyText),
      offerBannerText: String(inc.offerBannerText ?? base.offerBannerText).trim(),
      showOfferBanner: Boolean(inc.showOfferBanner ?? base.showOfferBanner),
    };

    const now = new Date().toISOString();
    upsertSetting.run('site_appearance_draft', JSON.stringify(merged), now, req.user!.id);
    logAudit(req.user!.id, 'salvar_rascunho_aparencia', 'site_appearance_draft', {});
    res.json({ ok: true, draft: merged });
  });

  app.post('/api/admin/appearance/publish', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageSettings')) {
      res.status(403).json({ error: 'Sem permissão para publicar aparência.' });
      return;
    }
    const source = req.body?.appearance
      ? { ...getDraftAppearance(), ...req.body.appearance }
      : getDraftAppearance();
    const now = new Date().toISOString();
    upsertSetting.run('site_appearance_draft', JSON.stringify(source), now, req.user!.id);
    upsertSetting.run('site_appearance', JSON.stringify(source), now, req.user!.id);
    upsertSetting.run('hero', JSON.stringify(source.welcomeMessage || getSiteSettings().hero), now, req.user!.id);

    logAudit(req.user!.id, 'publicar_aparencia_site', 'site_appearance', { siteName: source.siteName });
    createNotification({
      type: 'admin_change',
      title: 'Aparência do site publicada',
      message: `${req.user!.displayName} publicou alterações visuais e de texto no site.`,
      targetTab: 'appearance',
    });
    res.json({ ok: true, published: source });
  });

  // -------------------------------------------------------------------------
  // 13 & 14. Permissões de Admin, Desativação, Reset de Senha e Sessões
  // -------------------------------------------------------------------------
  app.patch('/api/admin/admins/:id/permissions', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageAdmins')) {
      res.status(403).json({ error: 'Sem permissão para editar permissões administrativas.' });
      return;
    }
    const target = db.prepare("SELECT id, username FROM profiles WHERE id = ? AND role = 'admin'").get(req.params.id) as any;
    if (!target) {
      res.status(404).json({ error: 'Administrador não encontrado.' });
      return;
    }
    const p = req.body?.permissions || {};
    const nextPerms: AdminPermissions = {
      canManageClients: Boolean(p.canManageClients),
      canManageFinance: Boolean(p.canManageFinance),
      canManageSettings: Boolean(p.canManageSettings),
      canManageAdmins: req.params.id === req.user!.id ? true : Boolean(p.canManageAdmins),
    };
    db.prepare('UPDATE profiles SET permissions = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(nextPerms),
      new Date().toISOString(),
      target.id
    );
    logAudit(req.user!.id, 'atualizar_permissoes_admin', target.id, { username: target.username, nextPerms });
    res.json({ ok: true, permissions: nextPerms });
  });

  app.patch('/api/admin/admins/:id/suspend', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageAdmins')) {
      res.status(403).json({ error: 'Sem permissão para ativar ou desativar administradores.' });
      return;
    }
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: 'Você não pode desativar sua própria conta administrativa.' });
      return;
    }
    const target = db.prepare("SELECT id, username, suspended FROM profiles WHERE id = ? AND role = 'admin'").get(req.params.id) as any;
    if (!target) {
      res.status(404).json({ error: 'Administrador não encontrado.' });
      return;
    }
    const suspended = Boolean(req.body?.suspended);
    if (suspended) {
      const activeAdminsCount = (
        db.prepare("SELECT COUNT(*) AS cnt FROM profiles WHERE role = 'admin' AND suspended = 0").get() as { cnt: number }
      ).cnt;
      if (activeAdminsCount <= 1) {
        res.status(400).json({ error: 'É obrigatório manter ao menos um administrador ativo.' });
        return;
      }
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    }
    db.prepare('UPDATE profiles SET suspended = ?, updated_at = ? WHERE id = ?').run(
      suspended ? 1 : 0,
      new Date().toISOString(),
      target.id
    );
    logAudit(req.user!.id, suspended ? 'desativar_administrador' : 'reativar_administrador', target.id, {
      username: target.username,
    });
    res.json({ ok: true, suspended });
  });

  app.post('/api/admin/admins/:id/reset-password', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageAdmins')) {
      res.status(403).json({ error: 'Sem permissão para redefinir senha de administradores.' });
      return;
    }
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'A nova senha deve possuir no mínimo 6 caracteres.' });
      return;
    }
    const target = db.prepare("SELECT id, username FROM profiles WHERE id = ? AND role = 'admin'").get(req.params.id) as any;
    if (!target) {
      res.status(404).json({ error: 'Administrador não encontrado.' });
      return;
    }
    db.prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      new Date().toISOString(),
      target.id
    );
    if (target.id !== req.user!.id) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    }
    logAudit(req.user!.id, 'redefinir_senha_administrador', target.id, { username: target.username });
    res.json({ ok: true, message: `Senha de ${target.username} redefinida com segurança.` });
  });

  app.get('/api/admin/security/sessions', requireAdmin, (req: AuthedRequest, res: Response) => {
    const nowIso = new Date().toISOString();
    const rows = db
      .prepare(`
        SELECT s.id, s.user_id, s.expires_at, s.created_at, p.display_name, p.email, p.role, p.username
        FROM sessions s
        JOIN profiles p ON p.id = s.user_id
        WHERE s.expires_at > ?
        ORDER BY s.created_at DESC
        LIMIT 50
      `)
      .all(nowIso) as any[];

    res.json({
      sessions: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        displayName: r.display_name,
        email: r.email,
        username: r.username,
        role: r.role,
        isCurrent: r.id === req.sessionId,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
      controls: getSystemControls(),
    });
  });

  app.post('/api/admin/security/revoke-other-sessions', requireAdmin, (req: AuthedRequest, res: Response) => {
    const currentSid = req.sessionId || '';
    const info = db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(req.user!.id, currentSid);
    logAudit(req.user!.id, 'encerrar_outras_sessoes', req.user!.id, { revokedCount: info.changes });
    res.json({ ok: true, revokedCount: info.changes });
  });

  app.delete('/api/admin/security/sessions/:sessionId', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (req.params.sessionId === req.sessionId) {
      res.status(400).json({ error: 'Use o botão Sair para encerrar a sessão atual.' });
      return;
    }
    const info = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.sessionId);
    logAudit(req.user!.id, 'encerrar_sessao_especifica', req.params.sessionId, { deleted: info.changes });
    res.json({ ok: true });
  });

  app.put('/api/admin/security/controls', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageSettings')) {
      res.status(403).json({ error: 'Sem permissão para alterar controles do sistema.' });
      return;
    }
    const cur = getSystemControls();
    const b = req.body || {};
    const next: SystemControlsConfig = {
      registrationEnabled: b.registrationEnabled !== undefined ? Boolean(b.registrationEnabled) : cur.registrationEnabled,
      maintenanceMode: b.maintenanceMode !== undefined ? Boolean(b.maintenanceMode) : cur.maintenanceMode,
      maintenanceMessage: String(b.maintenanceMessage ?? cur.maintenanceMessage).trim() || cur.maintenanceMessage,
      notifyNewClient: b.notifyNewClient !== undefined ? Boolean(b.notifyNewClient) : cur.notifyNewClient,
      notifyNewProof: b.notifyNewProof !== undefined ? Boolean(b.notifyNewProof) : cur.notifyNewProof,
      notifyExpiring: b.notifyExpiring !== undefined ? Boolean(b.notifyExpiring) : cur.notifyExpiring,
    };
    const now = new Date().toISOString();
    upsertSetting.run('system_controls', JSON.stringify(next), now, req.user!.id);
    logAudit(req.user!.id, 'atualizar_controles_sistema', 'system_controls', next as unknown as Record<string, unknown>);
    res.json({ ok: true, controls: next });
  });

  // -------------------------------------------------------------------------
  // 16. Integrações (Mercado Pago & Supabase — sem expor chaves secretas!)
  // -------------------------------------------------------------------------
  app.get('/api/admin/integrations/status', requireAdmin, (req: AuthedRequest, res: Response) => {
    const events = getIntegrationEvents();
    const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({
      mercadoPago: {
        configured: Boolean(mercadoPagoToken),
        tokenMasked: maskToken(mercadoPagoToken),
        webhookSecretConfigured: webhookSecretConfigured,
        webhookUrl: `${appUrl}/api/webhooks/mercadopago`,
        ...events.mercadopago,
      },
      supabase: {
        configured: supabaseConfigured,
        url: supabaseUrl ? supabaseUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1') : 'Não configurado',
        storageMode: supabaseConfigured ? 'Supabase Auth + Postgres + Private Bucket' : 'SQLite Relacional Local + Storage Privado',
        bucketName: 'payment-proofs',
        ...events.supabase,
      },
    });
  });

  app.post('/api/admin/integrations/test', requireAdmin, async (req: AuthedRequest, res: Response) => {
    const target = String(req.body?.target || 'all');
    const results: Record<string, { ok: boolean; message: string }> = {};

    if (target === 'mercadopago' || target === 'all') {
      if (!mercadoPagoToken) {
        results.mercadopago = { ok: false, message: 'MERCADOPAGO_ACCESS_TOKEN não definido nas variáveis de ambiente.' };
      } else {
        try {
          const mpRes = await fetch('https://api.mercadopago.com/users/me', {
            headers: { Authorization: `Bearer ${mercadoPagoToken}` },
          });
          if (mpRes.ok) {
            const mpData = (await mpRes.json()) as any;
            const msg = `Conectado à conta Mercado Pago (${mpData.nickname || mpData.id || 'OK'}).`;
            recordIntegrationEvent('mercadopago', 'ok', msg);
            results.mercadopago = { ok: true, message: msg };
          } else {
            const msg = `Falha na resposta Mercado Pago (HTTP ${mpRes.status}).`;
            recordIntegrationEvent('mercadopago', 'error', msg);
            results.mercadopago = { ok: false, message: msg };
          }
        } catch (err: any) {
          const msg = err?.message || 'Erro de rede ao consultar Mercado Pago.';
          recordIntegrationEvent('mercadopago', 'error', msg);
          results.mercadopago = { ok: false, message: msg };
        }
      }
    }

    if (target === 'supabase' || target === 'all') {
      if (!supabaseConfigured || !supabaseAdmin) {
        results.supabase = {
          ok: false,
          message: 'Credenciais completas do Supabase (URL + ANON + SERVICE_ROLE) não configuradas. Operando em SQLite local.',
        };
      } else {
        try {
          const { error } = await supabaseAdmin.from('site_settings').select('key').limit(1);
          if (error) {
            recordIntegrationEvent('supabase', 'error', error.message);
            results.supabase = { ok: false, message: error.message };
          } else {
            const msg = 'Conexão Supabase Postgres e Service Role operacional.';
            recordIntegrationEvent('supabase', 'ok', msg);
            results.supabase = { ok: true, message: msg };
          }
        } catch (err: any) {
          const msg = err?.message || 'Erro de rede ao consultar Supabase.';
          recordIntegrationEvent('supabase', 'error', msg);
          results.supabase = { ok: false, message: msg };
        }
      }
    }

    logAudit(req.user!.id, 'testar_integracoes', target, results);
    res.json({ ok: true, results });
  });

  // -------------------------------------------------------------------------
  // 17. Diagnóstico & 19. Ferramentas Administrativas
  // -------------------------------------------------------------------------
  app.get('/api/admin/diagnostics', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const expiredFixed = expireOverdueSubscriptions();
    let dbOk = false;
    let dbSizeBytes = 0;
    try {
      db.prepare('SELECT 1 AS ok').get();
      dbOk = true;
      if (fs.existsSync(dbPath)) {
        dbSizeBytes = fs.statSync(dbPath).size;
      }
    } catch {
      dbOk = false;
    }

    let proofsWritable = false;
    try {
      fs.accessSync(proofsDir, fs.constants.R_OK | fs.constants.W_OK);
      proofsWritable = true;
    } catch {
      proofsWritable = false;
    }

    const totalProofs = (db.prepare('SELECT COUNT(*) AS cnt FROM payment_proofs').get() as { cnt: number }).cnt;
    const activeSessions = (
      db.prepare('SELECT COUNT(*) AS cnt FROM sessions WHERE expires_at > ?').get(new Date().toISOString()) as { cnt: number }
    ).cnt;
    const pendingJobs = (
      db.prepare("SELECT COUNT(*) AS cnt FROM payment_proofs WHERE status IN ('aguardando_analise', 'em_analise')").get() as { cnt: number }
    ).cnt;
    const fkViolations = (db.prepare('PRAGMA foreign_key_check').all() as any[]).length;
    const inconsistentOrders = (
      db
        .prepare(`
          SELECT COUNT(*) AS cnt FROM payments
          WHERE (status = 'aprovado' AND (approved_at IS NULL OR (plan_key <> 'vitalicio' AND expires_at IS NULL)))
             OR (status = 'expirado' AND expires_at IS NULL)
        `)
        .get() as { cnt: number }
    ).cnt;

    res.json({
      checkedAt: new Date().toISOString(),
      checks: [
        {
          key: 'backend',
          label: 'Servidor Express & Rotas Admin',
          status: 'ok',
          detail: `Ativo · Uptime ${Math.floor(process.uptime())}s`,
        },
        {
          key: 'database',
          label: 'Banco Relacional e Integridade Referencial',
          status: dbOk && fkViolations === 0 ? 'ok' : 'error',
          detail: dbOk
            ? `Operacional (${(dbSizeBytes / 1024).toFixed(1)} KB) · ${fkViolations} violação(ões) FK`
            : 'Erro na consulta SQL',
        },
        {
          key: 'orders_integrity',
          label: 'Consistência de Assinaturas e Pedidos',
          status: inconsistentOrders === 0 ? 'ok' : 'warn',
          detail:
            inconsistentOrders === 0
              ? 'Nenhum pedido com inconsistência de datas/status'
              : `${inconsistentOrders} pedido(s) precisam de conferência`,
        },
        {
          key: 'storage',
          label: 'Armazenamento Privado de Comprovantes',
          status: proofsWritable || supabaseConfigured ? 'ok' : 'error',
          detail: supabaseConfigured
            ? 'Bucket privado payment-proofs configurado'
            : `${totalProofs} comprovante(s) no diretório privado protegido`,
        },
        {
          key: 'expiration',
          label: 'Rotina de Bloqueio por Vencimento',
          status: 'ok',
          detail: `${expiredFixed} assinatura(s) atualizada(s) nesta verificação`,
        },
        {
          key: 'sessions',
          label: 'Sessões HttpOnly Ativas',
          status: 'ok',
          detail: `${activeSessions} sessão(ões) válidas · ${pendingJobs} prova(s) na fila`,
        },
        {
          key: 'mercadopago',
          label: 'Integração Mercado Pago',
          status: mercadoPagoToken ? 'ok' : 'warn',
          detail: mercadoPagoToken ? 'Token configurado no servidor' : 'Modo link oficial + conferência manual',
        },
      ],
    });
  });

  app.get('/api/admin/tools/backup', requireAdmin, (req: AuthedRequest, res: Response) => {
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user!.displayName,
      settings: getSiteSettings(),
      publishedAppearance: getPublishedAppearance(),
      controls: getSystemControls(),
      communicationTemplates: getCommunicationTemplates(db),
      coupons,
    };
    logAudit(req.user!.id, 'exportar_backup_config', 'site_settings', {});
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vip-nicolly-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  });

  app.post('/api/admin/tools/clean-sessions', requireAdmin, (req: AuthedRequest, res: Response) => {
    const info = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
    logAudit(req.user!.id, 'limpar_sessoes_expiradas', 'sessions', { removed: info.changes });
    res.json({ ok: true, removed: info.changes });
  });

  app.post('/api/admin/tools/reset-appearance', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (!hasPerm(req.user, 'canManageSettings')) {
      res.status(403).json({ error: 'Sem permissão para restaurar aparência.' });
      return;
    }
    const def = getDefaultAppearance();
    const now = new Date().toISOString();
    upsertSetting.run('site_appearance', JSON.stringify(def), now, req.user!.id);
    upsertSetting.run('site_appearance_draft', JSON.stringify(def), now, req.user!.id);
    logAudit(req.user!.id, 'restaurar_aparencia_padrao', 'site_appearance', {});
    res.json({ ok: true, appearance: def });
  });
}

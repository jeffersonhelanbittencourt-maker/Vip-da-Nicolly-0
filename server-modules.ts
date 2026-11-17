import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import type { Express, NextFunction, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CommunicationEventKey,
  CommunicationTemplate,
  DashboardLayoutConfig,
  PlanKey,
  SiteAppearanceConfig,
  SiteConfig,
  SupportTicketStatus,
  UserProfile,
} from './types.ts';
import { computeCouponDiscount } from './server-utils.ts';

export interface AuthedReq extends Request {
  user?: UserProfile;
  sessionId?: string;
}

export const DEFAULT_COMMUNICATION_TEMPLATES: CommunicationTemplate[] = [
  {
    key: 'new_signup',
    label: 'Boas-vindas (Novo Cadastro)',
    description: 'Mensagem exibida na central do cliente logo após a criação da conta.',
    enabled: false,
    channel: 'in_app_and_email_ready',
    subject: 'Bem-vindo(a) ao VIP da Nicolly',
    bodyTemplate: 'Olá {{nome}}! Sua conta foi criada com sucesso. Escolha seu plano para ativar o acesso VIP.',
  },
  {
    key: 'payment_pending',
    label: 'Pagamento Pendente / Em Análise',
    description: 'Confirma recebimento do pedido ou comprovante em análise administrativa.',
    enabled: true,
    channel: 'in_app',
    subject: 'Recebemos seu comprovante para conferência',
    bodyTemplate: 'Seu pedido do plano {{plano}} ({{referencia}}) está em conferência. Avisaremos assim que for aprovado.',
  },
  {
    key: 'payment_approved',
    label: 'Pagamento Aprovado',
    description: 'Notifica o assinante quando o pagamento é confirmado no servidor.',
    enabled: true,
    channel: 'in_app_and_email_ready',
    subject: 'Pagamento confirmado — VIP liberado',
    bodyTemplate: 'Pagamento aprovado! Seu plano {{plano}} está ativo na plataforma.',
  },
  {
    key: 'vip_unlocked',
    label: 'Acesso VIP Liberado',
    description: 'Instruções de entrada no Grupo VIP após confirmação de assinatura.',
    enabled: false,
    channel: 'in_app',
    subject: 'Área VIP liberada na sua conta',
    bodyTemplate: 'Acesse a aba Área VIP e toque em ACESSAR GRUPO VIP para falar diretamente com a Nicolly.',
  },
  {
    key: 'expiring_soon',
    label: 'Assinatura Próxima do Vencimento',
    description: 'Alerta automático na varredura para assinaturas com até 3 dias restantes.',
    enabled: false,
    channel: 'in_app_and_email_ready',
    subject: 'Sua assinatura VIP vence em breve',
    bodyTemplate: 'Faltam {{dias}} dia(s) para o vencimento do seu plano {{plano}}. Renove para não perder o acesso.',
  },
  {
    key: 'expired',
    label: 'Assinatura Expirada',
    description: 'Informa o encerramento do período contratado ao vencer.',
    enabled: false,
    channel: 'in_app_and_email_ready',
    subject: 'Assinatura VIP expirada',
    bodyTemplate: 'Seu plano {{plano}} chegou ao fim. Escolha um novo período na aba Planos para reativar.',
  },
  {
    key: 'renewed',
    label: 'Renovação Confirmada',
    description: 'Confirma extensão de dias ou renovação manual/automática.',
    enabled: true,
    channel: 'in_app',
    subject: 'Renovação registrada com sucesso',
    bodyTemplate: 'Sua assinatura do plano {{plano}} foi estendida/renovada com sucesso.',
  },
];

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutConfig = {
  visibleSections: {
    alerts: true,
    quickActions: true,
    kpis: true,
    charts: true,
    planDistribution: true,
    statusMatrix: true,
    recentActivities: true,
  },
  sectionOrder: [
    'alerts',
    'quickActions',
    'kpis',
    'charts',
    'planDistribution',
    'statusMatrix',
    'recentActivities',
  ],
};

export interface ExtraModulesDeps {
  db: Database.Database;
  requireAuth: (req: AuthedReq, res: Response, next: NextFunction) => Promise<void>;
  requireAdmin: (req: AuthedReq, res: Response, next: NextFunction) => Promise<void>;
  getSiteSettings: () => SiteConfig;
  getPublishedAppearance: () => SiteAppearanceConfig;
  getDraftAppearance: () => SiteAppearanceConfig;
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
  mediaDir: string;
  supabaseConfigured: boolean;
  supabaseAdmin: SupabaseClient | null;
}

export function getCommunicationTemplates(db: Database.Database): CommunicationTemplate[] {
  const row = db
    .prepare("SELECT value FROM site_settings WHERE key = 'communication_templates'")
    .get() as { value: string } | undefined;
  if (!row) return DEFAULT_COMMUNICATION_TEMPLATES;
  try {
    const parsed = JSON.parse(row.value) as CommunicationTemplate[];
    if (!Array.isArray(parsed)) return DEFAULT_COMMUNICATION_TEMPLATES;
    return DEFAULT_COMMUNICATION_TEMPLATES.map((def) => {
      const override = parsed.find((x) => x.key === def.key);
      return override ? { ...def, ...override } : def;
    });
  } catch {
    return DEFAULT_COMMUNICATION_TEMPLATES;
  }
}

export function dispatchUserCommunication(
  db: Database.Database,
  opts: {
    userId: string;
    eventKey: CommunicationEventKey;
    vars?: Record<string, string>;
    forceSupportReply?: { title: string; message: string };
  }
): boolean {
  if (opts.forceSupportReply) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO user_notifications (id, user_id, event_key, title, message, read_at, created_at)
      VALUES (?, ?, 'support_reply', ?, ?, NULL, ?)
    `).run(
      crypto.randomUUID(),
      opts.userId,
      opts.forceSupportReply.title,
      opts.forceSupportReply.message,
      now
    );
    return true;
  }

  const profile = db
    .prepare('SELECT id, display_name, preferences FROM profiles WHERE id = ?')
    .get(opts.userId) as { id: string; display_name: string; preferences?: string | null } | undefined;
  if (!profile) return false;

  const templates = getCommunicationTemplates(db);
  const tpl = templates.find((t) => t.key === opts.eventKey);
  if (!tpl || !tpl.enabled) {
    return false;
  }

  let prefs = { inAppNotifications: true, emailUpdates: false };
  if (profile.preferences) {
    try {
      prefs = { ...prefs, ...JSON.parse(profile.preferences) };
    } catch {
      // ignore invalid json
    }
  }
  if (!prefs.inAppNotifications) return false;

  const replaceVars = (str: string) => {
    let out = str.replace(/\{\{nome\}\}/g, profile.display_name.split(' ')[0] || profile.display_name);
    if (opts.vars) {
      for (const [k, v] of Object.entries(opts.vars)) {
        out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
      }
    }
    return out;
  };

  const title = replaceVars(tpl.subject);
  const message = replaceVars(tpl.bodyTemplate);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO user_notifications (id, user_id, event_key, title, message, read_at, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?)
  `).run(crypto.randomUUID(), opts.userId, opts.eventKey, title, message, now);

  db.prepare(`
    INSERT INTO communication_logs (id, user_id, event_key, channel, status, title, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    opts.userId,
    opts.eventKey,
    tpl.channel,
    tpl.channel === 'in_app_and_email_ready' ? 'entregue_in_app_email_aguardando_smtp' : 'entregue_in_app',
    title,
    message,
    now
  );

  return true;
}

export function validateCouponForUser(
  db: Database.Database,
  opts: { code: string; planKey: PlanKey; amountCents: number; userId: string }
): { ok: true; couponId: string; code: string; discountType: 'percent' | 'fixed_cents'; discountValue: number; discountCents: number; finalAmountCents: number; message: string } | { ok: false; error: string } {
  const cleanCode = String(opts.code || '').trim().toUpperCase();
  if (!cleanCode) return { ok: false, error: 'Informe um código de cupom.' };

  const coupon = db.prepare('SELECT * FROM coupons WHERE upper(code) = ?').get(cleanCode) as any;
  if (!coupon) {
    return { ok: false, error: 'Cupom não encontrado.' };
  }
  if (!coupon.active) {
    return { ok: false, error: 'Este cupom está desativado no momento.' };
  }

  const nowIso = new Date().toISOString();
  if (coupon.valid_from && coupon.valid_from > nowIso) {
    return { ok: false, error: 'Este cupom ainda não entrou em vigor.' };
  }
  if (coupon.valid_until && coupon.valid_until < nowIso) {
    return { ok: false, error: 'Este cupom expirou.' };
  }
  if (coupon.max_uses !== null && coupon.max_uses !== undefined && Number(coupon.used_count) >= Number(coupon.max_uses)) {
    return { ok: false, error: 'Este cupom atingiu o limite máximo de utilizações.' };
  }

  let plans: string[] = [];
  try {
    plans = JSON.parse(coupon.applicable_plans || '[]');
  } catch {
    plans = [];
  }
  if (plans.length > 0 && !plans.includes(opts.planKey)) {
    return { ok: false, error: `Cupom não aplicável ao plano ${opts.planKey}.` };
  }

  // Prevent abusive reuse of the same coupon on already approved purchases by same user
  const usedBefore = db
    .prepare(`
      SELECT r.id FROM coupon_redemptions r
      JOIN payments p ON p.id = r.payment_id
      WHERE r.coupon_id = ? AND r.user_id = ? AND p.status IN ('aprovado', 'aguardando_analise', 'em_analise', 'expirado')
    `)
    .get(coupon.id, opts.userId);
  if (usedBefore) {
    return { ok: false, error: 'Você já utilizou este cupom em uma assinatura.' };
  }

  const { discountCents, finalAmountCents } = computeCouponDiscount({
    amountCents: opts.amountCents,
    discountType: coupon.discount_type,
    discountValue: Number(coupon.discount_value),
  });

  if (discountCents <= 0) {
    return { ok: false, error: 'Desconto não aplicável a este valor.' };
  }

  return {
    ok: true,
    couponId: coupon.id,
    code: coupon.code,
    discountType: coupon.discount_type,
    discountValue: Number(coupon.discount_value),
    discountCents,
    finalAmountCents,
    message:
      coupon.discount_type === 'percent'
        ? `Cupom ${coupon.code} aplicado (${coupon.discount_value}% OFF).`
        : `Cupom ${coupon.code} aplicado (R$ ${(discountCents / 100).toFixed(2).replace('.', ',')} OFF).`,
  };
}

export function registerExtraModulesRoutes(app: Express, deps: ExtraModulesDeps) {
  const {
    db,
    requireAuth,
    requireAdmin,
    getSiteSettings,
    getPublishedAppearance,
    getDraftAppearance,
    logAudit,
    createNotification,
    mediaDir,
    supabaseConfigured,
    supabaseAdmin,
  } = deps;

  fs.mkdirSync(mediaDir, { recursive: true });

  const mediaUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, mediaDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
      if (!allowed.has(file.mimetype)) {
        cb(new Error('Formato não permitido. Envie JPG, PNG, WebP ou SVG até 5 MB.'));
        return;
      }
      cb(null, true);
    },
  });

  const upsertSetting = db.prepare(`
    INSERT INTO site_settings (key, value, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `);

  // -------------------------------------------------------------------------
  // 1. Client Preferences & Notifications
  // -------------------------------------------------------------------------
  app.patch('/api/auth/preferences', requireAuth, (req: AuthedReq, res: Response) => {
    const user = req.user!;
    const current = user.preferences || {
      theme: 'dark',
      inAppNotifications: true,
      emailUpdates: false,
    };
    const nextPrefs = {
      theme: req.body?.theme === 'light' ? 'light' : 'dark',
      inAppNotifications:
        req.body?.inAppNotifications !== undefined
          ? Boolean(req.body.inAppNotifications)
          : current.inAppNotifications,
      emailUpdates:
        req.body?.emailUpdates !== undefined ? Boolean(req.body.emailUpdates) : current.emailUpdates,
    };
    db.prepare('UPDATE profiles SET preferences = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(nextPrefs),
      new Date().toISOString(),
      user.id
    );
    res.json({ ok: true, preferences: nextPrefs });
  });

  app.get('/api/notifications/my', requireAuth, (req: AuthedReq, res: Response) => {
    const rows = db
      .prepare('SELECT * FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
      .all(req.user!.id) as any[];
    res.json({
      notifications: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        eventKey: r.event_key,
        title: r.title,
        message: r.message,
        readAt: r.read_at,
        createdAt: r.created_at,
      })),
    });
  });

  app.post('/api/notifications/my/read-all', requireAuth, (req: AuthedReq, res: Response) => {
    db.prepare('UPDATE user_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(
      new Date().toISOString(),
      req.user!.id
    );
    res.json({ ok: true });
  });

  app.patch('/api/notifications/my/:id/read', requireAuth, (req: AuthedReq, res: Response) => {
    db.prepare('UPDATE user_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(
      new Date().toISOString(),
      req.params.id,
      req.user!.id
    );
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // 2. Payment Order Tracking (Strict server-truth lookup)
  // -------------------------------------------------------------------------
  app.get('/api/payments/by-ref/:ref', requireAuth, (req: AuthedReq, res: Response) => {
    const pay = db
      .prepare('SELECT * FROM payments WHERE external_reference = ? OR id = ? LIMIT 1')
      .get(req.params.ref, req.params.ref) as any;
    if (!pay) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    if (pay.user_id !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Você não tem permissão para acompanhar este pedido.' });
      return;
    }
    const proofs = db
      .prepare('SELECT * FROM payment_proofs WHERE payment_id = ? ORDER BY created_at DESC')
      .all(pay.id) as any[];
    res.json({
      payment: {
        id: pay.id,
        userId: pay.user_id,
        planKey: pay.plan_key,
        amountCents: pay.amount_cents,
        originalAmountCents: pay.original_amount_cents,
        discountCents: pay.discount_cents || 0,
        couponCode: pay.coupon_code || null,
        activationOrigin: pay.activation_origin || null,
        currency: pay.currency,
        status: pay.status,
        provider: pay.provider,
        providerPaymentId: pay.provider_payment_id,
        externalReference: pay.external_reference,
        checkoutUrl: pay.checkout_url,
        rejectionReason: pay.rejection_reason,
        approvedAt: pay.approved_at,
        expiresAt: pay.expires_at,
        createdAt: pay.created_at,
        updatedAt: pay.updated_at,
        proofs: proofs.map((pr) => ({
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
        })),
      },
    });
  });

  // -------------------------------------------------------------------------
  // 3. Coupons & Promotions (Client Validation + Admin CRUD)
  // -------------------------------------------------------------------------
  app.post('/api/coupons/validate', requireAuth, (req: AuthedReq, res: Response) => {
    const code = String(req.body?.code || '').trim();
    const planKey = String(req.body?.planKey || '') as PlanKey;
    const settings = getSiteSettings();
    const plan = settings.plans[planKey];
    if (!plan || !['semanal', 'mensal', 'vitalicio'].includes(planKey)) {
      res.status(400).json({ error: 'Plano inválido para validação do cupom.' });
      return;
    }

    const result = validateCouponForUser(db, {
      code,
      planKey,
      amountCents: plan.amountCents,
      userId: req.user!.id,
    });

    if (!result.ok) {
      res.status(400).json({ valid: false, error: result.error });
      return;
    }

    res.json({
      valid: true,
      code: result.code,
      discountType: result.discountType,
      discountValue: result.discountValue,
      originalAmountCents: plan.amountCents,
      discountCents: result.discountCents,
      finalAmountCents: result.finalAmountCents,
      message: result.message,
    });
  });

  app.get('/api/admin/coupons', requireAdmin, (_req: AuthedReq, res: Response) => {
    const rows = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all() as any[];
    res.json({
      coupons: rows.map((c) => ({
        id: c.id,
        code: c.code,
        discountType: c.discount_type,
        discountValue: c.discount_value,
        applicablePlans: (() => {
          try {
            return JSON.parse(c.applicable_plans || '[]');
          } catch {
            return [];
          }
        })(),
        maxUses: c.max_uses,
        usedCount: c.used_count,
        validFrom: c.valid_from,
        validUntil: c.valid_until,
        active: Boolean(c.active),
        description: c.description,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    });
  });

  app.post('/api/admin/coupons', requireAdmin, (req: AuthedReq, res: Response) => {
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const discountType = req.body?.discountType === 'fixed_cents' ? 'fixed_cents' : 'percent';
    const discountValue = Math.round(Number(req.body?.discountValue || 0));
    const maxUses = req.body?.maxUses ? Math.max(1, Math.round(Number(req.body.maxUses))) : null;
    const validUntil = req.body?.validUntil ? String(req.body.validUntil).trim() : null;
    const description = String(req.body?.description || '').trim() || null;
    const applicablePlans = Array.isArray(req.body?.applicablePlans)
      ? req.body.applicablePlans.filter((p: string) => ['semanal', 'mensal', 'vitalicio'].includes(p))
      : ['semanal', 'mensal', 'vitalicio'];

    if (code.length < 3 || code.length > 24) {
      res.status(400).json({ error: 'Código do cupom deve ter entre 3 e 24 caracteres alfanuméricos.' });
      return;
    }
    if (discountType === 'percent' && (discountValue < 1 || discountValue > 95)) {
      res.status(400).json({ error: 'Desconto percentual deve ficar entre 1% e 95%.' });
      return;
    }
    if (discountType === 'fixed_cents' && discountValue < 100) {
      res.status(400).json({ error: 'Desconto fixo mínimo é de R$ 1,00 (100 centavos).' });
      return;
    }

    const exists = db.prepare('SELECT id FROM coupons WHERE upper(code) = ?').get(code);
    if (exists) {
      res.status(409).json({ error: 'Já existe um cupom cadastrado com este código.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO coupons (
        id, code, discount_type, discount_value, applicable_plans, max_uses,
        used_count, valid_from, valid_until, active, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, 1, ?, ?, ?)
    `).run(
      id,
      code,
      discountType,
      discountValue,
      JSON.stringify(applicablePlans),
      maxUses,
      validUntil,
      description,
      now,
      now
    );

    logAudit(req.user!.id, 'criar_cupom', id, { code, discountType, discountValue, maxUses });
    res.status(201).json({ ok: true, id, code });
  });

  app.patch('/api/admin/coupons/:id', requireAdmin, (req: AuthedReq, res: Response) => {
    const existing = db.prepare('SELECT * FROM coupons WHERE id = ?').get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Cupom não encontrado.' });
      return;
    }
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : existing.active;
    const maxUses =
      req.body?.maxUses !== undefined
        ? req.body.maxUses === null || req.body.maxUses === ''
          ? null
          : Math.max(1, Math.round(Number(req.body.maxUses)))
        : existing.max_uses;
    const validUntil =
      req.body?.validUntil !== undefined ? (req.body.validUntil || null) : existing.valid_until;
    const now = new Date().toISOString();

    db.prepare('UPDATE coupons SET active = ?, max_uses = ?, valid_until = ?, updated_at = ? WHERE id = ?').run(
      active,
      maxUses,
      validUntil,
      now,
      existing.id
    );
    logAudit(req.user!.id, 'atualizar_cupom', existing.id, { code: existing.code, active: Boolean(active) });
    res.json({ ok: true });
  });

  app.delete('/api/admin/coupons/:id', requireAdmin, (req: AuthedReq, res: Response) => {
    const existing = db.prepare('SELECT id, code FROM coupons WHERE id = ?').get(req.params.id) as any;
    if (!existing) {
      res.status(404).json({ error: 'Cupom não encontrado.' });
      return;
    }
    db.prepare('DELETE FROM coupons WHERE id = ?').run(existing.id);
    logAudit(req.user!.id, 'excluir_cupom', existing.id, { code: existing.code });
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // 4. Support Ticket Center (Client + Admin)
  // -------------------------------------------------------------------------
  function mapTickets(ticketRows: any[], msgRows: any[]) {
    return ticketRows.map((t) => ({
      id: t.id,
      userId: t.user_id,
      customerName: t.customer_name,
      customerEmail: t.customer_email,
      customerPhone: t.customer_phone,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      adminNotes: t.admin_notes,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      closedAt: t.closed_at,
      messages: msgRows
        .filter((m) => m.ticket_id === t.id)
        .map((m) => ({
          id: m.id,
          ticketId: m.ticket_id,
          senderId: m.sender_id,
          senderRole: m.sender_role,
          senderName: m.sender_name,
          message: m.message,
          createdAt: m.created_at,
        })),
    }));
  }

  app.get('/api/support/tickets', requireAuth, (req: AuthedReq, res: Response) => {
    const tickets = db
      .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC')
      .all(req.user!.id) as any[];
    const ids = tickets.map((t) => t.id);
    const msgs =
      ids.length > 0
        ? (db
            .prepare(
              `SELECT * FROM support_messages WHERE ticket_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at ASC`
            )
            .all(...ids) as any[])
        : [];
    res.json({ tickets: mapTickets(tickets, msgs) });
  });

  app.post('/api/support/tickets', requireAuth, (req: AuthedReq, res: Response) => {
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    const category = ['pagamento', 'acesso_vip', 'conta', 'outro'].includes(req.body?.category)
      ? req.body.category
      : 'outro';
    const priority = req.body?.priority === 'alta' ? 'alta' : 'normal';

    if (subject.length < 4 || message.length < 6) {
      res.status(400).json({ error: 'Informe um assunto (mín. 4) e uma mensagem detalhada (mín. 6 caracteres).' });
      return;
    }

    const ticketId = crypto.randomUUID();
    const msgId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO support_tickets (id, user_id, subject, category, status, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'aberto', ?, ?, ?)
    `).run(ticketId, req.user!.id, subject, category, priority, now, now);

    db.prepare(`
      INSERT INTO support_messages (id, ticket_id, sender_id, sender_role, sender_name, message, created_at)
      VALUES (?, ?, ?, 'client', ?, ?, ?)
    `).run(msgId, ticketId, req.user!.id, req.user!.displayName, message, now);

    createNotification({
      type: 'support_ticket',
      title: 'Novo chamado de suporte',
      message: `${req.user!.displayName} abriu um chamado: "${subject}".`,
      targetTab: 'support',
      recordId: ticketId,
    });

    res.status(201).json({ ok: true, id: ticketId });
  });

  app.post('/api/support/tickets/:id/messages', requireAuth, (req: AuthedReq, res: Response) => {
    const ticket = db
      .prepare('SELECT * FROM support_tickets WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user!.id) as any;
    if (!ticket) {
      res.status(404).json({ error: 'Chamado não encontrado.' });
      return;
    }
    if (ticket.status === 'encerrado') {
      res.status(400).json({ error: 'Este chamado já foi encerrado. Abra uma nova solicitação.' });
      return;
    }
    const message = String(req.body?.message || '').trim();
    if (message.length < 2) {
      res.status(400).json({ error: 'Escreva uma mensagem antes de enviar.' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO support_messages (id, ticket_id, sender_id, sender_role, sender_name, message, created_at)
      VALUES (?, ?, ?, 'client', ?, ?, ?)
    `).run(crypto.randomUUID(), ticket.id, req.user!.id, req.user!.displayName, message, now);

    const nextStatus = ticket.status === 'aguardando_cliente' || ticket.status === 'resolvido' ? 'aberto' : ticket.status;
    db.prepare('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now, ticket.id);

    createNotification({
      type: 'support_reply',
      title: 'Nova resposta em chamado',
      message: `${req.user!.displayName} respondeu no chamado "${ticket.subject}".`,
      targetTab: 'support',
      recordId: ticket.id,
    });

    res.status(201).json({ ok: true });
  });

  app.get('/api/admin/support/tickets', requireAdmin, (_req: AuthedReq, res: Response) => {
    const tickets = db
      .prepare(`
        SELECT t.*, p.display_name AS customer_name, p.email AS customer_email, p.phone AS customer_phone
        FROM support_tickets t
        JOIN profiles p ON p.id = t.user_id
        ORDER BY
          CASE WHEN t.status IN ('aberto', 'em_atendimento') THEN 0 ELSE 1 END,
          t.updated_at DESC
      `)
      .all() as any[];
    const msgs = db.prepare('SELECT * FROM support_messages ORDER BY created_at ASC').all() as any[];
    res.json({ tickets: mapTickets(tickets, msgs) });
  });

  app.patch('/api/admin/support/tickets/:id', requireAdmin, (req: AuthedReq, res: Response) => {
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id) as any;
    if (!ticket) {
      res.status(404).json({ error: 'Chamado não encontrado.' });
      return;
    }
    const allowedStatuses: SupportTicketStatus[] = [
      'aberto',
      'em_atendimento',
      'aguardando_cliente',
      'resolvido',
      'encerrado',
    ];
    const nextStatus = allowedStatuses.includes(req.body?.status) ? req.body.status : ticket.status;
    const nextNotes =
      req.body?.adminNotes !== undefined ? String(req.body.adminNotes || '').trim() || null : ticket.admin_notes;
    const now = new Date().toISOString();
    const closedAt = nextStatus === 'encerrado' || nextStatus === 'resolvido' ? now : null;

    db.prepare('UPDATE support_tickets SET status = ?, admin_notes = ?, updated_at = ?, closed_at = ? WHERE id = ?').run(
      nextStatus,
      nextNotes,
      now,
      closedAt,
      ticket.id
    );
    logAudit(req.user!.id, 'atualizar_chamado_suporte', ticket.id, { status: nextStatus });
    res.json({ ok: true });
  });

  app.post('/api/admin/support/tickets/:id/reply', requireAdmin, (req: AuthedReq, res: Response) => {
    const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(req.params.id) as any;
    if (!ticket) {
      res.status(404).json({ error: 'Chamado não encontrado.' });
      return;
    }
    const message = String(req.body?.message || '').trim();
    if (message.length < 2) {
      res.status(400).json({ error: 'Informe a resposta ao cliente.' });
      return;
    }
    const nextStatus = ['aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'encerrado'].includes(
      req.body?.status
    )
      ? req.body.status
      : 'aguardando_cliente';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO support_messages (id, ticket_id, sender_id, sender_role, sender_name, message, created_at)
      VALUES (?, ?, ?, 'admin', ?, ?, ?)
    `).run(crypto.randomUUID(), ticket.id, req.user!.id, req.user!.displayName, message, now);

    db.prepare('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?').run(
      nextStatus,
      now,
      ticket.id
    );

    dispatchUserCommunication(db, {
      userId: ticket.user_id,
      eventKey: 'vip_unlocked',
      forceSupportReply: {
        title: `Resposta no chamado: ${ticket.subject}`,
        message: message.slice(0, 180),
      },
    });

    logAudit(req.user!.id, 'responder_chamado_suporte', ticket.id, { nextStatus });
    res.status(201).json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // 5. Communication Templates & Logs
  // -------------------------------------------------------------------------
  app.get('/api/admin/communication/templates', requireAdmin, (_req: AuthedReq, res: Response) => {
    const logs = db
      .prepare(`
        SELECT l.*, p.display_name AS customer_name, p.email AS customer_email
        FROM communication_logs l
        LEFT JOIN profiles p ON p.id = l.user_id
        ORDER BY l.created_at DESC
        LIMIT 40
      `)
      .all() as any[];

    res.json({
      templates: getCommunicationTemplates(db),
      logs: logs.map((l) => ({
        id: l.id,
        userId: l.user_id,
        customerName: l.customer_name || 'Cliente',
        customerEmail: l.customer_email || '',
        eventKey: l.event_key,
        channel: l.channel,
        status: l.status,
        title: l.title,
        message: l.message,
        createdAt: l.created_at,
      })),
    });
  });

  app.put('/api/admin/communication/templates', requireAdmin, (req: AuthedReq, res: Response) => {
    const incoming = req.body?.templates;
    if (!Array.isArray(incoming)) {
      res.status(400).json({ error: 'Formato inválido para templates de comunicação.' });
      return;
    }
    const merged = DEFAULT_COMMUNICATION_TEMPLATES.map((def) => {
      const match = incoming.find((x: any) => x.key === def.key);
      if (!match) return def;
      return {
        ...def,
        enabled: Boolean(match.enabled),
        channel: match.channel === 'in_app_and_email_ready' ? 'in_app_and_email_ready' : 'in_app',
        subject: String(match.subject || def.subject).trim() || def.subject,
        bodyTemplate: String(match.bodyTemplate || def.bodyTemplate).trim() || def.bodyTemplate,
      };
    });
    upsertSetting.run('communication_templates', JSON.stringify(merged), new Date().toISOString(), req.user!.id);
    logAudit(req.user!.id, 'atualizar_templates_comunicacao', 'communication_templates', {
      enabledKeys: merged.filter((m) => m.enabled).map((m) => m.key),
    });
    res.json({ ok: true, templates: merged });
  });

  // -------------------------------------------------------------------------
  // 6. Media Assets Center (Strict separation from private payment-proofs)
  // -------------------------------------------------------------------------
  app.get('/api/admin/media', requireAdmin, (_req: AuthedReq, res: Response) => {
    const rows = db.prepare('SELECT * FROM media_assets ORDER BY created_at DESC').all() as any[];
    res.json({
      assets: rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        originalFilename: r.original_filename,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        url: `/api/media/${r.id}`,
        createdBy: r.created_by,
        createdAt: r.created_at,
      })),
    });
  });

  app.post('/api/admin/media', requireAdmin, mediaUpload.single('file'), async (req: AuthedReq, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Selecione uma imagem (JPG, PNG, WebP ou SVG) para enviar.' });
        return;
      }
      const title = String(req.body?.title || req.file.originalname).trim() || 'Imagem do site';
      const category = ['logo', 'hero', 'vip_banner', 'geral'].includes(req.body?.category)
        ? req.body.category
        : 'geral';
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      let storagePath = req.file.filename;

      if (supabaseConfigured && supabaseAdmin) {
        const buf = fs.readFileSync(req.file.path);
        const sbPath = `${category}/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error } = await supabaseAdmin.storage.from('site-media').upload(sbPath, buf, {
          contentType: req.file.mimetype,
          upsert: false,
        });
        if (!error) {
          storagePath = `supabase:${sbPath}`;
          fs.unlinkSync(req.file.path);
        }
      }

      db.prepare(`
        INSERT INTO media_assets (id, title, category, storage_path, original_filename, mime_type, size_bytes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, title, category, storagePath, req.file.originalname, req.file.mimetype, req.file.size, req.user!.id, now);

      logAudit(req.user!.id, 'enviar_midia_site', id, { title, category, filename: req.file.originalname });
      res.status(201).json({
        ok: true,
        asset: {
          id,
          title,
          category,
          originalFilename: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          url: `/api/media/${id}`,
          createdBy: req.user!.id,
          createdAt: now,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro ao enviar arquivo de mídia.' });
    }
  });

  app.get('/api/media/:id', async (req: Request, res: Response) => {
    const asset = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id) as any;
    if (!asset) {
      res.status(404).send('Mídia não encontrada.');
      return;
    }

    if (String(asset.storage_path).startsWith('supabase:') && supabaseConfigured && supabaseAdmin) {
      const sbPath = String(asset.storage_path).replace(/^supabase:/, '');
      const { data, error } = await supabaseAdmin.storage.from('site-media').download(sbPath);
      if (error || !data) {
        res.status(404).send('Arquivo indisponível.');
        return;
      }
      const arr = Buffer.from(await data.arrayBuffer());
      res.setHeader('Content-Type', asset.mime_type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(arr);
      return;
    }

    const fullPath = path.join(mediaDir, path.basename(asset.storage_path));
    if (!fs.existsSync(fullPath)) {
      res.status(404).send('Arquivo ausente no disco.');
      return;
    }
    res.setHeader('Content-Type', asset.mime_type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(fullPath);
  });

  app.post('/api/admin/media/:id/apply', requireAdmin, (req: AuthedReq, res: Response) => {
    const asset = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id) as any;
    if (!asset) {
      res.status(404).json({ error: 'Mídia não encontrada.' });
      return;
    }
    const target = req.body?.target === 'vipBannerUrl' ? 'vipBannerUrl' : 'heroImageUrl';
    const mediaUrl = `/api/media/${asset.id}`;
    const now = new Date().toISOString();

    const nextDraft = { ...getDraftAppearance(), [target]: mediaUrl };
    const nextPublished = { ...getPublishedAppearance(), [target]: mediaUrl };

    upsertSetting.run('site_appearance_draft', JSON.stringify(nextDraft), now, req.user!.id);
    upsertSetting.run('site_appearance', JSON.stringify(nextPublished), now, req.user!.id);

    logAudit(req.user!.id, 'aplicar_midia_aparencia', asset.id, { target, mediaUrl });
    res.json({ ok: true, target, url: mediaUrl });
  });

  app.delete('/api/admin/media/:id', requireAdmin, async (req: AuthedReq, res: Response) => {
    const asset = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(req.params.id) as any;
    if (!asset) {
      res.status(404).json({ error: 'Mídia não encontrada.' });
      return;
    }
    if (String(asset.storage_path).startsWith('supabase:') && supabaseConfigured && supabaseAdmin) {
      const sbPath = String(asset.storage_path).replace(/^supabase:/, '');
      await supabaseAdmin.storage.from('site-media').remove([sbPath]);
    } else {
      const fullPath = path.join(mediaDir, path.basename(asset.storage_path));
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore cleanup failure
        }
      }
    }
    db.prepare('DELETE FROM media_assets WHERE id = ?').run(asset.id);
    logAudit(req.user!.id, 'excluir_midia_site', asset.id, { title: asset.title });
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // 7. Dashboard Layout Customization (Per-Admin Persistence)
  // -------------------------------------------------------------------------
  app.get('/api/admin/dashboard-layout', requireAdmin, (req: AuthedReq, res: Response) => {
    const key = `admin_dashboard_layout_${req.user!.id}`;
    const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) {
      res.json({ layout: DEFAULT_DASHBOARD_LAYOUT });
      return;
    }
    try {
      const parsed = JSON.parse(row.value);
      res.json({
        layout: {
          visibleSections: { ...DEFAULT_DASHBOARD_LAYOUT.visibleSections, ...(parsed.visibleSections || {}) },
          sectionOrder: Array.isArray(parsed.sectionOrder) ? parsed.sectionOrder : DEFAULT_DASHBOARD_LAYOUT.sectionOrder,
        },
      });
    } catch {
      res.json({ layout: DEFAULT_DASHBOARD_LAYOUT });
    }
  });

  app.put('/api/admin/dashboard-layout', requireAdmin, (req: AuthedReq, res: Response) => {
    const key = `admin_dashboard_layout_${req.user!.id}`;
    const inc = req.body?.layout || {};
    const validKeys = new Set(DEFAULT_DASHBOARD_LAYOUT.sectionOrder);
    const incomingOrder = Array.isArray(inc.sectionOrder)
      ? inc.sectionOrder.filter((k: any) => validKeys.has(k))
      : DEFAULT_DASHBOARD_LAYOUT.sectionOrder;
    // Ensure all sections exist in order
    for (const k of DEFAULT_DASHBOARD_LAYOUT.sectionOrder) {
      if (!incomingOrder.includes(k)) incomingOrder.push(k);
    }

    const layout: DashboardLayoutConfig = {
      visibleSections: {
        ...DEFAULT_DASHBOARD_LAYOUT.visibleSections,
        ...(inc.visibleSections || {}),
      },
      sectionOrder: incomingOrder,
    };
    upsertSetting.run(key, JSON.stringify(layout), new Date().toISOString(), req.user!.id);
    res.json({ ok: true, layout });
  });
}

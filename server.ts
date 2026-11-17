import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import Database from 'better-sqlite3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import type {
  AdminPermissions,
  PlanConfig,
  PlanKey,
  PaymentRecord,
  PaymentStatus,
  ProofStatus,
  SiteAppearanceConfig,
  SiteConfig,
  SubscriptionSummary,
  SystemControlsConfig,
  UserProfile,
} from './types.ts';
import { registerAdminRoutes } from './server-admin.ts';
import {
  registerExtraModulesRoutes,
  dispatchUserCommunication,
  validateCouponForUser,
  DEFAULT_COMMUNICATION_TEMPLATES,
} from './server-modules.ts';
import {
  hashPassword,
  verifyPassword,
  isAdult,
  parseBrlToCents,
  computeExpirationIso,
} from './server-utils.ts';

const ROOT_DIR = process.cwd();
const PRIVATE_DIR = path.join(ROOT_DIR, 'private_storage');
const PROOFS_DIR = path.join(PRIVATE_DIR, 'proofs');
const MEDIA_DIR = path.join(PRIVATE_DIR, 'media');
const DB_PATH = path.join(PRIVATE_DIR, 'vip_nicolly.db');
const CONTENT_JSON_PATH = path.join(ROOT_DIR, 'content.json');

fs.mkdirSync(PROOFS_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Configuration & Integration Detection
// ---------------------------------------------------------------------------
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const MERCADOPAGO_ACCESS_TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
const MERCADOPAGO_WEBHOOK_SECRET = (process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();

const isValidHttpUrl = (val: string) => {
  try {
    const u = new URL(val);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const SUPABASE_CONFIGURED =
  isValidHttpUrl(SUPABASE_URL) &&
  SUPABASE_ANON_KEY.length > 20 &&
  SUPABASE_SERVICE_ROLE_KEY.length > 20;

let supabaseAdmin: SupabaseClient | null = null;
let supabasePublic: SupabaseClient | null = null;

if (SUPABASE_CONFIGURED) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Ephemeral fallback secret if SESSION_SECRET is not set in env
const SESSION_SECRET =
  (process.env.SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

const COOKIE_NAME = 'vip_nicolly_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Pre-hashed initial admin credential digests (scrypt salt:hash; plaintext never stored in code)
const PREHASHED_ADMIN_SEEDS: Record<string, { displayName: string; username: string; email: string; hash: string }> = {
  jefferson: {
    displayName: 'Jefferson',
    username: 'jefferson',
    email: 'jefferson@vipdanicolly.admin',
    hash: 'eda2db881af5bde79abb7fa11f307e25:4b8a17a909cb2d46f733c24f89b76dab091032d90f8c1e9326c087638f2bbe76810b892fae1caecefb1834e43a99fa28c2ab9b3a0e03b9c945c6a3b2902546dc',
  },
  nicolly: {
    displayName: 'Nicolly',
    username: 'nicolly',
    email: 'nicolly@vipdanicolly.admin',
    hash: 'baa62c63533829589144a05c3afd45bc:0f47c24d8e0a119acc9c26ec7d16207ca7eba03c07abdbdb94cfd052efeafc10993e8cbfc6c8c460acb0001baf3ed69af966d50d0f863fa01049e33f0f32c945',
  },
};

// ---------------------------------------------------------------------------
// Load Initial Defaults from content.json
// ---------------------------------------------------------------------------
const DEFAULT_APPEARANCE: SiteAppearanceConfig = {
  siteName: 'VIP da Nicolly',
  logoText: 'VIP da Nicolly',
  primaryColor: '#f06aa9',
  secondaryColor: '#c83c82',
  backgroundColor: '#0e0711',
  faviconColor: '#f06aa9',
  heroImageUrl: '/src/assets/images/vip_hero_editorial_1794936333061.jpg',
  vipBannerUrl: '/src/assets/images/vip_lounge_banner_1794936334758.jpg',
  heroTitle: 'Acesso reservado exclusivamente a membros autenticados.',
  heroSubtitle:
    'Entre na sua conta ou realize seu cadastro para conhecer os planos disponíveis, acompanhar pagamentos e acessar a Área VIP com segurança.',
  welcomeMessage:
    'Um espaço exclusivo, íntimo e dedicado para quem deseja acompanhar conteúdos especiais e novidades.',
  vipTitle: 'Bem-vindo à Área VIP da Nicolly',
  vipDescription:
    'Sua assinatura está ativa e verificada pelo servidor. Solicite sua entrada no grupo VIP abaixo com atendimento direto.',
  paymentText:
    'Cada contratação gera uma referência individual vinculada à sua conta. O acesso à Área VIP é liberado somente após confirmação oficial do Mercado Pago ou aprovação do comprovante pela administração.',
  approvedMessage: 'Assinatura confirmada e ativa na plataforma.',
  expiredMessage: 'Sua assinatura venceu. Renove um plano para recuperar o acesso à Área VIP.',
  loginButtonLabel: 'Entrar na minha conta',
  registerButtonLabel: 'Criar minha conta',
  vipGroupButtonLabel: 'ACESSAR GRUPO VIP',
  supportTitle: 'Atendimento Oficial VIP',
  supportDescription:
    'Dúvidas sobre planos, validação de comprovantes ou entrada no Grupo VIP? Fale diretamente com nossa equipe pelo WhatsApp oficial.',
  supportHours: 'Atendimento diário das 09h às 22h (horário de Brasília)',
  footerText: '© 2026 VIP da Nicolly · Conteúdo exclusivo para maiores de 18 anos',
  termsText: '',
  privacyText: '',
  offerBannerText: '',
  showOfferBanner: false,
};

const DEFAULT_CONTROLS: SystemControlsConfig = {
  registrationEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: 'Plataforma em manutenção programada. Retornaremos em breve.',
  notifyNewClient: true,
  notifyNewProof: true,
  notifyExpiring: true,
};

const DEFAULT_PERMISSIONS: AdminPermissions = {
  canManageClients: true,
  canManageFinance: true,
  canManageSettings: true,
  canManageAdmins: true,
};

function loadContentDefaults(): SiteConfig {
  const fallback: SiteConfig = {
    hero: 'Um espaço exclusivo, íntimo e dedicado para quem deseja acompanhar conteúdos especiais e novidades.',
    whatsapp: '554192387993',
    whatsappLabel: '(41) 9238-7993',
    mensagem: 'Olá! Fiz o pagamento do meu plano VIP e gostaria de enviar o comprovante.',
    vipGroupInvite: '',
    plans: {
      semanal: {
        name: 'Semanal',
        preco: '25,00',
        amountCents: 2500,
        duracao: 7,
        link: 'https://mpago.la/1QU2TPC',
        active: true,
        offerBadge: '',
        description: 'Ideal para conhecer o espaço VIP por uma semana completa.',
      },
      mensal: {
        name: 'Mensal',
        preco: '50,00',
        amountCents: 5000,
        duracao: 30,
        link: 'https://mpago.la/1xxrBfv',
        active: true,
        offerBadge: 'Mais escolhido',
        description: 'Acesso contínuo durante 30 dias com renovação sob controle.',
      },
      vitalicio: {
        name: 'Vitalício',
        preco: '200,00',
        amountCents: 20000,
        duracao: 0,
        link: 'https://mpago.la/2PLqPsy',
        active: true,
        offerBadge: 'Acesso definitivo',
        description: 'Pague uma única vez e mantenha o acesso VIP sem vencimento.',
      },
    },
  };
  try {
    if (fs.existsSync(CONTENT_JSON_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONTENT_JSON_PATH, 'utf-8'));
      return {
        hero: raw.hero || fallback.hero,
        whatsapp: raw.whatsapp || fallback.whatsapp,
        whatsappLabel: raw.whatsappLabel || fallback.whatsappLabel,
        mensagem: raw.mensagem || fallback.mensagem,
        vipGroupInvite: raw.vipGroupInvite || '',
        plans: {
          semanal: { ...fallback.plans.semanal, ...(raw.plans?.semanal || {}), duracao: 7, amountCents: parseBrlToCents(raw.plans?.semanal?.preco) || 2500 },
          mensal: { ...fallback.plans.mensal, ...(raw.plans?.mensal || {}), duracao: 30, amountCents: parseBrlToCents(raw.plans?.mensal?.preco) || 5000 },
          vitalicio: { ...fallback.plans.vitalicio, ...(raw.plans?.vitalicio || {}), duracao: 0, amountCents: parseBrlToCents(raw.plans?.vitalicio?.preco) || 20000 },
        },
      };
    }
  } catch (err) {
    console.warn('Erro ao ler content.json, usando padrões:', err);
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// SQLite Relational Database Setup (Local Full-Stack Engine)
// ---------------------------------------------------------------------------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    username TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
    suspended INTEGER NOT NULL DEFAULT 0,
    terms_accepted_at TEXT NOT NULL,
    privacy_accepted_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan_key TEXT NOT NULL CHECK (plan_key IN ('semanal', 'mensal', 'vitalicio')),
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL DEFAULT 'aguardando_pagamento',
    provider TEXT NOT NULL DEFAULT 'mercadopago',
    provider_payment_id TEXT UNIQUE,
    external_reference TEXT UNIQUE NOT NULL,
    checkout_url TEXT,
    rejection_reason TEXT,
    approved_at TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payment_proofs (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'aguardando_analise',
    extracted_amount_cents INTEGER,
    extracted_reference TEXT,
    review_notes TEXT,
    reviewed_by TEXT REFERENCES profiles(id),
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS vip_group_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    plan_key TEXT NOT NULL CHECK (plan_key IN ('semanal', 'mensal', 'vitalicio')),
    status TEXT NOT NULL DEFAULT 'pendente_whatsapp'
      CHECK (status IN ('pendente_whatsapp', 'aceito_no_grupo', 'recusado_no_grupo')),
    admin_notes TEXT,
    reviewed_by TEXT REFERENCES profiles(id),
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_tab TEXT NOT NULL DEFAULT 'overview',
    record_id TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    admin_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    record_id TEXT,
    result TEXT NOT NULL DEFAULT 'sucesso',
    details TEXT DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed_cents')),
    discount_value INTEGER NOT NULL,
    applicable_plans TEXT NOT NULL DEFAULT '["semanal","mensal","vitalicio"]',
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    valid_from TEXT,
    valid_until TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id TEXT PRIMARY KEY,
    coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'outro',
    status TEXT NOT NULL DEFAULT 'aberto'
      CHECK (status IN ('aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'encerrado')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'alta')),
    admin_notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'admin')),
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'geral',
    storage_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS communication_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function ensureColumn(table: string, colName: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === colName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${definition}`);
  }
}

ensureColumn('profiles', 'admin_notes', 'TEXT');
ensureColumn('profiles', 'last_login_at', 'TEXT');
ensureColumn('profiles', 'permissions', 'TEXT');
ensureColumn('profiles', 'preferences', 'TEXT');
ensureColumn('payments', 'original_amount_cents', 'INTEGER');
ensureColumn('payments', 'discount_cents', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('payments', 'coupon_code', 'TEXT');
ensureColumn('payments', 'activation_origin', 'TEXT');
ensureColumn('audit_logs', 'result', "TEXT NOT NULL DEFAULT 'sucesso'");

// Seed initial settings & admin accounts
function seedDatabase() {
  const defaults = loadContentDefaults();
  const now = new Date().toISOString();
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)'
  );
  insertSetting.run('hero', JSON.stringify(defaults.hero), now);
  insertSetting.run('whatsapp', JSON.stringify(defaults.whatsapp), now);
  insertSetting.run('whatsapp_label', JSON.stringify(defaults.whatsappLabel), now);
  insertSetting.run('support_message', JSON.stringify(defaults.mensagem), now);
  insertSetting.run('vip_group_invite', JSON.stringify(defaults.vipGroupInvite || ''), now);
  insertSetting.run('plans', JSON.stringify(defaults.plans), now);
  insertSetting.run('site_appearance', JSON.stringify(DEFAULT_APPEARANCE), now);
  insertSetting.run('site_appearance_draft', JSON.stringify(DEFAULT_APPEARANCE), now);
  insertSetting.run('system_controls', JSON.stringify(DEFAULT_CONTROLS), now);
  insertSetting.run('communication_templates', JSON.stringify(DEFAULT_COMMUNICATION_TEMPLATES), now);
  insertSetting.run('plan_history', JSON.stringify([]), now);
  insertSetting.run(
    'integration_events',
    JSON.stringify({
      mercadopago: {
        lastEventAt: null,
        lastStatus: MERCADOPAGO_ACCESS_TOKEN ? 'configured' : 'pending',
        lastMessage: MERCADOPAGO_ACCESS_TOKEN ? 'Token configurado' : 'Aguardando token no ambiente',
        lastErrorAt: null,
        lastErrorMessage: null,
      },
      supabase: {
        lastEventAt: null,
        lastStatus: SUPABASE_CONFIGURED ? 'configured' : 'sqlite_fallback',
        lastMessage: SUPABASE_CONFIGURED ? 'Credenciais configuradas' : 'Operando em SQLite local',
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    }),
    now
  );

  const envOverridePass = (process.env.ADMIN_INITIAL_PASSWORD || '').trim();

  for (const seed of Object.values(PREHASHED_ADMIN_SEEDS)) {
    const existing = db
      .prepare('SELECT id FROM profiles WHERE lower(username) = lower(?) OR lower(email) = lower(?)')
      .get(seed.username, seed.email) as { id: string } | undefined;

    if (!existing) {
      const pwHash = envOverridePass ? hashPassword(envOverridePass) : seed.hash;
      db.prepare(`
        INSERT INTO profiles (
          id, display_name, username, email, phone, birth_date, password_hash, role,
          suspended, terms_accepted_at, privacy_accepted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 0, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        seed.displayName,
        seed.username,
        seed.email,
        '(41) 9238-7993',
        '1995-01-01',
        pwHash,
        now,
        now,
        now,
        now
      );
    }
  }
}

seedDatabase();

// ---------------------------------------------------------------------------
// Data Access Helpers (Unified over SQLite + optional Supabase Sync)
// ---------------------------------------------------------------------------
function getSettingJson<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

function getPublishedAppearance(): SiteAppearanceConfig {
  return getSettingJson<SiteAppearanceConfig>('site_appearance', DEFAULT_APPEARANCE);
}

function getDraftAppearance(): SiteAppearanceConfig {
  return getSettingJson<SiteAppearanceConfig>('site_appearance_draft', DEFAULT_APPEARANCE);
}

function getSystemControls(): SystemControlsConfig {
  return getSettingJson<SystemControlsConfig>('system_controls', DEFAULT_CONTROLS);
}

function getSiteSettings(): SiteConfig {
  const rows = db.prepare('SELECT key, value FROM site_settings').all() as Array<{ key: string; value: string }>;
  const map: Record<string, any> = {};
  for (const r of rows) {
    try {
      map[r.key] = JSON.parse(r.value);
    } catch {
      map[r.key] = r.value;
    }
  }
  const defaults = loadContentDefaults();
  const rawPlans = map.plans || defaults.plans;
  return {
    hero: map.hero || defaults.hero,
    whatsapp: map.whatsapp || defaults.whatsapp,
    whatsappLabel: map.whatsapp_label || defaults.whatsappLabel,
    mensagem: map.support_message || defaults.mensagem,
    vipGroupInvite: map.vip_group_invite || '',
    plans: {
      semanal: { ...defaults.plans.semanal, ...(rawPlans.semanal || {}) },
      mensal: { ...defaults.plans.mensal, ...(rawPlans.mensal || {}) },
      vitalicio: { ...defaults.plans.vitalicio, ...(rawPlans.vitalicio || {}) },
    },
    appearance: { ...DEFAULT_APPEARANCE, ...(map.site_appearance || {}) },
    controls: { ...DEFAULT_CONTROLS, ...(map.system_controls || {}) },
  };
}

function createNotification(opts: {
  type: string;
  title: string;
  message: string;
  targetTab: string;
  recordId?: string | null;
}) {
  db.prepare(`
    INSERT INTO notifications (id, type, title, message, target_tab, record_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    opts.type,
    opts.title,
    opts.message,
    opts.targetTab,
    opts.recordId || null,
    new Date().toISOString()
  );
}

function recordIntegrationEvent(service: 'mercadopago' | 'supabase', status: 'ok' | 'error', message: string) {
  const row = db.prepare("SELECT value FROM site_settings WHERE key = 'integration_events'").get() as { value: string } | undefined;
  let current: any = {};
  try {
    current = row ? JSON.parse(row.value) : {};
  } catch {
    current = {};
  }
  const now = new Date().toISOString();
  const prev = current[service] || {};
  current[service] = {
    lastEventAt: now,
    lastStatus: status,
    lastMessage: message,
    lastErrorAt: status === 'error' ? now : prev.lastErrorAt || null,
    lastErrorMessage: status === 'error' ? message : prev.lastErrorMessage || null,
  };
  db.prepare(`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES ('integration_events', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(JSON.stringify(current), now);
}

function getIntegrationEvents() {
  const row = db.prepare("SELECT value FROM site_settings WHERE key = 'integration_events'").get() as { value: string } | undefined;
  try {
    return row ? JSON.parse(row.value) : {};
  } catch {
    return {};
  }
}

function expireOverdueSubscriptions(): number {
  const nowIso = new Date().toISOString();
  const overdueRows = db
    .prepare(`
      SELECT id, user_id, plan_key
      FROM payments
      WHERE status = 'aprovado'
        AND expires_at IS NOT NULL
        AND expires_at <= ?
    `)
    .all(nowIso) as Array<{ id: string; user_id: string; plan_key: PlanKey }>;

  if (overdueRows.length > 0) {
    const info = db
      .prepare(`
        UPDATE payments
        SET status = 'expirado', updated_at = ?
        WHERE status = 'aprovado'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
      `)
      .run(nowIso, nowIso);

    if (info.changes > 0) {
      const controls = getSystemControls();
      if (controls.notifyExpiring) {
        createNotification({
          type: 'expired_sweep',
          title: 'Assinaturas vencidas bloqueadas',
          message: `${info.changes} assinatura(s) atingiram o vencimento e foram bloqueadas automaticamente.`,
          targetTab: 'subscriptions',
        });
      }
      for (const row of overdueRows) {
        dispatchUserCommunication(db, {
          userId: row.user_id,
          eventKey: 'expired',
          vars: { plano: row.plan_key },
        });
      }
    }
    return info.changes;
  }

  // Also check expiring soon (<= 3 days) without spamming (at most once per 4 days)
  const in3DaysIso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const fourDaysAgoIso = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const expiringRows = db
    .prepare(`
      SELECT id, user_id, plan_key, expires_at
      FROM payments
      WHERE status = 'aprovado'
        AND expires_at IS NOT NULL
        AND expires_at > ?
        AND expires_at <= ?
    `)
    .all(nowIso, in3DaysIso) as Array<{ id: string; user_id: string; plan_key: PlanKey; expires_at: string }>;

  for (const row of expiringRows) {
    const recent = db
      .prepare(`
        SELECT id FROM user_notifications
        WHERE user_id = ? AND event_key = 'expiring_soon' AND created_at > ?
        LIMIT 1
      `)
      .get(row.user_id, fourDaysAgoIso);
    if (!recent) {
      const daysLeft = Math.max(
        1,
        Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      );
      dispatchUserCommunication(db, {
        userId: row.user_id,
        eventKey: 'expiring_soon',
        vars: { plano: row.plan_key, dias: String(daysLeft) },
      });
    }
  }

  return 0;
}

function getUserSubscriptionSummary(userId: string, isSuspended: boolean): SubscriptionSummary {
  expireOverdueSubscriptions();
  const settings = getSiteSettings();

  if (isSuspended) {
    return {
      hasVipAccess: false,
      statusLabel: 'Acesso suspenso',
      planKey: null,
      planName: null,
      approvedAt: null,
      expiresAt: null,
      daysRemaining: null,
      isExpired: false,
    };
  }

  // Look for latest valid active subscription
  const active = db.prepare(`
    SELECT * FROM payments
    WHERE user_id = ?
      AND status = 'aprovado'
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY COALESCE(expires_at, '9999-12-31') DESC, approved_at DESC
    LIMIT 1
  `).get(userId, new Date().toISOString()) as any;

  if (active) {
    const planKey = active.plan_key as PlanKey;
    const planName = settings.plans[planKey]?.name || planKey;
    let daysRemaining: number | null = null;
    if (active.expires_at) {
      const diffMs = new Date(active.expires_at).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    }
    return {
      hasVipAccess: true,
      statusLabel: planKey === 'vitalicio' ? 'VIP Vitalício Ativo' : 'Assinatura Ativa',
      planKey,
      planName,
      approvedAt: active.approved_at,
      expiresAt: active.expires_at,
      daysRemaining,
      isExpired: false,
    };
  }

  // Check if user has an expired subscription
  const expired = db.prepare(`
    SELECT * FROM payments
    WHERE user_id = ? AND status = 'expirado'
    ORDER BY expires_at DESC LIMIT 1
  `).get(userId) as any;

  if (expired) {
    const planKey = expired.plan_key as PlanKey;
    return {
      hasVipAccess: false,
      statusLabel: 'Assinatura Vencida',
      planKey,
      planName: settings.plans[planKey]?.name || planKey,
      approvedAt: expired.approved_at,
      expiresAt: expired.expires_at,
      daysRemaining: 0,
      isExpired: true,
    };
  }

  // Check latest pending payment
  const pending = db.prepare(`
    SELECT * FROM payments
    WHERE user_id = ? AND status IN ('aguardando_analise', 'em_analise', 'aguardando_pagamento')
    ORDER BY created_at DESC LIMIT 1
  `).get(userId) as any;

  if (pending) {
    const planKey = pending.plan_key as PlanKey;
    const labelMap: Record<string, string> = {
      aguardando_pagamento: 'Aguardando pagamento',
      aguardando_analise: 'Comprovante em análise',
      em_analise: 'Em análise administrativa',
    };
    return {
      hasVipAccess: false,
      statusLabel: labelMap[pending.status] || 'Pendente',
      planKey,
      planName: settings.plans[planKey]?.name || planKey,
      approvedAt: null,
      expiresAt: null,
      daysRemaining: null,
      isExpired: false,
    };
  }

  return {
    hasVipAccess: false,
    statusLabel: 'Sem assinatura ativa',
    planKey: null,
    planName: null,
    approvedAt: null,
    expiresAt: null,
    daysRemaining: null,
    isExpired: false,
  };
}

function mapProfile(row: any): UserProfile {
  let perms: AdminPermissions | undefined = undefined;
  if (row.role === 'admin') {
    try {
      perms = row.permissions ? { ...DEFAULT_PERMISSIONS, ...JSON.parse(row.permissions) } : DEFAULT_PERMISSIONS;
    } catch {
      perms = DEFAULT_PERMISSIONS;
    }
  }
  let prefs = { theme: 'dark' as 'dark' | 'light', inAppNotifications: true, emailUpdates: false };
  if (row.preferences) {
    try {
      prefs = { ...prefs, ...JSON.parse(row.preferences) };
    } catch {
      // ignore invalid json
    }
  }
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username || null,
    email: row.email,
    phone: row.phone,
    birthDate: row.birth_date,
    role: row.role,
    suspended: Boolean(row.suspended),
    adminNotes: row.admin_notes || null,
    lastLoginAt: row.last_login_at || null,
    permissions: perms,
    preferences: prefs,
    createdAt: row.created_at,
  };
}

function logAudit(
  adminId: string | null,
  action: string,
  recordId: string | null,
  details: Record<string, unknown> = {},
  result = 'sucesso'
) {
  db.prepare(`
    INSERT INTO audit_logs (id, admin_id, action, record_id, result, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), adminId, action, recordId, result, JSON.stringify(details), new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Signed Session Cookies & Rate Limiting
// ---------------------------------------------------------------------------
function signSessionId(sessionId: string): string {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex');
  return `${sessionId}.${sig}`;
}

function verifySignedSessionCookie(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [sessionId, sig] = token.split('.');
  if (!sessionId || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return sessionId;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= 5) {
    return { allowed: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }
}

function clearFailedAttempts(key: string) {
  loginAttempts.delete(key);
}

interface AuthedRequest extends Request {
  user?: UserProfile;
  sessionId?: string;
}

async function resolveSessionUser(req: Request): Promise<{ user: UserProfile; sessionId: string } | null> {
  // 1. Check Supabase Bearer Token if configured
  const authHeader = req.headers.authorization;
  if (SUPABASE_CONFIGURED && supabaseAdmin && authHeader?.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7).trim();
    const { data, error } = await supabaseAdmin.auth.getUser(jwt);
    if (!error && data.user) {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (prof && !prof.suspended) {
        return {
          user: {
            id: prof.id,
            displayName: prof.display_name,
            username: prof.username,
            email: prof.email,
            phone: prof.phone,
            birthDate: prof.birth_date,
            role: prof.role,
            suspended: prof.suspended,
            createdAt: prof.created_at,
          },
          sessionId: 'supabase-jwt',
        };
      }
    }
  }

  // 2. Check HTTP-only signed session cookie
  const rawCookie = req.cookies?.[COOKIE_NAME];
  const sessionId = verifySignedSessionCookie(rawCookie);
  if (!sessionId) return null;

  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
    .get(sessionId, new Date().toISOString()) as any;
  if (!session) return null;

  const userRow = db.prepare('SELECT * FROM profiles WHERE id = ?').get(session.user_id) as any;
  if (!userRow) return null;

  return { user: mapProfile(userRow), sessionId };
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const resolved = await resolveSessionUser(req);
  if (!resolved) {
    res.status(401).json({ error: 'Autenticação obrigatória.' });
    return;
  }
  if (resolved.user.suspended) {
    res.status(403).json({ error: 'Sua conta está suspensa. Entre em contato com o suporte.' });
    return;
  }
  req.user = resolved.user;
  req.sessionId = resolved.sessionId;
  next();
}

async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const resolved = await resolveSessionUser(req);
  if (!resolved) {
    logAudit(null, 'tentativa_acesso_negado', req.originalUrl || '/api/admin', {
      reason: 'unauthenticated',
      ip: req.ip || 'unknown',
    }, 'negado');
    res.status(401).json({ error: 'Autenticação obrigatória.' });
    return;
  }
  if (resolved.user.suspended) {
    logAudit(resolved.user.id, 'tentativa_acesso_negado', req.originalUrl || '/api/admin', {
      reason: 'suspended',
    }, 'negado');
    res.status(403).json({ error: 'Sua conta está suspensa.' });
    return;
  }
  if (resolved.user.role !== 'admin') {
    logAudit(resolved.user.id, 'tentativa_acesso_negado', req.originalUrl || '/api/admin', {
      reason: 'not_admin',
      email: resolved.user.email,
    }, 'negado');
    res.status(403).json({ error: 'Acesso restrito a administradores autorizados.' });
    return;
  }
  req.user = resolved.user;
  req.sessionId = resolved.sessionId;
  next();
}

function issueSessionCookie(res: Response, userId: string): string {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    sessionId,
    userId,
    expiresAt.toISOString(),
    now.toISOString()
  );
  res.cookie(COOKIE_NAME, signSessionId(sessionId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
  return sessionId;
}

// ---------------------------------------------------------------------------
// Multer Upload Configuration (Strict Proof Validation)
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato não suportado. Envie JPG, PNG, WebP ou PDF.'));
    }
  },
});

// ---------------------------------------------------------------------------
// Express App Initialization
// ---------------------------------------------------------------------------
async function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Same-origin CSRF guard on browser API mutations (exempting external webhooks)
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/webhooks/mercadopago') {
      next();
      return;
    }
    const originHeader = req.headers.origin;
    const hostHeader = req.headers.host;
    if (originHeader && hostHeader) {
      try {
        const originHost = new URL(originHeader).host;
        if (originHost !== hostHeader) {
          logAudit(null, 'bloqueio_csrf_origem', req.path, { originHost, hostHeader }, 'negado');
          res.status(403).json({ error: 'Origem da requisição não autorizada.' });
          return;
        }
      } catch {
        res.status(403).json({ error: 'Cabeçalho Origin inválido.' });
        return;
      }
    }
    next();
  });

  // Never serve internal content.json or private_storage over HTTP
  app.all('/content.json', (_req, res) => res.status(404).send('Not found'));
  app.all('/private_storage*', (_req, res) => res.status(404).send('Not found'));

  // -------------------------------------------------------------------------
  // Public System Status (non-secret flags only)
  // -------------------------------------------------------------------------
  app.get('/api/system/status', (_req, res) => {
    res.json({
      supabaseConfigured: SUPABASE_CONFIGURED,
      mercadoPagoConfigured: Boolean(MERCADOPAGO_ACCESS_TOKEN),
      webhookSecretConfigured: Boolean(MERCADOPAGO_WEBHOOK_SECRET),
    });
  });

  // Public Appearance, Maintenance flags, Support WhatsApp & non-sensitive plan summaries
  // (ZERO checkout links or private vipGroupInvite exposed before login)
  app.get('/api/public/appearance', (_req, res) => {
    const appearance = getPublishedAppearance();
    const controls = getSystemControls();
    const settings = getSiteSettings();
    const planSummaries = (['semanal', 'mensal', 'vitalicio'] as PlanKey[]).map((key) => {
      const p = settings.plans[key];
      return {
        key,
        name: p.name,
        preco: p.preco,
        duracao: p.duracao,
        active: p.active !== false,
        offerBadge: p.offerBadge || '',
        description: p.description || '',
      };
    });
    res.json({
      appearance,
      maintenanceMode: controls.maintenanceMode,
      maintenanceMessage: controls.maintenanceMessage,
      registrationEnabled: controls.registrationEnabled,
      whatsapp: settings.whatsapp,
      whatsappLabel: settings.whatsappLabel,
      planSummaries,
    });
  });

  // -------------------------------------------------------------------------
  // Auth Routes
  // -------------------------------------------------------------------------
  app.get('/api/auth/me', async (req: AuthedRequest, res: Response) => {
    const controls = getSystemControls();
    const resolved = await resolveSessionUser(req);
    if (!resolved) {
      res.json({
        authenticated: false,
        maintenanceMode: controls.maintenanceMode,
        maintenanceMessage: controls.maintenanceMessage,
      });
      return;
    }
    const { user } = resolved;
    const subscription = getUserSubscriptionSummary(user.id, user.suspended);
    res.json({
      authenticated: true,
      user,
      subscription,
      maintenanceMode: controls.maintenanceMode,
      maintenanceMessage: controls.maintenanceMessage,
    });
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const controls = getSystemControls();
      if (!controls.registrationEnabled) {
        res.status(403).json({ error: 'Novos cadastros estão temporariamente pausados pela administração.' });
        return;
      }
      if (controls.maintenanceMode) {
        res.status(503).json({ error: controls.maintenanceMessage });
        return;
      }
      const {
        displayName,
        phone,
        email,
        birthDate,
        password,
        confirmPassword,
        acceptTerms,
        acceptPrivacy,
        confirm18Plus,
      } = req.body || {};

      const cleanName = String(displayName || '').trim();
      const cleanPhone = String(phone || '').trim();
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanBirth = String(birthDate || '').trim();
      const pass = String(password || '');
      const confirm = String(confirmPassword || '');

      if (cleanName.length < 3) {
        res.status(400).json({ error: 'Informe seu nome completo (mínimo 3 caracteres).' });
        return;
      }
      if (cleanPhone.replace(/\D/g, '').length < 10) {
        res.status(400).json({ error: 'Informe um telefone válido com DDD.' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'Informe um e-mail válido.' });
        return;
      }
      if (!isAdult(cleanBirth)) {
        res.status(400).json({ error: 'Acesso permitido exclusivamente para maiores de 18 anos.' });
        return;
      }
      if (!confirm18Plus) {
        res.status(400).json({ error: 'Você deve confirmar ter 18 anos ou mais.' });
        return;
      }
      if (!acceptTerms || !acceptPrivacy) {
        res.status(400).json({ error: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade.' });
        return;
      }
      if (pass.length < 6) {
        res.status(400).json({ error: 'A senha deve possuir no mínimo 6 caracteres.' });
        return;
      }
      if (pass !== confirm) {
        res.status(400).json({ error: 'As senhas informadas não conferem.' });
        return;
      }

      const existing = db
        .prepare('SELECT id FROM profiles WHERE lower(email) = lower(?)')
        .get(cleanEmail);
      if (existing) {
        res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
        return;
      }

      const now = new Date().toISOString();
      let userId: string = crypto.randomUUID();

      // If Supabase is configured, register in Supabase Auth & profiles too
      if (SUPABASE_CONFIGURED && supabaseAdmin) {
        const { data: createdUser, error: sbError } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: pass,
          email_confirm: true,
          user_metadata: { display_name: cleanName },
        });
        if (sbError) {
          res.status(400).json({ error: sbError.message });
          return;
        }
        if (createdUser.user) {
          userId = createdUser.user.id;
          await supabaseAdmin.from('profiles').insert({
            id: userId,
            display_name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            birth_date: cleanBirth,
            role: 'client',
            suspended: false,
          });
        }
      }

      const pwHash = hashPassword(pass);
      const defaultPrefs = JSON.stringify({ theme: 'dark', inAppNotifications: true, emailUpdates: false });
      db.prepare(`
        INSERT INTO profiles (
          id, display_name, username, email, phone, birth_date, password_hash,
          role, suspended, preferences, terms_accepted_at, privacy_accepted_at, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'client', 0, ?, ?, ?, ?, ?)
      `).run(userId, cleanName, cleanEmail, cleanPhone, cleanBirth, pwHash, defaultPrefs, now, now, now, now);

      issueSessionCookie(res, userId);
      dispatchUserCommunication(db, { userId, eventKey: 'new_signup' });

      if (controls.notifyNewClient) {
        createNotification({
          type: 'new_client',
          title: 'Novo cliente cadastrado',
          message: `${cleanName} (${cleanEmail}) criou uma conta na plataforma.`,
          targetTab: 'customers',
          recordId: userId,
        });
      }

      const userRow = db.prepare('SELECT * FROM profiles WHERE id = ?').get(userId);
      const user = mapProfile(userRow);
      res.status(201).json({
        authenticated: true,
        user,
        subscription: getUserSubscriptionSummary(userId, false),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro interno ao criar conta.' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const identifier = String(req.body?.identifier || req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const clientIp = req.ip || 'unknown';
    const rateKey = `${clientIp}:${identifier}`;

    const limit = checkRateLimit(rateKey);
    if (!limit.allowed) {
      logAudit(null, 'tentativa_login_bloqueada', identifier, { ip: clientIp }, 'negado');
      res.status(429).json({
        error: `Muitas tentativas inválidas. Aguarde ${Math.ceil(limit.retryAfterSec / 60)} minuto(s) e tente novamente.`,
      });
      return;
    }

    if (!identifier || !password) {
      res.status(400).json({ error: 'Informe seu e-mail (ou usuário) e sua senha.' });
      return;
    }

    const userRow = db
      .prepare('SELECT * FROM profiles WHERE lower(email) = ? OR lower(username) = ? LIMIT 1')
      .get(identifier, identifier) as any;

    let valid = false;
    if (userRow && verifyPassword(password, userRow.password_hash)) {
      valid = true;
    } else if (SUPABASE_CONFIGURED && supabasePublic && identifier.includes('@')) {
      const { data } = await supabasePublic.auth.signInWithPassword({ email: identifier, password });
      if (data.user && userRow) {
        valid = true;
      }
    }

    if (!valid || !userRow) {
      recordFailedAttempt(rateKey);
      res.status(401).json({ error: 'Credenciais inválidas. Verifique os dados informados.' });
      return;
    }

    if (userRow.suspended) {
      res.status(403).json({ error: 'Conta suspensa pelo administrador.' });
      return;
    }

    const controls = getSystemControls();
    if (controls.maintenanceMode && userRow.role !== 'admin') {
      res.status(503).json({ error: controls.maintenanceMessage });
      return;
    }

    clearFailedAttempts(rateKey);
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE profiles SET last_login_at = ? WHERE id = ?').run(nowIso, userRow.id);
    userRow.last_login_at = nowIso;
    issueSessionCookie(res, userRow.id);
    const user = mapProfile(userRow);
    res.json({
      authenticated: true,
      user,
      subscription: getUserSubscriptionSummary(user.id, user.suspended),
    });
  });

  app.post('/api/auth/admin-login', async (req: Request, res: Response) => {
    const identifier = String(req.body?.identifier || req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const clientIp = req.ip || 'unknown';
    const rateKey = `admin:${clientIp}:${identifier}`;

    const limit = checkRateLimit(rateKey);
    if (!limit.allowed) {
      logAudit(null, 'tentativa_login_bloqueada', identifier, { ip: clientIp, scope: 'admin' }, 'negado');
      res.status(429).json({
        error: `Muitas tentativas inválidas. Aguarde ${Math.ceil(limit.retryAfterSec / 60)} minuto(s) e tente novamente.`,
      });
      return;
    }

    if (!identifier || !password) {
      res.status(400).json({ error: 'Informe seu usuário administrativo e sua senha.' });
      return;
    }

    const userRow = db
      .prepare('SELECT * FROM profiles WHERE lower(username) = ? OR lower(email) = ? LIMIT 1')
      .get(identifier, identifier) as any;

    if (!userRow || !verifyPassword(password, userRow.password_hash)) {
      recordFailedAttempt(rateKey);
      logAudit(null, 'tentativa_login_admin_invalida', identifier, { ip: clientIp }, 'negado');
      res.status(401).json({ error: 'Credenciais administrativas inválidas.' });
      return;
    }

    if (userRow.role !== 'admin') {
      recordFailedAttempt(rateKey);
      logAudit(userRow.id, 'tentativa_acesso_negado', '/api/auth/admin-login', { email: userRow.email }, 'negado');
      res.status(403).json({ error: 'Esta conta não possui permissão de administrador.' });
      return;
    }

    if (userRow.suspended) {
      res.status(403).json({ error: 'Conta administrativa suspensa.' });
      return;
    }

    clearFailedAttempts(rateKey);
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE profiles SET last_login_at = ? WHERE id = ?').run(nowIso, userRow.id);
    userRow.last_login_at = nowIso;
    issueSessionCookie(res, userRow.id);
    const user = mapProfile(userRow);
    logAudit(user.id, 'login_administrativo', user.id, { username: user.username });
    res.json({
      authenticated: true,
      user,
      subscription: getUserSubscriptionSummary(user.id, user.suspended),
    });
  });

  app.post('/api/auth/logout', async (req: AuthedRequest, res: Response) => {
    const rawCookie = req.cookies?.[COOKIE_NAME];
    const sessionId = verifySignedSessionCookie(rawCookie);
    if (sessionId) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }

    if (SUPABASE_CONFIGURED && supabasePublic) {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      await supabasePublic.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${appUrl}/recuperar-senha`,
      });
      res.json({
        message: 'Se o e-mail estiver cadastrado, enviamos as instruções de redefinição pelo Supabase Auth.',
      });
      return;
    }

    const userRow = db
      .prepare('SELECT id, role FROM profiles WHERE lower(email) = ?')
      .get(cleanEmail) as any;

    if (userRow && userRow.role === 'client') {
      const token = crypto.randomBytes(24).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const now = new Date();
      const expires = new Date(now.getTime() + 30 * 60 * 1000);
      db.prepare(
        'INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), userRow.id, tokenHash, expires.toISOString(), now.toISOString());
    }

    res.json({
      message:
        'Solicitação registrada. Quando o serviço de e-mail do Supabase Auth estiver configurado, o link de redefinição será enviado automaticamente.',
    });
  });

  app.patch('/api/auth/profile', requireAuth, async (req: AuthedRequest, res: Response) => {
    const displayName = String(req.body?.displayName || '').trim();
    const phone = String(req.body?.phone || '').trim();

    if (displayName.length < 3) {
      res.status(400).json({ error: 'Informe seu nome completo (mínimo 3 caracteres).' });
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      res.status(400).json({ error: 'Informe um telefone válido com DDD.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE profiles SET display_name = ?, phone = ?, updated_at = ? WHERE id = ?').run(
      displayName,
      phone,
      now,
      req.user!.id
    );

    if (SUPABASE_CONFIGURED && supabaseAdmin) {
      await supabaseAdmin
        .from('profiles')
        .update({ display_name: displayName, phone, updated_at: now })
        .eq('id', req.user!.id);
    }

    const updated = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.user!.id);
    res.json({ ok: true, user: mapProfile(updated) });
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
      return;
    }

    const row = db.prepare('SELECT password_hash FROM profiles WHERE id = ?').get(req.user!.id) as any;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Senha atual incorreta.' });
      return;
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      now,
      req.user!.id
    );

    if (SUPABASE_CONFIGURED && supabaseAdmin) {
      await supabaseAdmin.auth.admin.updateUserById(req.user!.id, { password: newPassword });
    }

    res.json({ ok: true, message: 'Sua senha foi atualizada com segurança.' });
  });

  // -------------------------------------------------------------------------
  // Authenticated Client Area & Plans (Never exposed before login)
  // -------------------------------------------------------------------------
  app.get('/api/plans', requireAuth, (_req: AuthedRequest, res: Response) => {
    const settings = getSiteSettings();
    const appearance = getPublishedAppearance();
    res.json({
      hero: appearance.welcomeMessage || settings.hero,
      whatsapp: settings.whatsapp,
      whatsappLabel: settings.whatsappLabel,
      mensagem: settings.mensagem,
      plans: settings.plans,
      appearance,
    });
  });

  app.get('/api/vip/access', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const sub = getUserSubscriptionSummary(user.id, user.suspended);
    const appearance = getPublishedAppearance();

    if (!sub.hasVipAccess) {
      res.status(403).json({
        error: sub.isExpired
          ? appearance.expiredMessage || 'Sua assinatura venceu. Renove um plano para recuperar o acesso à Área VIP.'
          : 'Acesso exclusivo para assinantes com pagamento confirmado.',
        subscription: sub,
      });
      return;
    }

    const settings = getSiteSettings();
    const lastRequest = db
      .prepare('SELECT * FROM vip_group_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(user.id) as any;

    // IMPORTANT: Never expose raw vipGroupInvite link to client! Entry happens via WhatsApp request to Nicolly.
    res.json({
      authorized: true,
      subscription: sub,
      supportWhatsapp: settings.whatsapp,
      supportWhatsappLabel: settings.whatsappLabel,
      groupRequestStatus: lastRequest?.status || null,
      lastGroupRequestAt: lastRequest?.created_at || null,
      vipTitle: appearance.vipTitle,
      vipDescription: appearance.vipDescription,
      approvedMessage: appearance.approvedMessage,
    });
  });

  app.post('/api/vip/request-group-entry', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.user!;
    const sub = getUserSubscriptionSummary(user.id, user.suspended);

    if (!sub.hasVipAccess || !sub.planKey) {
      res.status(403).json({
        error: 'Somente assinantes ativos e confirmados podem solicitar entrada no Grupo VIP.',
      });
      return;
    }

    const settings = getSiteSettings();
    const requestId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO vip_group_requests (id, user_id, plan_key, status, created_at)
      VALUES (?, ?, ?, 'pendente_whatsapp', ?)
    `).run(requestId, user.id, sub.planKey, now);

    createNotification({
      type: 'vip_group_request',
      title: 'Solicitação de entrada no Grupo VIP',
      message: `${user.displayName} (${sub.planName}) clicou em Acessar Grupo VIP e foi direcionado ao WhatsApp da Nicolly.`,
      targetTab: 'vip-group',
      recordId: requestId,
    });

    const validityLabel =
      sub.planKey === 'vitalicio'
        ? 'Vitalício (sem vencimento)'
        : sub.expiresAt
        ? new Date(sub.expiresAt).toLocaleDateString('pt-BR')
        : 'Ativo';

    const waText = [
      `Olá Nicolly! Sou assinante VIP confirmado no site.`,
      `Nome: ${user.displayName}`,
      `E-mail: ${user.email}`,
      `Telefone: ${user.phone}`,
      `Plano ativo: ${sub.planName} (Validade: ${validityLabel})`,
      `Gostaria de solicitar minha entrada no Grupo VIP.`,
    ].join('\n');

    const whatsappUrl = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(waText)}`;

    res.status(201).json({
      ok: true,
      requestId,
      status: 'pendente_whatsapp',
      whatsappUrl,
      message: 'Solicitação registrada! Conclua o envio da mensagem no WhatsApp oficial da Nicolly para ser aceito no grupo.',
    });
  });

  // -------------------------------------------------------------------------
  // Client Payments & Proofs
  // -------------------------------------------------------------------------
  app.get('/api/payments/my', requireAuth, (req: AuthedRequest, res: Response) => {
    expireOverdueSubscriptions();
    const user = req.user!;
    const payments = db
      .prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC')
      .all(user.id) as any[];

    const proofs = db
      .prepare('SELECT * FROM payment_proofs WHERE user_id = ? ORDER BY created_at DESC')
      .all(user.id) as any[];

    const mapped: PaymentRecord[] = payments.map((p) => ({
      id: p.id,
      userId: p.user_id,
      planKey: p.plan_key,
      amountCents: p.amount_cents,
      originalAmountCents: p.original_amount_cents ?? p.amount_cents,
      discountCents: p.discount_cents || 0,
      couponCode: p.coupon_code || null,
      activationOrigin: p.activation_origin || null,
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      providerPaymentId: p.provider_payment_id,
      externalReference: p.external_reference,
      checkoutUrl: p.checkout_url,
      rejectionReason: p.rejection_reason,
      approvedAt: p.approved_at,
      expiresAt: p.expires_at,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      proofs: proofs
        .filter((pr) => pr.payment_id === p.id)
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
        })),
    }));

    res.json({
      payments: mapped,
      subscription: getUserSubscriptionSummary(user.id, user.suspended),
    });
  });

  app.post('/api/payments/checkout', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.user!;
      const planKey = String(req.body?.planKey || '') as PlanKey;
      const couponCodeInput = String(req.body?.couponCode || '').trim();
      const settings = getSiteSettings();
      const plan: PlanConfig | undefined = settings.plans[planKey];

      if (!plan || !['semanal', 'mensal', 'vitalicio'].includes(planKey)) {
        res.status(400).json({ error: 'Plano inválido selecionado.' });
        return;
      }

      const originalAmountCents = plan.amountCents || parseBrlToCents(plan.preco);
      let amountCents = originalAmountCents;
      let discountCents = 0;
      let appliedCouponCode: string | null = null;
      let appliedCouponId: string | null = null;

      if (couponCodeInput) {
        const couponRes = validateCouponForUser(db, {
          code: couponCodeInput,
          planKey,
          amountCents: originalAmountCents,
          userId: user.id,
        });
        if (!couponRes.ok) {
          res.status(400).json({ error: couponRes.error });
          return;
        }
        amountCents = couponRes.finalAmountCents;
        discountCents = couponRes.discountCents;
        appliedCouponCode = couponRes.code;
        appliedCouponId = couponRes.couponId;
      }

      const paymentId = crypto.randomUUID();
      const externalRef = `VIP-${user.id.slice(0, 8)}-${planKey}-${Date.now()}-${crypto
        .randomBytes(3)
        .toString('hex')}`;
      const now = new Date().toISOString();

      let checkoutUrl = plan.link;
      let mode: 'mercadopago_api' | 'external_link_manual' = 'external_link_manual';
      let notice =
        'MERCADOPAGO_ACCESS_TOKEN não configurado no servidor. Utilize o link oficial do plano para pagar e envie o comprovante na Área do Cliente para análise.';

      if (MERCADOPAGO_ACCESS_TOKEN) {
        const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
        const prefPayload = {
          items: [
            {
              id: planKey,
              title: appliedCouponCode
                ? `VIP da Nicolly — Plano ${plan.name} (Cupom ${appliedCouponCode})`
                : `VIP da Nicolly — Plano ${plan.name}`,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: Number((amountCents / 100).toFixed(2)),
            },
          ],
          payer: {
            email: user.email,
            name: user.displayName,
          },
          external_reference: externalRef,
          notification_url: `${appUrl}/api/webhooks/mercadopago`,
          back_urls: {
            success: `${appUrl}/pagamento/aprovado?ref=${externalRef}`,
            pending: `${appUrl}/pagamento/pendente?ref=${externalRef}`,
            failure: `${appUrl}/pagamento/recusado?ref=${externalRef}`,
          },
          auto_return: 'approved',
        };

        const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(prefPayload),
        });

        if (!mpRes.ok) {
          const errText = await mpRes.text();
          res.status(502).json({
            error: 'Falha ao criar preferência oficial no Mercado Pago.',
            details: errText,
          });
          return;
        }

        const mpData = (await mpRes.json()) as any;
        checkoutUrl = mpData.init_point;
        mode = 'mercadopago_api';
        notice =
          'Preferência individual gerada no Mercado Pago. Após concluir o pagamento, o acesso será liberado automaticamente após validação do webhook oficial.';
      }

      db.prepare(`
        INSERT INTO payments (
          id, user_id, plan_key, amount_cents, original_amount_cents, discount_cents, coupon_code,
          currency, status, provider, external_reference, checkout_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BRL', 'aguardando_pagamento', 'mercadopago', ?, ?, ?, ?)
      `).run(
        paymentId,
        user.id,
        planKey,
        amountCents,
        originalAmountCents,
        discountCents,
        appliedCouponCode,
        externalRef,
        checkoutUrl,
        now,
        now
      );

      if (appliedCouponId) {
        db.prepare(`
          INSERT INTO coupon_redemptions (id, coupon_id, user_id, payment_id, discount_cents, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), appliedCouponId, user.id, paymentId, discountCents, now);
        db.prepare('UPDATE coupons SET used_count = used_count + 1, updated_at = ? WHERE id = ?').run(
          now,
          appliedCouponId
        );
      }

      const created = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;

      res.status(201).json({
        mode,
        notice,
        checkoutUrl,
        fallbackLink: plan.link,
        payment: {
          id: created.id,
          userId: created.user_id,
          planKey: created.plan_key,
          amountCents: created.amount_cents,
          originalAmountCents: created.original_amount_cents,
          discountCents: created.discount_cents || 0,
          couponCode: created.coupon_code || null,
          currency: created.currency,
          status: created.status,
          externalReference: created.external_reference,
          checkoutUrl: created.checkout_url,
          createdAt: created.created_at,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro ao iniciar checkout.' });
    }
  });

  // Upload payment proof (image or PDF) to private storage
  app.post('/api/proofs', requireAuth, upload.single('file'), async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.user!;
      if (!req.file) {
        res.status(400).json({ error: 'Selecione um arquivo de comprovante (JPG, PNG, WebP ou PDF).' });
        return;
      }

      let paymentId = String(req.body?.paymentId || '').trim();
      const planKeyInput = String(req.body?.planKey || 'mensal') as PlanKey;
      const extractedRef = String(req.body?.extractedReference || '').trim() || null;
      const extractedAmountRaw = req.body?.extractedAmount;
      const extractedAmountCents = extractedAmountRaw ? parseBrlToCents(extractedAmountRaw) : null;

      const settings = getSiteSettings();
      const now = new Date().toISOString();

      if (paymentId) {
        const pay = db
          .prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?')
          .get(paymentId, user.id) as any;
        if (!pay) {
          res.status(404).json({ error: 'Cobrança não encontrada para esta conta.' });
          return;
        }
      } else {
        if (!['semanal', 'mensal', 'vitalicio'].includes(planKeyInput)) {
          res.status(400).json({ error: 'Informe um plano válido para o comprovante.' });
          return;
        }
        const plan = settings.plans[planKeyInput];
        paymentId = crypto.randomUUID();
        const externalRef = `VIP-MANUAL-${user.id.slice(0, 8)}-${planKeyInput}-${Date.now()}`;
        db.prepare(`
          INSERT INTO payments (
            id, user_id, plan_key, amount_cents, currency, status, provider,
            external_reference, checkout_url, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'BRL', 'aguardando_analise', 'mercadopago_link', ?, ?, ?, ?)
        `).run(paymentId, user.id, planKeyInput, plan.amountCents, externalRef, plan.link, now, now);
      }

      const proofId = crypto.randomUUID();
      const ext = path.extname(req.file.originalname).toLowerCase() || '.bin';
      const safeName = `${proofId}${ext}`;
      const storagePath = `${user.id}/${safeName}`;

      if (SUPABASE_CONFIGURED && supabaseAdmin) {
        const { error: upErr } = await supabaseAdmin.storage
          .from('payment-proofs')
          .upload(storagePath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });
        if (upErr) {
          res.status(500).json({ error: `Erro ao enviar ao Storage: ${upErr.message}` });
          return;
        }
      } else {
        const userDir = path.join(PROOFS_DIR, user.id);
        fs.mkdirSync(userDir, { recursive: true });
        fs.writeFileSync(path.join(userDir, safeName), req.file.buffer);
      }

      db.prepare(`
        INSERT INTO payment_proofs (
          id, payment_id, user_id, storage_path, original_filename, mime_type, size_bytes,
          status, extracted_amount_cents, extracted_reference, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'aguardando_analise', ?, ?, ?)
      `).run(
        proofId,
        paymentId,
        user.id,
        storagePath,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        extractedAmountCents,
        extractedRef,
        now
      );

      // Update payment status from aguardando_pagamento -> aguardando_analise (never auto-approve!)
      db.prepare(`
        UPDATE payments
        SET status = CASE WHEN status IN ('aguardando_pagamento', 'recusado') THEN 'aguardando_analise' ELSE status END,
            updated_at = ?
        WHERE id = ?
      `).run(now, paymentId);

      const controls = getSystemControls();
      if (controls.notifyNewProof) {
        createNotification({
          type: 'new_proof',
          title: 'Novo comprovante enviado',
          message: `${user.displayName} enviou o comprovante ${req.file.originalname} para análise.`,
          targetTab: 'proofs',
          recordId: proofId,
        });
      }

      const payRow = db.prepare('SELECT plan_key, external_reference FROM payments WHERE id = ?').get(paymentId) as any;
      dispatchUserCommunication(db, {
        userId: user.id,
        eventKey: 'payment_pending',
        vars: {
          plano: payRow?.plan_key || planKeyInput,
          referencia: payRow?.external_reference || paymentId,
        },
      });

      res.status(201).json({
        ok: true,
        proofId,
        paymentId,
        status: 'aguardando_analise',
        message: 'Comprovante enviado com segurança. Aguarde a validação do administrador.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro ao enviar comprovante.' });
    }
  });

  // Securely stream proof file only to owner or admin
  app.get('/api/proofs/:id/file', requireAuth, async (req: AuthedRequest, res: Response) => {
    const proof = db.prepare('SELECT * FROM payment_proofs WHERE id = ?').get(req.params.id) as any;
    if (!proof) {
      res.status(404).json({ error: 'Comprovante não encontrado.' });
      return;
    }
    if (proof.user_id !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Acesso negado a este comprovante.' });
      return;
    }

    if (SUPABASE_CONFIGURED && supabaseAdmin) {
      const { data, error } = await supabaseAdmin.storage
        .from('payment-proofs')
        .download(proof.storage_path);
      if (error || !data) {
        res.status(404).json({ error: 'Arquivo não encontrado no Storage.' });
        return;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      res.setHeader('Content-Type', proof.mime_type);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(proof.original_filename)}"`);
      res.send(buf);
      return;
    }

    const fullPath = path.join(PROOFS_DIR, proof.storage_path);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }
    res.setHeader('Content-Type', proof.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(proof.original_filename)}"`);
    fs.createReadStream(fullPath).pipe(res);
  });

  // -------------------------------------------------------------------------
  // Mercado Pago Official Webhook & Verification
  // -------------------------------------------------------------------------
  async function verifyAndApproveMercadoPagoPayment(mpPaymentId: string): Promise<{ ok: boolean; status: string; message: string }> {
    if (!MERCADOPAGO_ACCESS_TOKEN) {
      return { ok: false, status: 'unconfigured', message: 'MERCADOPAGO_ACCESS_TOKEN não configurado.' };
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`, {
      headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      return { ok: false, status: 'api_error', message: 'Não foi possível consultar o pagamento no Mercado Pago.' };
    }

    const mpPayment = (await mpRes.json()) as any;
    const extRef = String(mpPayment.external_reference || '');
    if (!extRef) {
      return { ok: false, status: 'missing_ref', message: 'Pagamento sem external_reference associada.' };
    }

    const localPayment = db
      .prepare('SELECT * FROM payments WHERE external_reference = ?')
      .get(extRef) as any;
    if (!localPayment) {
      return { ok: false, status: 'not_found', message: 'Referência não localizada no banco.' };
    }

    // Prevent duplicate provider_payment_id usage across different local orders
    const duplicate = db
      .prepare('SELECT id FROM payments WHERE provider_payment_id = ? AND id <> ?')
      .get(String(mpPayment.id), localPayment.id);
    if (duplicate) {
      return { ok: false, status: 'duplicate', message: 'ID de pagamento já utilizado em outra transação.' };
    }

    const paidCents = Math.round(Number(mpPayment.transaction_amount || 0) * 100);
    const now = new Date();
    const nowIso = now.toISOString();

    if (
      mpPayment.status === 'approved' &&
      mpPayment.currency_id === 'BRL' &&
      paidCents >= localPayment.amount_cents
    ) {
      if (localPayment.status !== 'aprovado') {
        const expiresAt = computeExpirationIso(localPayment.plan_key as PlanKey, now);
        db.prepare(`
          UPDATE payments
          SET status = 'aprovado',
              provider_payment_id = ?,
              activation_origin = 'webhook_mercadopago',
              approved_at = ?,
              expires_at = ?,
              updated_at = ?
          WHERE id = ?
        `).run(String(mpPayment.id), nowIso, expiresAt, nowIso, localPayment.id);

        createNotification({
          type: 'payment_approved',
          title: 'Pagamento confirmado (Mercado Pago)',
          message: `Pagamento ${localPayment.external_reference} aprovado automaticamente pelo webhook.`,
          targetTab: 'payments',
          recordId: localPayment.id,
        });

        dispatchUserCommunication(db, {
          userId: localPayment.user_id,
          eventKey: 'payment_approved',
          vars: { plano: localPayment.plan_key, referencia: localPayment.external_reference },
        });
        dispatchUserCommunication(db, {
          userId: localPayment.user_id,
          eventKey: 'vip_unlocked',
          vars: { plano: localPayment.plan_key },
        });
      }
      recordIntegrationEvent('mercadopago', 'ok', `Pagamento ${mpPayment.id} processado (${mpPayment.status}).`);
      return { ok: true, status: 'aprovado', message: 'Pagamento validado e assinatura liberada.' };
    }

    if (mpPayment.status === 'refunded' || mpPayment.status === 'charged_back') {
      db.prepare(`
        UPDATE payments
        SET status = 'reembolsado',
            provider_payment_id = ?,
            rejection_reason = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        String(mpPayment.id),
        `Mercado Pago: ${mpPayment.status_detail || mpPayment.status}`,
        nowIso,
        localPayment.id
      );
      recordIntegrationEvent('mercadopago', 'ok', `Pagamento ${mpPayment.id} reembolsado (${mpPayment.status}).`);
      return { ok: true, status: 'reembolsado', message: 'Pagamento reembolsado e acesso VIP encerrado.' };
    }

    if (mpPayment.status === 'cancelled') {
      db.prepare(`
        UPDATE payments
        SET status = 'cancelado',
            provider_payment_id = ?,
            rejection_reason = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        String(mpPayment.id),
        `Mercado Pago: ${mpPayment.status_detail || 'cancelado'}`,
        nowIso,
        localPayment.id
      );
      recordIntegrationEvent('mercadopago', 'ok', `Pagamento ${mpPayment.id} cancelado.`);
      return { ok: true, status: 'cancelado', message: 'Pagamento cancelado no Mercado Pago.' };
    }

    if (mpPayment.status === 'rejected') {
      db.prepare(`
        UPDATE payments
        SET status = 'recusado',
            provider_payment_id = ?,
            rejection_reason = ?,
            updated_at = ?
        WHERE id = ?
      `).run(String(mpPayment.id), `Mercado Pago: ${mpPayment.status_detail || mpPayment.status}`, nowIso, localPayment.id);
      recordIntegrationEvent('mercadopago', 'ok', `Pagamento ${mpPayment.id} recusado (${mpPayment.status}).`);
      return { ok: true, status: 'recusado', message: 'Pagamento recusado no Mercado Pago.' };
    }

    recordIntegrationEvent('mercadopago', 'ok', `Consulta MP: ${mpPayment.status}`);
    return { ok: true, status: mpPayment.status, message: `Status atual no Mercado Pago: ${mpPayment.status}` };
  }

  app.post('/api/webhooks/mercadopago', async (req: Request, res: Response) => {
    try {
      // Optional HMAC x-signature validation if MERCADOPAGO_WEBHOOK_SECRET is configured
      if (MERCADOPAGO_WEBHOOK_SECRET) {
        const xSig = String(req.headers['x-signature'] || '');
        const xReqId = String(req.headers['x-request-id'] || '');
        const dataId = String(req.query['data.id'] || req.body?.data?.id || '');
        const parts = Object.fromEntries(xSig.split(',').map((p) => p.trim().split('=')));
        if (!parts.ts || !parts.v1) {
          res.status(401).json({ error: 'Assinatura de webhook ausente.' });
          return;
        }
        const manifest = `id:${dataId};request-id:${xReqId};ts:${parts.ts};`;
        const hmac = crypto.createHmac('sha256', MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest('hex');
        if (hmac !== parts.v1) {
          res.status(401).json({ error: 'Assinatura de webhook inválida.' });
          return;
        }
      }

      const topic = req.body?.type || req.body?.topic || req.query?.topic;
      const paymentId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;

      if ((topic === 'payment' || !topic) && paymentId) {
        const result = await verifyAndApproveMercadoPagoPayment(String(paymentId));
        res.status(200).json(result);
        return;
      }

      res.status(200).json({ received: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erro ao processar webhook.' });
    }
  });

  app.post('/api/payments/:id/verify-mp', requireAuth, async (req: AuthedRequest, res: Response) => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as any;
    if (!pay) {
      res.status(404).json({ error: 'Pagamento não encontrado.' });
      return;
    }
    if (pay.user_id !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    if (!MERCADOPAGO_ACCESS_TOKEN) {
      res.status(400).json({
        error: 'MERCADOPAGO_ACCESS_TOKEN não configurado no backend. Envie o comprovante para análise manual.',
      });
      return;
    }

    const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(
      pay.external_reference
    )}`;
    const mpRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
    });
    if (!mpRes.ok) {
      res.status(502).json({ error: 'Erro ao consultar API oficial do Mercado Pago.' });
      return;
    }
    const data = (await mpRes.json()) as any;
    const match = (data.results || [])[0];
    if (!match) {
      res.json({
        verified: false,
        status: pay.status,
        message: 'Nenhum pagamento localizado no Mercado Pago para esta referência ainda.',
      });
      return;
    }
    const result = await verifyAndApproveMercadoPagoPayment(String(match.id));
    res.json({ verified: true, ...result });
  });

  // -------------------------------------------------------------------------
  // Admin Routes (Strict backend role === 'admin')
  // -------------------------------------------------------------------------
  registerAdminRoutes(app, {
    db,
    requireAdmin,
    getSiteSettings,
    getPublishedAppearance,
    getDraftAppearance,
    getSystemControls,
    getDefaultAppearance: () => DEFAULT_APPEARANCE,
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
    supabaseConfigured: SUPABASE_CONFIGURED,
    supabaseUrl: SUPABASE_URL,
    supabaseAdmin,
    mercadoPagoToken: MERCADOPAGO_ACCESS_TOKEN,
    webhookSecretConfigured: Boolean(MERCADOPAGO_WEBHOOK_SECRET),
    proofsDir: PROOFS_DIR,
    dbPath: DB_PATH,
  });

  app.get('/api/admin/customers', requireAdmin, (_req: AuthedRequest, res: Response) => {
    expireOverdueSubscriptions();
    const rows = db
      .prepare("SELECT * FROM profiles WHERE role = 'client' ORDER BY created_at DESC")
      .all() as any[];

    const customers = rows.map((row) => {
      const profile = mapProfile(row);
      const subscription = getUserSubscriptionSummary(row.id, Boolean(row.suspended));
      const userPayments = db
        .prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC')
        .all(row.id) as any[];
      const spent = userPayments
        .filter((p) => p.status === 'aprovado' || p.status === 'expirado')
        .reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);
      const hasPendingPayment = userPayments.some((p) =>
        ['aguardando_pagamento', 'aguardando_analise', 'em_analise'].includes(p.status)
      );
      const isExpiringSoon =
        subscription.hasVipAccess &&
        subscription.daysRemaining !== null &&
        subscription.daysRemaining <= 5;
      const isLifetime = subscription.hasVipAccess && subscription.planKey === 'vitalicio';
      return {
        ...profile,
        subscription,
        paymentCount: userPayments.length,
        totalSpentCents: spent,
        lastPaymentAt: userPayments[0]?.created_at || null,
        hasPendingPayment,
        isExpiringSoon,
        isLifetime,
      };
    });

    res.json({ customers });
  });

  app.get('/api/admin/customers/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    expireOverdueSubscriptions();
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    const payments = db
      .prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC')
      .all(row.id) as any[];
    const proofs = db
      .prepare('SELECT * FROM payment_proofs WHERE user_id = ? ORDER BY created_at DESC')
      .all(row.id) as any[];
    const userNotifications = db
      .prepare('SELECT * FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
      .all(row.id) as any[];
    const supportTickets = db
      .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20')
      .all(row.id) as any[];
    const auditHistory = db
      .prepare('SELECT a.*, adm.display_name AS admin_name FROM audit_logs a LEFT JOIN profiles adm ON adm.id = a.admin_id WHERE a.record_id = ? OR a.details LIKE ? ORDER BY a.created_at DESC LIMIT 20')
      .all(row.id, `%${row.id}%`) as any[];

    res.json({
      customer: {
        ...mapProfile(row),
        subscription: getUserSubscriptionSummary(row.id, Boolean(row.suspended)),
      },
      payments: payments.map((p) => ({
        ...p,
        userId: p.user_id,
        planKey: p.plan_key,
        amountCents: p.amount_cents,
        originalAmountCents: p.original_amount_cents ?? p.amount_cents,
        discountCents: p.discount_cents || 0,
        couponCode: p.coupon_code || null,
        activationOrigin: p.activation_origin || null,
        providerPaymentId: p.provider_payment_id,
        externalReference: p.external_reference,
        checkoutUrl: p.checkout_url,
        rejectionReason: p.rejection_reason,
        approvedAt: p.approved_at,
        expiresAt: p.expires_at,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        proofs: proofs.filter((pr) => pr.payment_id === p.id),
      })),
      userNotifications: userNotifications.map((n) => ({
        id: n.id,
        userId: n.user_id,
        eventKey: n.event_key,
        title: n.title,
        message: n.message,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
      supportTickets: supportTickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        category: t.category,
        status: t.status,
        priority: t.priority,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
      auditHistory: auditHistory.map((a) => ({
        id: a.id,
        adminName: a.admin_name || 'Sistema',
        action: a.action,
        result: a.result || 'sucesso',
        createdAt: a.created_at,
      })),
    });
  });

  app.patch('/api/admin/customers/:id/suspend', requireAdmin, (req: AuthedRequest, res: Response) => {
    const target = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.params.id) as any;
    if (!target || target.role === 'admin') {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    const suspended = Boolean(req.body?.suspended);
    const now = new Date().toISOString();
    db.prepare('UPDATE profiles SET suspended = ?, updated_at = ? WHERE id = ?').run(
      suspended ? 1 : 0,
      now,
      target.id
    );
    if (suspended) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    }
    logAudit(req.user!.id, suspended ? 'suspender_cliente' : 'reativar_cliente', target.id, {
      email: target.email,
    });
    res.json({ ok: true, suspended });
  });

  app.get('/api/admin/payments', requireAdmin, (_req: AuthedRequest, res: Response) => {
    expireOverdueSubscriptions();
    const payments = db
      .prepare(`
        SELECT p.*, prof.display_name AS customer_name, prof.email AS customer_email, prof.phone AS customer_phone
        FROM payments p
        JOIN profiles prof ON prof.id = p.user_id
        ORDER BY p.created_at DESC
      `)
      .all() as any[];

    const proofs = db.prepare('SELECT * FROM payment_proofs ORDER BY created_at DESC').all() as any[];

    const mapped = payments.map((p) => ({
      id: p.id,
      userId: p.user_id,
      customerName: p.customer_name,
      customerEmail: p.customer_email,
      customerPhone: p.customer_phone,
      planKey: p.plan_key,
      amountCents: p.amount_cents,
      originalAmountCents: p.original_amount_cents ?? p.amount_cents,
      discountCents: p.discount_cents || 0,
      couponCode: p.coupon_code || null,
      activationOrigin: p.activation_origin || null,
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      providerPaymentId: p.provider_payment_id,
      externalReference: p.external_reference,
      checkoutUrl: p.checkout_url,
      rejectionReason: p.rejection_reason,
      approvedAt: p.approved_at,
      expiresAt: p.expires_at,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      proofs: proofs
        .filter((pr) => pr.payment_id === p.id)
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
        })),
    }));

    res.json({ payments: mapped });
  });

  app.patch('/api/admin/payments/:id/review', requireAdmin, (req: AuthedRequest, res: Response) => {
    const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as any;
    if (!pay) {
      res.status(404).json({ error: 'Pagamento não encontrado.' });
      return;
    }

    const decision = String(req.body?.decision || '') as
      | 'em_analise'
      | 'aprovado'
      | 'recusado'
      | 'cancelado'
      | 'reembolsado';
    const notes = String(req.body?.notes || '').trim() || null;

    if (!['em_analise', 'aprovado', 'recusado', 'cancelado', 'reembolsado'].includes(decision)) {
      res.status(400).json({ error: 'Decisão administrativa inválida.' });
      return;
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (decision === 'aprovado') {
      const expiresAt = computeExpirationIso(pay.plan_key as PlanKey, now);
      const hasProof = db.prepare('SELECT id FROM payment_proofs WHERE payment_id = ? LIMIT 1').get(pay.id);
      const origin = hasProof ? 'comprovante_aprovado' : 'aprovacao_admin';
      db.prepare(`
        UPDATE payments
        SET status = 'aprovado',
            activation_origin = ?,
            approved_at = ?,
            expires_at = ?,
            rejection_reason = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(origin, nowIso, expiresAt, nowIso, pay.id);

      db.prepare(`
        UPDATE payment_proofs
        SET status = 'aprovado', review_notes = ?, reviewed_by = ?, reviewed_at = ?
        WHERE payment_id = ?
      `).run(notes, req.user!.id, nowIso, pay.id);

      dispatchUserCommunication(db, {
        userId: pay.user_id,
        eventKey: 'payment_approved',
        vars: { plano: pay.plan_key, referencia: pay.external_reference },
      });
      dispatchUserCommunication(db, {
        userId: pay.user_id,
        eventKey: 'vip_unlocked',
        vars: { plano: pay.plan_key },
      });

      logAudit(req.user!.id, 'aprovar_pagamento', pay.id, {
        planKey: pay.plan_key,
        amountCents: pay.amount_cents,
        expiresAt,
        origin,
      });
    } else if (decision === 'recusado' || decision === 'cancelado' || decision === 'reembolsado') {
      const defaultMsg =
        decision === 'cancelado'
          ? 'Pagamento cancelado pela administração.'
          : decision === 'reembolsado'
          ? 'Pagamento reembolsado e acesso VIP encerrado.'
          : 'Comprovante recusado na conferência administrativa.';
      db.prepare(`
        UPDATE payments
        SET status = ?,
            rejection_reason = ?,
            updated_at = ?
        WHERE id = ?
      `).run(decision, notes || defaultMsg, nowIso, pay.id);

      db.prepare(`
        UPDATE payment_proofs
        SET status = 'recusado', review_notes = ?, reviewed_by = ?, reviewed_at = ?
        WHERE payment_id = ? AND status IN ('aguardando_analise', 'em_analise')
      `).run(notes || defaultMsg, req.user!.id, nowIso, pay.id);

      logAudit(req.user!.id, `marcar_pagamento_${decision}`, pay.id, { notes });
    } else {
      db.prepare(`UPDATE payments SET status = 'em_analise', updated_at = ? WHERE id = ?`).run(nowIso, pay.id);
      db.prepare(`
        UPDATE payment_proofs
        SET status = 'em_analise', review_notes = ?, reviewed_by = ?, reviewed_at = ?
        WHERE payment_id = ?
      `).run(notes, req.user!.id, nowIso, pay.id);

      logAudit(req.user!.id, 'marcar_em_analise', pay.id, { notes });
    }

    res.json({ ok: true, status: decision });
  });

  app.post('/api/admin/payments/manual', requireAdmin, (req: AuthedRequest, res: Response) => {
    const userId = String(req.body?.userId || '').trim();
    const planKey = String(req.body?.planKey || '') as PlanKey;
    const status = String(req.body?.status || 'aprovado') as PaymentStatus;
    const notes = String(req.body?.notes || '').trim() || null;

    if (!userId || !['semanal', 'mensal', 'vitalicio'].includes(planKey)) {
      res.status(400).json({ error: 'Selecione um cliente e um plano válido.' });
      return;
    }
    if (
      ![
        'aguardando_pagamento',
        'aguardando_analise',
        'em_analise',
        'aprovado',
        'recusado',
        'cancelado',
        'reembolsado',
      ].includes(status)
    ) {
      res.status(400).json({ error: 'Status inicial inválido.' });
      return;
    }

    const client = db.prepare("SELECT id, display_name FROM profiles WHERE id = ? AND role = 'client'").get(userId) as any;
    if (!client) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }

    const settings = getSiteSettings();
    const plan = settings.plans[planKey];
    const amountCents = plan.amountCents || parseBrlToCents(plan.preco);
    const now = new Date();
    const nowIso = now.toISOString();
    const paymentId = crypto.randomUUID();
    const externalRef = `VIP-ADM-${userId.slice(0, 8)}-${planKey}-${Date.now()}`;
    const approvedAt = status === 'aprovado' ? nowIso : null;
    const expiresAt = status === 'aprovado' ? computeExpirationIso(planKey, now) : null;
    const activationOrigin = status === 'aprovado' ? 'manual_admin' : null;

    db.prepare(`
      INSERT INTO payments (
        id, user_id, plan_key, amount_cents, original_amount_cents, discount_cents,
        activation_origin, currency, status, provider,
        external_reference, checkout_url, rejection_reason, approved_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, 'BRL', ?, 'manual_admin', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      userId,
      planKey,
      amountCents,
      amountCents,
      activationOrigin,
      status,
      externalRef,
      plan.link,
      status === 'recusado' ? notes : null,
      approvedAt,
      expiresAt,
      nowIso,
      nowIso
    );

    if (status === 'aprovado') {
      dispatchUserCommunication(db, {
        userId,
        eventKey: 'payment_approved',
        vars: { plano: planKey, referencia: externalRef },
      });
    }

    logAudit(req.user!.id, 'registrar_pagamento_manual', paymentId, {
      clientName: client.display_name,
      planKey,
      status,
      amountCents,
      notes,
    });

    res.status(201).json({ ok: true, id: paymentId });
  });

  app.get('/api/admin/settings', requireAdmin, (_req: AuthedRequest, res: Response) => {
    res.json({ settings: getSiteSettings() });
  });

  app.put('/api/admin/settings', requireAdmin, (req: AuthedRequest, res: Response) => {
    const body = req.body || {};
    const current = getSiteSettings();
    const now = new Date().toISOString();

    const hero = typeof body.hero === 'string' && body.hero.trim() ? body.hero.trim() : current.hero;
    const whatsapp = typeof body.whatsapp === 'string' ? body.whatsapp.replace(/\D/g, '') : current.whatsapp;
    const whatsappLabel =
      typeof body.whatsappLabel === 'string' ? body.whatsappLabel.trim() : current.whatsappLabel;
    const mensagem = typeof body.mensagem === 'string' ? body.mensagem.trim() : current.mensagem;
    const vipGroupInvite =
      typeof body.vipGroupInvite === 'string' ? body.vipGroupInvite.trim() : current.vipGroupInvite || '';

    if (vipGroupInvite && !/^https:\/\//.test(vipGroupInvite)) {
      res.status(400).json({ error: 'O link do grupo VIP deve começar com https://' });
      return;
    }

    const updatedPlans = { ...current.plans };
    if (body.plans && typeof body.plans === 'object') {
      for (const k of ['semanal', 'mensal', 'vitalicio'] as PlanKey[]) {
        const incoming = body.plans[k];
        if (!incoming) continue;
        const link = String(incoming.link || updatedPlans[k].link).trim();
        if (!/^https:\/\//.test(link)) {
          res.status(400).json({ error: `O link do plano ${k} deve começar com https://` });
          return;
        }
        const preco = String(incoming.preco || updatedPlans[k].preco).trim();
        const amountCents = parseBrlToCents(preco) || updatedPlans[k].amountCents;
        updatedPlans[k] = {
          ...updatedPlans[k],
          preco,
          amountCents,
          link,
        };
      }
    }

    const upsert = db.prepare(`
      INSERT INTO site_settings (key, value, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `);
    upsert.run('hero', JSON.stringify(hero), now, req.user!.id);
    upsert.run('whatsapp', JSON.stringify(whatsapp), now, req.user!.id);
    upsert.run('whatsapp_label', JSON.stringify(whatsappLabel), now, req.user!.id);
    upsert.run('support_message', JSON.stringify(mensagem), now, req.user!.id);
    upsert.run('vip_group_invite', JSON.stringify(vipGroupInvite), now, req.user!.id);
    upsert.run('plans', JSON.stringify(updatedPlans), now, req.user!.id);

    logAudit(req.user!.id, 'atualizar_configuracoes', 'site_settings', {
      vipGroupConfigured: Boolean(vipGroupInvite),
    });

    res.json({ ok: true, settings: getSiteSettings() });
  });

  app.get('/api/admin/audit-logs', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare(`
        SELECT a.*, p.display_name AS admin_name
        FROM audit_logs a
        LEFT JOIN profiles p ON p.id = a.admin_id
        ORDER BY a.created_at DESC
        LIMIT 100
      `)
      .all() as any[];

    res.json({
      logs: rows.map((r) => ({
        id: r.id,
        adminId: r.admin_id,
        adminName: r.admin_name || 'Sistema',
        action: r.action,
        recordId: r.record_id,
        result: r.result || 'sucesso',
        details: (() => {
          try {
            return JSON.parse(r.details || '{}');
          } catch {
            return {};
          }
        })(),
        createdAt: r.created_at,
      })),
    });
  });

  app.get('/api/admin/admins', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare("SELECT * FROM profiles WHERE role = 'admin' ORDER BY created_at ASC")
      .all() as any[];
    res.json({ admins: rows.map(mapProfile) });
  });

  app.post('/api/admin/admins', requireAdmin, (req: AuthedRequest, res: Response) => {
    const displayName = String(req.body?.displayName || '').trim();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const email = String(req.body?.email || `${username}@vipdanicolly.admin`).trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (displayName.length < 2 || username.length < 3) {
      res.status(400).json({ error: 'Informe nome e usuário válidos.' });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: 'A senha deve possuir no mínimo 4 caracteres.' });
      return;
    }

    const exists = db
      .prepare('SELECT id FROM profiles WHERE lower(username) = ? OR lower(email) = ?')
      .get(username, email);
    if (exists) {
      res.status(409).json({ error: 'Usuário ou e-mail já cadastrado.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO profiles (
        id, display_name, username, email, phone, birth_date, password_hash,
        role, suspended, terms_accepted_at, privacy_accepted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '(41) 9238-7993', '1995-01-01', ?, 'admin', 0, ?, ?, ?, ?)
    `).run(id, displayName, username, email, hashPassword(password), now, now, now, now);

    logAudit(req.user!.id, 'criar_administrador', id, { username, displayName });
    res.status(201).json({ ok: true, id });
  });

  app.delete('/api/admin/admins/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: 'Você não pode remover sua própria conta na sessão atual.' });
      return;
    }
    const adminCount = (
      db.prepare("SELECT COUNT(*) AS cnt FROM profiles WHERE role = 'admin'").get() as { cnt: number }
    ).cnt;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'É necessário manter ao menos um administrador ativo.' });
      return;
    }
    const target = db.prepare("SELECT id, username FROM profiles WHERE id = ? AND role = 'admin'").get(req.params.id) as any;
    if (!target) {
      res.status(404).json({ error: 'Administrador não encontrado.' });
      return;
    }
    db.prepare('DELETE FROM profiles WHERE id = ?').run(target.id);
    logAudit(req.user!.id, 'remover_administrador', target.id, { username: target.username });
    res.json({ ok: true });
  });

  app.post('/api/admin/change-password', requireAdmin, (req: AuthedRequest, res: Response) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
      return;
    }
    const row = db.prepare('SELECT password_hash FROM profiles WHERE id = ?').get(req.user!.id) as any;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      res.status(401).json({ error: 'Senha atual incorreta.' });
      return;
    }
    db.prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      new Date().toISOString(),
      req.user!.id
    );
    logAudit(req.user!.id, 'alterar_propria_senha', req.user!.id, {});
    res.json({ ok: true });
  });

  registerExtraModulesRoutes(app, {
    db,
    requireAuth,
    requireAdmin,
    getSiteSettings,
    getPublishedAppearance,
    getDraftAppearance,
    logAudit,
    createNotification,
    mediaDir: MEDIA_DIR,
    supabaseConfigured: SUPABASE_CONFIGURED,
    supabaseAdmin,
  });

  // Periodic background expiration sweep every 15 minutes
  setInterval(() => {
    try {
      expireOverdueSubscriptions();
    } catch {
      // keep background timer safe
    }
  }, 15 * 60 * 1000).unref();

  // Multer & API error handler
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError || err?.message) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  });

  // -------------------------------------------------------------------------
  // Vite Middleware (Dev) or Static Dist Serving (Prod)
  // -------------------------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production';

  // Serve root favicon.svg and robots.txt explicitly
  app.get('/favicon.svg', (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'favicon.svg'));
  });
  app.get('/robots.txt', (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, 'robots.txt'));
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VIP da Nicolly server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});

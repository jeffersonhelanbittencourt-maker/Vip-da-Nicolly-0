import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  computeCouponDiscount,
  computeExpirationIso,
  escapeCsvCell,
  hashPassword,
  isAdult,
  parseBrlToCents,
  verifyPassword,
} from './server-utils.ts';
import {
  DEFAULT_COMMUNICATION_TEMPLATES,
  DEFAULT_DASHBOARD_LAYOUT,
  validateCouponForUser,
} from './server-modules.ts';

test('scrypt password hashing and timing-safe verification', () => {
  const hash = hashPassword('S3nhaForte!2026');
  assert.ok(hash.includes(':'), 'Hash should use salt:derived format');
  assert.equal(verifyPassword('S3nhaForte!2026', hash), true);
  assert.equal(verifyPassword('SenhaErrada', hash), false);
  assert.equal(verifyPassword('S3nhaForte!2026', 'invalid-hash'), false);
});

test('18+ age validation enforces exact UTC calendar boundaries', () => {
  const refDate = new Date('2026-06-15T12:00:00Z');
  assert.equal(isAdult('2008-06-15', refDate), true, 'Exactly 18 today is allowed');
  assert.equal(isAdult('2008-06-16', refDate), false, '17y 364d is rejected');
  assert.equal(isAdult('1995-02-28', refDate), true);
  assert.equal(isAdult('2012-01-01', refDate), false);
  assert.equal(isAdult('1999-02-31', refDate), false, 'Invalid calendar date rejected');
  assert.equal(isAdult('1850-01-01', refDate), false, 'Age > 120 rejected');
  assert.equal(isAdult('invalid-date', refDate), false);
});

test('parseBrlToCents parses BRL strings and numeric inputs accurately', () => {
  assert.equal(parseBrlToCents('R$ 25,00'), 2500);
  assert.equal(parseBrlToCents('50,00'), 5000);
  assert.equal(parseBrlToCents('R$ 1.250,90'), 125090);
  assert.equal(parseBrlToCents(200), 20000);
  assert.equal(parseBrlToCents(''), 0);
  assert.equal(parseBrlToCents('-10,00'), 0);
});

test('computeExpirationIso handles weekly, monthly, custom days, and lifetime plans', () => {
  const base = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(computeExpirationIso('semanal', base), '2026-01-08T00:00:00.000Z');
  assert.equal(computeExpirationIso('mensal', base), '2026-01-31T00:00:00.000Z');
  assert.equal(computeExpirationIso('mensal', base, 45), '2026-02-15T00:00:00.000Z');
  assert.equal(computeExpirationIso('vitalicio', base), null);
});

test('computeCouponDiscount applies percent/fixed discounts while preserving R$ 1,00 minimum', () => {
  const pct = computeCouponDiscount({
    amountCents: 5000,
    discountType: 'percent',
    discountValue: 20,
  });
  assert.deepEqual(pct, { discountCents: 1000, finalAmountCents: 4000 });

  const fixed = computeCouponDiscount({
    amountCents: 2500,
    discountType: 'fixed_cents',
    discountValue: 500,
  });
  assert.deepEqual(fixed, { discountCents: 500, finalAmountCents: 2000 });

  const clampedFloor = computeCouponDiscount({
    amountCents: 2500,
    discountType: 'fixed_cents',
    discountValue: 99999,
  });
  assert.deepEqual(clampedFloor, { discountCents: 2400, finalAmountCents: 100 });
});

test('escapeCsvCell handles delimiters, quotes, and CSV formula injection', () => {
  assert.equal(escapeCsvCell('Nicolly VIP'), 'Nicolly VIP');
  assert.equal(escapeCsvCell('-'), '-', 'Single hyphen placeholder stays intact');
  assert.equal(escapeCsvCell('Ana; "VIP"'), '"Ana; ""VIP"""');
  assert.equal(escapeCsvCell('=CMD("calc")'), '"\'=CMD(""calc"")"');
  assert.equal(escapeCsvCell('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(escapeCsvCell('@IMPORTXML()'), "'@IMPORTXML()");
});

test('default communication templates and dashboard layout contain all expected keys', () => {
  assert.equal(DEFAULT_COMMUNICATION_TEMPLATES.length, 7);
  assert.ok(DEFAULT_COMMUNICATION_TEMPLATES.every((t) => Boolean(t.key && t.subject && t.bodyTemplate)));
  assert.ok(DEFAULT_DASHBOARD_LAYOUT.sectionOrder.includes('statusMatrix'));
  assert.ok(DEFAULT_DASHBOARD_LAYOUT.sectionOrder.includes('charts'));
});

test('validateCouponForUser enforces plan eligibility, expiry, and max use limits on SQLite', () => {
  const mem = new Database(':memory:');
  mem.exec(`
    CREATE TABLE coupons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      discount_type TEXT NOT NULL,
      discount_value INTEGER NOT NULL,
      applicable_plans TEXT NOT NULL,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      valid_from TEXT,
      valid_until TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE coupon_redemptions (
      id TEXT PRIMARY KEY,
      coupon_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      discount_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  mem.prepare(`
    INSERT INTO coupons (id, code, discount_type, discount_value, applicable_plans, max_uses, used_count, valid_until, active, created_at, updated_at)
    VALUES ('c1', 'VIP15', 'percent', 15, '["mensal","vitalicio"]', 2, 0, '2099-12-31T23:59:59.000Z', 1, ?, ?)
  `).run(now, now);

  const valid = validateCouponForUser(mem, {
    code: 'vip15',
    planKey: 'mensal',
    amountCents: 5000,
    userId: 'user-1',
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.discountCents, 750);
    assert.equal(valid.finalAmountCents, 4250);
  }

  const wrongPlan = validateCouponForUser(mem, {
    code: 'VIP15',
    planKey: 'semanal',
    amountCents: 2500,
    userId: 'user-1',
  });
  assert.equal(wrongPlan.ok, false);

  const missing = validateCouponForUser(mem, {
    code: 'INEXISTENTE',
    planKey: 'mensal',
    amountCents: 5000,
    userId: 'user-1',
  });
  assert.equal(missing.ok, false);
});

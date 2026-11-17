import crypto from 'crypto';
import type { PlanKey } from './types.ts';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function isAdult(birthDateStr: string, referenceDate: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDateStr || '').trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dob = new Date(Date.UTC(year, month - 1, day));
  if (
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month - 1 ||
    dob.getUTCDate() !== day
  ) {
    return false;
  }

  let age = referenceDate.getUTCFullYear() - year;
  const monthDiff = referenceDate.getUTCMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getUTCDate() < day)) {
    age -= 1;
  }
  return age >= 18 && age <= 120;
}

export function parseBrlToCents(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
  if (!value) return 0;
  const raw = String(value).trim();
  if (raw.startsWith('-')) return 0;
  const hasComma = raw.includes(',');
  const normalized = hasComma
    ? raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
    : raw.replace(/[^\d.]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

export function computeExpirationIso(
  planKey: PlanKey,
  approvedDate: Date = new Date(),
  customDurationDays?: number
): string | null {
  if (planKey === 'vitalicio') return null;
  const days =
    typeof customDurationDays === 'number' && customDurationDays > 0
      ? customDurationDays
      : planKey === 'semanal'
      ? 7
      : 30;
  return new Date(approvedDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function computeCouponDiscount(opts: {
  amountCents: number;
  discountType: 'percent' | 'fixed_cents';
  discountValue: number;
}): { discountCents: number; finalAmountCents: number } {
  const base = Math.max(0, Math.round(opts.amountCents));
  if (base <= 0 || opts.discountValue <= 0) {
    return { discountCents: 0, finalAmountCents: base };
  }
  let rawDiscount = 0;
  if (opts.discountType === 'percent') {
    const pct = Math.min(95, Math.max(1, opts.discountValue));
    rawDiscount = Math.round((base * pct) / 100);
  } else {
    rawDiscount = Math.round(opts.discountValue);
  }
  // Keep at least R$ 1,00 (100 cents) minimum payable order value to avoid zero-amount Mercado Pago failures
  const maxAllowedDiscount = Math.max(0, base - 100);
  const discountCents = Math.min(rawDiscount, maxAllowedDiscount);
  return {
    discountCents,
    finalAmountCents: base - discountCents,
  };
}

export function escapeCsvCell(val: unknown): string {
  let s = String(val ?? '');
  if (s.length > 1 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

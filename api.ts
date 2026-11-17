import type { PaymentStatus, ProofStatus, SupportTicketStatus } from './types.ts';

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erro na requisição (${res.status}).`);
  }

  return data as T;
}

export function formatBrl(cents: number): string {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PAYMENT_STATUS_META: Record<
  PaymentStatus | ProofStatus,
  { label: string; toneClass: string }
> = {
  aguardando_pagamento: {
    label: 'Aguardando pagamento',
    toneClass: 'text-amber-300',
  },
  aguardando_analise: {
    label: 'Aguardando análise',
    toneClass: 'text-rose-300',
  },
  em_analise: {
    label: 'Em análise',
    toneClass: 'text-sky-300',
  },
  aprovado: {
    label: 'Aprovado',
    toneClass: 'text-emerald-400',
  },
  recusado: {
    label: 'Recusado',
    toneClass: 'text-red-400',
  },
  cancelado: {
    label: 'Cancelado',
    toneClass: 'text-orange-300',
  },
  reembolsado: {
    label: 'Reembolsado',
    toneClass: 'text-purple-300',
  },
  expirado: {
    label: 'Expirado',
    toneClass: 'text-neutral-400',
  },
};

export const SUPPORT_STATUS_META: Record<
  SupportTicketStatus,
  { label: string; toneClass: string }
> = {
  aberto: {
    label: 'Aberto',
    toneClass: 'text-amber-300',
  },
  em_atendimento: {
    label: 'Em atendimento',
    toneClass: 'text-sky-300',
  },
  aguardando_cliente: {
    label: 'Aguardando cliente',
    toneClass: 'text-rose-300',
  },
  resolvido: {
    label: 'Resolvido',
    toneClass: 'text-emerald-400',
  },
  encerrado: {
    label: 'Encerrado',
    toneClass: 'text-neutral-400',
  },
};

export function maskPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function getSavedTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem('vip_theme');
    return saved === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyDocumentTheme(theme: 'dark' | 'light'): void {
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.remove('dark');
    root.classList.add('vip-light');
  } else {
    root.classList.remove('vip-light');
    root.classList.add('dark');
  }
  try {
    localStorage.setItem('vip_theme', theme);
  } catch {
    // Ignore storage quota / private mode issues
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'light' ? '#fff8fb' : '#0e0711');
  }
}

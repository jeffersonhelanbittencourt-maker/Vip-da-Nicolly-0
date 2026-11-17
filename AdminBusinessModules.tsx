import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Check,
  CreditCard,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  UserCheck,
  UserPlus,
  UserX,
  ZoomIn,
  X,
} from 'lucide-react';
import {
  apiRequest,
  formatBrl,
  formatDate,
  formatDateTime,
  formatFileSize,
  maskPhoneInput,
  PAYMENT_STATUS_META,
  SUPPORT_STATUS_META,
} from './api.ts';
import type {
  AdminCustomerRow,
  AdminOverviewData,
  AuditLogEntry,
  DashboardLayoutConfig,
  PaymentProof,
  PaymentRecord,
  PaymentStatus,
  PlanConfig,
  PlanKey,
  SiteConfig,
  SupportTicket,
  UserNotificationRecord,
  VipGroupRequest,
} from './types.ts';
import { AdminModuleKey, ConfirmDialog, KpiCard, MiniMetric, ProofZoomLightbox } from './AdminShared.tsx';

export interface AdminBusinessProps {
  tab: AdminModuleKey;
  setTab: (t: AdminModuleKey) => void;
  setBanner: (b: { type: 'ok' | 'err'; text: string } | null) => void;
  reloadAll: () => Promise<void>;
  overview: AdminOverviewData | null;
  overviewPeriod: string;
  setOverviewPeriod: (p: string) => void;
  customers: AdminCustomerRow[];
  payments: PaymentRecord[];
  proofs: PaymentProof[];
  subscriptionsList: Array<{
    id: string;
    userId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerSuspended: boolean;
    planKey: PlanKey;
    amountCents: number;
    activationOrigin?: string | null;
    status: PaymentStatus;
    approvedAt: string | null;
    expiresAt: string | null;
    daysRemaining: number | null;
    rejectionReason: string | null;
  }>;
  groupRequests: VipGroupRequest[];
  settings: SiteConfig | null;
  planHistory: Array<{ id: string; adminName: string; changes: any[]; createdAt: string }>;
  financeData: {
    filterStatus?: string;
    summary: {
      totalConfirmedCents: number;
      todayConfirmedCents?: number;
      currentYearCents?: number;
      confirmedCount: number;
      pendingPotentialCents: number;
      pendingCount: number;
      rejectedCount: number;
      canceledCount?: number;
      canceledCents?: number;
      refundedCount?: number;
      refundedCents?: number;
      averageTicketCents: number;
      currentMonthCents: number;
      previousMonthCents: number;
    };
    byPlan: Array<{ planKey: PlanKey; count: number; revenueCents: number }>;
    transactions: Array<any>;
  } | null;
  financeRange: { from: string; to: string; status: string };
  setFinanceRange: (r: { from: string; to: string; status: string }) => void;
  onRefreshFinance: (from: string, to: string, status?: string) => Promise<void>;
}

export const AdminBusinessModules: React.FC<AdminBusinessProps> = ({
  tab,
  setTab,
  setBanner,
  reloadAll,
  overview,
  overviewPeriod,
  setOverviewPeriod,
  customers,
  payments,
  proofs,
  subscriptionsList,
  groupRequests,
  settings,
  planHistory,
  financeData,
  financeRange,
  setFinanceRange,
  onRefreshFinance,
}) => {
  // Lightbox for zoomed proof inspection
  const [zoomProof, setZoomProof] = useState<{
    id: string;
    originalFilename: string;
    mimeType: string;
  } | null>(null);

  // Confirm Dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Dashboard customization layout state
  const [dashLayout, setDashLayout] = useState<DashboardLayoutConfig>({
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
  });
  const [customizingDash, setCustomizingDash] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    if (tab === 'overview') {
      apiRequest<{ layout: DashboardLayoutConfig }>('/api/admin/dashboard-layout')
        .then((r) => r.layout && setDashLayout(r.layout))
        .catch(() => {});
    }
  }, [tab]);

  // Customers state (10-segment CRM + Tabbed Detail Drawer)
  const [custQuery, setCustQuery] = useState('');
  const [custFilter, setCustFilter] = useState<
    | 'all'
    | 'new'
    | 'active_accounts'
    | 'vip'
    | 'inactive'
    | 'pending_payment'
    | 'expiring'
    | 'expired'
    | 'lifetime'
    | 'suspended'
  >('all');
  const [custSortKey, setCustSortKey] = useState<'createdAt' | 'displayName' | 'totalSpentCents'>('createdAt');
  const [custSortDir, setCustSortDir] = useState<1 | -1>(-1);
  const [custPage, setCustPage] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<{
    customer: AdminCustomerRow;
    payments: PaymentRecord[];
    userNotifications?: UserNotificationRecord[];
    supportTickets?: SupportTicket[];
    auditHistory?: AuditLogEntry[];
  } | null>(null);
  const [custDrawerTab, setCustDrawerTab] = useState<
    'resumo' | 'pagamentos' | 'notificacoes' | 'chamados' | 'auditoria'
  >('resumo');
  const [custNotesDraft, setCustNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [newCustModal, setNewCustModal] = useState(false);
  const [newCust, setNewCust] = useState({
    displayName: '',
    email: '',
    phone: '',
    birthDate: '1995-01-01',
    password: '',
    adminNotes: '',
  });
  const [creatingCust, setCreatingCust] = useState(false);

  // Payments state
  const [payQuery, setPayQuery] = useState('');
  const [payStatusFilter, setPayStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [reviewPayment, setReviewPayment] = useState<PaymentRecord | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const [manualPlanKey, setManualPlanKey] = useState<PlanKey>('mensal');
  const [manualStatus, setManualStatus] = useState<PaymentStatus>('aprovado');
  const [manualNotes, setManualNotes] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  // Proofs Queue filter & quick note
  const [proofFilter, setProofFilter] = useState<'all' | 'aguardando_analise' | 'em_analise' | 'aprovado' | 'recusado'>('all');
  const [proofNotesMap, setProofNotesMap] = useState<Record<string, string>>({});
  const [proofBusyId, setProofBusyId] = useState<string | null>(null);

  // Subscriptions filter & extend modal
  const [subFilter, setSubFilter] = useState<
    'all' | 'active' | 'expiring' | 'expired' | 'suspended' | 'canceled' | 'lifetime'
  >('all');
  const [extendTarget, setExtendTarget] = useState<{ id: string; customerName: string } | null>(null);
  const [extendDays, setExtendDays] = useState('30');

  // VIP Group filter & note
  const [groupFilter, setGroupFilter] = useState<'all' | 'pendente_whatsapp' | 'aceito_no_grupo' | 'recusado_no_grupo'>('all');
  const [groupNotesMap, setGroupNotesMap] = useState<Record<string, string>>({});

  // Plans draft
  const [plansDraft, setPlansDraft] = useState<Record<PlanKey, PlanConfig> | null>(
    settings?.plans ? JSON.parse(JSON.stringify(settings.plans)) : null
  );
  const [savingPlans, setSavingPlans] = useState(false);

  React.useEffect(() => {
    if (settings?.plans && !plansDraft) {
      setPlansDraft(JSON.parse(JSON.stringify(settings.plans)));
    }
  }, [settings?.plans, plansDraft]);

  const filteredCustomers = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const filtered = customers.filter((c) => {
      if (custFilter === 'new' && new Date(c.createdAt).getTime() < sevenDaysAgo) return false;
      if (custFilter === 'active_accounts' && c.suspended) return false;
      if (custFilter === 'vip' && !c.subscription.hasVipAccess) return false;
      if (custFilter === 'inactive' && (c.subscription.hasVipAccess || c.suspended)) return false;
      if (custFilter === 'pending_payment' && !c.hasPendingPayment) return false;
      if (custFilter === 'expiring' && !c.isExpiringSoon) return false;
      if (custFilter === 'expired' && !c.subscription.isExpired) return false;
      if (custFilter === 'lifetime' && !c.isLifetime) return false;
      if (custFilter === 'suspended' && !c.suspended) return false;
      if (!q) return true;
      return `${c.displayName} ${c.email} ${c.phone}`.toLowerCase().includes(q);
    });
    return [...filtered].sort((a, b) => {
      if (custSortKey === 'totalSpentCents') return (a.totalSpentCents - b.totalSpentCents) * custSortDir;
      return String(a[custSortKey] || '').localeCompare(String(b[custSortKey] || '')) * custSortDir;
    });
  }, [customers, custFilter, custQuery, custSortDir, custSortKey]);

  const pagedCustomers = useMemo(() => {
    const start = custPage * 12;
    return filteredCustomers.slice(start, start + 12);
  }, [filteredCustomers, custPage]);

  const filteredPayments = useMemo(() => {
    const q = payQuery.trim().toLowerCase();
    return payments.filter((p) => {
      if (payStatusFilter !== 'all' && p.status !== payStatusFilter) return false;
      if (!q) return true;
      return `${p.customerName || ''} ${p.customerEmail || ''} ${p.externalReference} ${p.planKey}`
        .toLowerCase()
        .includes(q);
    });
  }, [payments, payQuery, payStatusFilter]);

  const filteredProofs = useMemo(
    () => proofs.filter((pr) => proofFilter === 'all' || pr.status === proofFilter),
    [proofs, proofFilter]
  );

  const filteredSubscriptions = useMemo(() => {
    return subscriptionsList.filter((s) => {
      if (subFilter === 'active') return s.status === 'aprovado' && !s.customerSuspended;
      if (subFilter === 'expired') return s.status === 'expirado';
      if (subFilter === 'expiring') {
        return s.status === 'aprovado' && !s.customerSuspended && s.daysRemaining !== null && s.daysRemaining <= 5;
      }
      if (subFilter === 'suspended') return s.customerSuspended;
      if (subFilter === 'canceled') return s.status === 'cancelado' || s.status === 'reembolsado';
      if (subFilter === 'lifetime') return s.planKey === 'vitalicio' && s.status === 'aprovado' && !s.customerSuspended;
      return true;
    });
  }, [subscriptionsList, subFilter]);

  const filteredGroupRequests = useMemo(
    () => groupRequests.filter((r) => groupFilter === 'all' || r.status === groupFilter),
    [groupRequests, groupFilter]
  );

  async function runConfirmed(action: () => Promise<void>) {
    setConfirmBusy(true);
    try {
      await action();
      setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleInspectCustomer(id: string) {
    try {
      const res = await apiRequest<{
        customer: AdminCustomerRow;
        payments: PaymentRecord[];
        userNotifications?: UserNotificationRecord[];
        supportTickets?: SupportTicket[];
        auditHistory?: AuditLogEntry[];
      }>(`/api/admin/customers/${id}`);
      setSelectedCustomer(res);
      setCustDrawerTab('resumo');
      setCustNotesDraft(res.customer.adminNotes || '');
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  }

  async function handleSaveDashboardLayout(next: DashboardLayoutConfig) {
    setSavingLayout(true);
    try {
      const res = await apiRequest<{ layout: DashboardLayoutConfig }>('/api/admin/dashboard-layout', {
        method: 'PUT',
        body: JSON.stringify({ layout: next }),
      });
      setDashLayout(res.layout);
      setBanner({ type: 'ok', text: 'Layout do painel salvo para sua conta.' });
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setSavingLayout(false);
    }
  }

  function moveSectionOrder(key: DashboardLayoutConfig['sectionOrder'][number], dir: -1 | 1) {
    const order = [...dashLayout.sectionOrder];
    const idx = order.indexOf(key);
    if (idx < 0) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= order.length) return;
    [order[idx], order[nextIdx]] = [order[nextIdx], order[idx]];
    setDashLayout({ ...dashLayout, sectionOrder: order });
  }

  async function handleSaveCustomerNotes() {
    if (!selectedCustomer) return;
    setSavingNotes(true);
    try {
      await apiRequest(`/api/admin/customers/${selectedCustomer.customer.id}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ adminNotes: custNotesDraft }),
      });
      setBanner({ type: 'ok', text: 'Observações do cliente salvas.' });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    setCreatingCust(true);
    try {
      await apiRequest('/api/admin/customers', {
        method: 'POST',
        body: JSON.stringify(newCust),
      });
      setNewCustModal(false);
      setNewCust({
        displayName: '',
        email: '',
        phone: '',
        birthDate: '1995-01-01',
        password: '',
        adminNotes: '',
      });
      setBanner({ type: 'ok', text: 'Cliente cadastrado com sucesso.' });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setCreatingCust(false);
    }
  }

  async function handleReviewPayment(
    paymentId: string,
    decision: 'em_analise' | 'aprovado' | 'recusado' | 'cancelado' | 'reembolsado',
    notes: string
  ) {
    setReviewBusy(true);
    setProofBusyId(paymentId);
    try {
      await apiRequest(`/api/admin/payments/${paymentId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, notes }),
      });
      setBanner({
        type: 'ok',
        text:
          decision === 'aprovado'
            ? 'Pagamento aprovado e acesso VIP liberado com validade.'
            : decision === 'recusado'
            ? 'Pagamento recusado e motivo registrado.'
            : decision === 'cancelado'
            ? 'Cobrança marcada como cancelada e acesso VIP bloqueado.'
            : decision === 'reembolsado'
            ? 'Pagamento marcado como reembolsado e acesso revogado.'
            : 'Marcado como em análise.',
      });
      setReviewPayment(null);
      setReviewNotes('');
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setReviewBusy(false);
      setProofBusyId(null);
    }
  }

  async function handleCreateManualPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!manualUserId) {
      setBanner({ type: 'err', text: 'Selecione um cliente cadastrado.' });
      return;
    }
    setManualBusy(true);
    try {
      await apiRequest('/api/admin/payments/manual', {
        method: 'POST',
        body: JSON.stringify({
          userId: manualUserId,
          planKey: manualPlanKey,
          status: manualStatus,
          notes: manualNotes,
        }),
      });
      setManualModalOpen(false);
      setManualNotes('');
      setBanner({ type: 'ok', text: 'Pagamento registrado com sucesso.' });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setManualBusy(false);
    }
  }

  async function handleExtendSubscription(e: React.FormEvent) {
    e.preventDefault();
    if (!extendTarget) return;
    try {
      await apiRequest(`/api/admin/subscriptions/${extendTarget.id}/extend`, {
        method: 'POST',
        body: JSON.stringify({ days: Number(extendDays) }),
      });
      setExtendTarget(null);
      setBanner({ type: 'ok', text: `Assinatura estendida em ${extendDays} dias.` });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  }

  async function handleGroupDecision(id: string, status: 'aceito_no_grupo' | 'recusado_no_grupo') {
    try {
      await apiRequest(`/api/admin/group-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNotes: groupNotesMap[id] || '' }),
      });
      setBanner({
        type: 'ok',
        text:
          status === 'aceito_no_grupo'
            ? 'Cliente marcado como aceito no Grupo VIP.'
            : 'Solicitação de grupo marcada como recusada.',
      });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  }

  async function handleSavePlans(e: React.FormEvent) {
    e.preventDefault();
    if (!plansDraft) return;
    setSavingPlans(true);
    try {
      await apiRequest('/api/admin/plans', {
        method: 'PUT',
        body: JSON.stringify({ plans: plansDraft }),
      });
      setBanner({
        type: 'ok',
        text: 'Planos atualizados para novas contratações (compras anteriores preservadas).',
      });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setSavingPlans(false);
    }
  }

  const maxDailyRev = Math.max(100, ...(overview?.dailyRevenue.map((d) => d.revenueCents) || [0]));
  const maxDailySignups = Math.max(1, ...(overview?.dailySignups?.map((d) => d.count) || [0]));
  const maxPlanRev = Math.max(100, ...(overview?.revenueByPlan.map((r) => r.revenueCents) || [0]));

  const SECTION_LABELS: Record<DashboardLayoutConfig['sectionOrder'][number], string> = {
    alerts: 'Alertas Prioritários',
    quickActions: 'Ações Rápidas',
    kpis: 'Cartões de Indicadores (KPIs)',
    charts: 'Gráficos de Receita e Cadastros',
    planDistribution: 'Desempenho por Plano & Vendas',
    statusMatrix: 'Matriz Operacional de Status',
    recentActivities: 'Feed de Atividades Recentes',
  };

  return (
    <>
      <ProofZoomLightbox proof={zoomProof} onClose={() => setZoomProof(null)} />

      {confirmState && (
        <ConfirmDialog
          open={confirmState.open}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          busy={confirmBusy}
          onConfirm={() => runConfirmed(confirmState.onConfirm)}
          onCancel={() => setConfirmState(null)}
        />
      )}

      {/* ================= 1. DASHBOARD ================= */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#fff7fb]">
                Painel de Controle
              </h1>
              <p className="text-xs text-[#c6b1c0]">
                Receitas confirmadas, assinaturas ativas, conversão e fila de conferência
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCustomizingDash((v) => !v)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#170d1c] px-3 text-xs font-medium text-[#fff7fb] hover:border-[#f06aa9]/60"
              >
                <Sliders className="h-3.5 w-3.5 text-[#f06aa9]" />
                Personalizar
              </button>
              <div className="grid grid-cols-4 rounded-xl border border-white/10 bg-[#170d1c] p-1">
                {(
                  [
                    ['7d', '7 dias'],
                    ['30d', '30 dias'],
                    ['90d', '90 dias'],
                    ['all', 'Tudo'],
                  ] as const
                ).map(([pKey, label]) => (
                  <button
                    key={pKey}
                    type="button"
                    onClick={() => setOverviewPeriod(pKey)}
                    className={`min-h-[38px] rounded-lg px-2.5 text-xs font-medium whitespace-nowrap ${
                      overviewPeriod === pKey
                        ? 'bg-[#2a1530] text-[#fff7fb]'
                        : 'text-[#c6b1c0] hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {customizingDash && (
            <section className="rounded-2xl border border-[#f06aa9]/40 bg-[#170d1c] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#fff7fb]">
                  Visibilidade e ordem das seções do Dashboard
                </p>
                <button
                  type="button"
                  disabled={savingLayout}
                  onClick={() => handleSaveDashboardLayout(dashLayout)}
                  className="min-h-[36px] rounded-lg bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-3.5 text-xs font-semibold text-white"
                >
                  {savingLayout ? 'Salvando...' : 'Salvar Preferência'}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {dashLayout.sectionOrder.map((secKey, idx) => (
                  <div
                    key={secKey}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#100814] px-3 py-2 text-xs"
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-[#e8d9e4]">
                      <input
                        type="checkbox"
                        checked={dashLayout.visibleSections[secKey]}
                        onChange={(e) =>
                          setDashLayout({
                            ...dashLayout,
                            visibleSections: {
                              ...dashLayout.visibleSections,
                              [secKey]: e.target.checked,
                            },
                          })
                        }
                        className="h-4 w-4 accent-[#f06aa9]"
                      />
                      <span>{SECTION_LABELS[secKey]}</span>
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveSectionOrder(secKey, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-white/15 text-[#c6b1c0] disabled:opacity-30"
                        aria-label="Subir seção"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === dashLayout.sectionOrder.length - 1}
                        onClick={() => moveSectionOrder(secKey, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-white/15 text-[#c6b1c0] disabled:opacity-30"
                        aria-label="Descer seção"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {dashLayout.sectionOrder.map((secKey) => {
            if (!dashLayout.visibleSections[secKey]) return null;

            if (secKey === 'alerts' && overview.alerts.length > 0) {
              return (
                <section key="alerts" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {overview.alerts.map((al) => (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => setTab(al.targetTab as AdminModuleKey)}
                      className={`flex min-h-[48px] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-xs transition-colors ${
                        al.severity === 'err'
                          ? 'border-red-400/40 bg-red-950/30 text-red-100'
                          : al.severity === 'warn'
                          ? 'border-amber-400/35 bg-amber-950/25 text-amber-100'
                          : 'border-[#f06aa9]/35 bg-[#241028] text-[#f8d7e8]'
                      }`}
                    >
                      <span>{al.text}</span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </button>
                  ))}
                </section>
              );
            }

            if (secKey === 'quickActions') {
              return (
                <section key="quickActions" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('customers');
                      setNewCustModal(true);
                    }}
                    className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#170d1c] px-3 text-xs font-semibold text-[#fff7fb] hover:border-[#f06aa9]/50"
                  >
                    <UserPlus className="h-4 w-4 text-[#f06aa9]" />
                    Novo Cliente
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('proofs')}
                    className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#170d1c] px-3 text-xs font-semibold text-[#fff7fb] hover:border-[#f06aa9]/50"
                  >
                    <Eye className="h-4 w-4 text-[#f06aa9]" />
                    Conferir Provas ({overview.metrics.pendingProofs})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('coupons')}
                    className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#170d1c] px-3 text-xs font-semibold text-[#fff7fb] hover:border-[#f06aa9]/50"
                  >
                    <Plus className="h-4 w-4 text-[#f06aa9]" />
                    Gerir Cupons ({overview.metrics.activeCoupons ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('support')}
                    className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#170d1c] px-3 text-xs font-semibold text-[#fff7fb] hover:border-[#f06aa9]/50"
                  >
                    <MessageCircle className="h-4 w-4 text-[#f06aa9]" />
                    Chamados ({overview.metrics.openSupportTickets ?? 0})
                  </button>
                </section>
              );
            }

            if (secKey === 'kpis') {
              return (
                <section key="kpis" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard
                    label="Receita no Período"
                    value={formatBrl(overview.metrics.periodRevenueCents)}
                    sub={`Total histórico: ${formatBrl(overview.metrics.totalRevenueCents)}`}
                    highlight="pink"
                  />
                  <KpiCard
                    label="Assinantes VIP Ativos"
                    value={String(overview.metrics.validSubscribers)}
                    sub={`Conversão: ${overview.metrics.conversionRatePercent ?? 0}% · ${overview.metrics.expiringSubscriptions} vencendo`}
                    highlight="emerald"
                  />
                  <KpiCard
                    label="Provas / Pag. Pendentes"
                    value={`${overview.metrics.pendingProofs} / ${overview.metrics.pendingPayments}`}
                    sub={`${overview.metrics.expiredSubscriptions} expiradas · ${overview.metrics.openSupportTickets ?? 0} chamados`}
                    highlight={overview.metrics.pendingProofs > 0 ? 'amber' : 'neutral'}
                  />
                  <KpiCard
                    label="Clientes / Novos"
                    value={`${overview.metrics.totalClients} / +${overview.metrics.newClientsCount}`}
                    sub={`Faturamento mês: ${formatBrl(overview.metrics.monthRevenueCents)}`}
                  />
                </section>
              );
            }

            if (secKey === 'statusMatrix') {
              return (
                <section
                  key="statusMatrix"
                  className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4 lg:grid-cols-8"
                >
                  <MiniMetric label="Pag. aprovados" value={String(overview.metrics.approvedPayments)} />
                  <MiniMetric label="Pag. recusados" value={String(overview.metrics.rejectedPayments)} />
                  <MiniMetric label="Cancelados" value={String(overview.metrics.canceledPayments ?? 0)} />
                  <MiniMetric label="Reembolsados" value={String(overview.metrics.refundedPayments ?? 0)} />
                  <MiniMetric label="Cupons ativos" value={String(overview.metrics.activeCoupons ?? 0)} />
                  <MiniMetric label="Chamados abertos" value={String(overview.metrics.openSupportTickets ?? 0)} />
                  <MiniMetric label="Inconsistências" value={String(overview.metrics.inconsistentOrders ?? 0)} />
                  <MiniMetric label="Alertas seg." value={String(overview.metrics.securityWarnings ?? 0)} />
                </section>
              );
            }

            if (secKey === 'charts') {
              return (
                <div key="charts" className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 lg:col-span-7">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                          Receita Confirmada Diária (7d)
                        </h2>
                        <p className="text-xs text-[#c6b1c0]">Pagamentos aprovados</p>
                      </div>
                      <BarChart3 className="h-4 w-4 text-[#f06aa9]" />
                    </div>

                    <div className="mt-5 flex h-44 items-end gap-2 border-b border-white/10 pb-2">
                      {overview.dailyRevenue.map((day) => {
                        const pct = Math.max(6, Math.round((day.revenueCents / maxDailyRev) * 100));
                        return (
                          <div key={day.date} className="flex flex-1 flex-col items-center justify-end h-full">
                            <div
                              title={`${day.date}: ${formatBrl(day.revenueCents)}`}
                              style={{ height: `${day.revenueCents > 0 ? pct : 6}%` }}
                              className={`w-full max-w-[36px] rounded-t-md ${
                                day.revenueCents > 0
                                  ? 'bg-gradient-to-t from-[#c83c82] to-[#f06aa9]'
                                  : 'bg-white/10'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex gap-2 text-center">
                      {overview.dailyRevenue.map((day) => (
                        <div key={day.date} className="flex-1 font-mono-num text-[10px] text-[#c6b1c0]">
                          {day.date.slice(5).split('-').reverse().join('/')}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 lg:col-span-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                          Novos Cadastros (7d)
                        </h2>
                        <p className="text-xs text-[#c6b1c0]">Crescimento diário</p>
                      </div>
                      <UserPlus className="h-4 w-4 text-[#f06aa9]" />
                    </div>
                    <div className="mt-5 flex h-44 items-end gap-2 border-b border-white/10 pb-2">
                      {(overview.dailySignups || []).map((day) => {
                        const pct = Math.max(8, Math.round((day.count / maxDailySignups) * 100));
                        return (
                          <div key={day.date} className="flex flex-1 flex-col items-center justify-end h-full">
                            <div
                              title={`${day.date}: ${day.count} cadastro(s)`}
                              style={{ height: `${day.count > 0 ? pct : 6}%` }}
                              className={`w-full max-w-[32px] rounded-t-md ${
                                day.count > 0
                                  ? 'bg-gradient-to-t from-emerald-700 to-emerald-400'
                                  : 'bg-white/10'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex gap-2 text-center">
                      {(overview.dailySignups || []).map((day) => (
                        <div key={day.date} className="flex-1 font-mono-num text-[10px] text-[#c6b1c0]">
                          {day.count}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              );
            }

            if (secKey === 'planDistribution') {
              return (
                <section
                  key="planDistribution"
                  className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 grid grid-cols-1 gap-6 lg:grid-cols-12"
                >
                  <div className="lg:col-span-7">
                    <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                      Desempenho por Plano
                    </h2>
                    <div className="mt-4 space-y-3">
                      {overview.revenueByPlan.map((item) => {
                        const pct = Math.round((item.revenueCents / maxPlanRev) * 100);
                        return (
                          <div key={item.planKey}>
                            <div className="flex justify-between text-xs">
                              <span className="text-[#e8d9e4]">
                                {item.label} · {item.activeSubscribers} ativos ({item.count} vendas)
                              </span>
                              <span className="font-mono-num tabular-nums text-[#fff7fb]">
                                {formatBrl(item.revenueCents)}
                              </span>
                            </div>
                            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                              <div
                                style={{ width: `${item.revenueCents > 0 ? Math.max(6, pct) : 0}%` }}
                                className="h-full rounded-full bg-gradient-to-r from-[#c83c82] to-[#f06aa9]"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-white/10 pt-4 lg:pt-0 lg:pl-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-[#c6b1c0]">Vendas Recentes</h3>
                      <button
                        type="button"
                        onClick={() => setTab('payments')}
                        className="text-xs text-[#f06aa9] hover:underline"
                      >
                        Ver todas
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {overview.recentSales.length === 0 ? (
                        <p className="text-xs text-[#8f7889]">Nenhuma venda aprovada ainda.</p>
                      ) : (
                        overview.recentSales.slice(0, 4).map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-xs">
                            <span className="truncate pr-2 text-[#fff7fb]">
                              {s.customerName} ({s.planKey})
                            </span>
                            <span className="font-mono-num tabular-nums text-emerald-300">
                              {formatBrl(s.amountCents)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              );
            }

            if (secKey === 'recentActivities') {
              return (
                <section key="recentActivities" className="rounded-2xl border border-white/10 bg-[#170d1c] p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                      Atividades Recentes
                    </h2>
                    <Activity className="h-4 w-4 text-[#f06aa9]" />
                  </div>
                  <div className="mt-3 divide-y divide-white/5">
                    {overview.recentActivities.slice(0, 8).map((act) => (
                      <div key={act.id} className="flex items-start justify-between gap-3 py-2.5 text-xs">
                        <div className="min-w-0">
                          <p className="font-medium text-[#fff7fb]">{act.title}</p>
                          <p className="truncate text-[#c6b1c0]">{act.subtitle}</p>
                        </div>
                        <span className="shrink-0 font-mono-num tabular-nums text-[11px] text-[#8f7889]">
                          {formatDateTime(act.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            }

            return null;
          })}
        </div>
      )}

      {/* ================= 2. CLIENTES ================= */}
      {tab === 'customers' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 border border-white/10 bg-[#170d1c] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c6b1c0]" />
              <input
                type="search"
                value={custQuery}
                onChange={(e) => {
                  setCustQuery(e.target.value);
                  setCustPage(0);
                }}
                placeholder="Buscar nome, e-mail ou WhatsApp..."
                className="min-h-[44px] w-full border border-white/15 bg-[#100814] pl-10 pr-3 text-sm text-[#fff7fb]"
              />
            </div>

            <button
              type="button"
              onClick={() => setNewCustModal(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-4 text-xs font-semibold text-white whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" />
              Novo Cliente
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ['all', 'Todos'],
                ['new', 'Novos (7d)'],
                ['active_accounts', 'Contas Ativas'],
                ['vip', 'VIP Ativos'],
                ['inactive', 'Sem VIP'],
                ['pending_payment', 'Pag. Pendente'],
                ['expiring', 'Vencendo (≤5d)'],
                ['expired', 'Expirados'],
                ['lifetime', 'Vitalícios'],
                ['suspended', 'Suspensos'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  setCustFilter(val);
                  setCustPage(0);
                }}
                className={`min-h-[40px] px-3.5 text-xs font-medium border whitespace-nowrap ${
                  custFilter === val
                    ? 'border-[#f06aa9] bg-[#2a1530] text-[#fff7fb]'
                    : 'border-white/10 bg-[#170d1c] text-[#c6b1c0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Mobile Cards View */}
          <div className="space-y-3 md:hidden">
            {pagedCustomers.length === 0 ? (
              <div className="border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
                Nenhum cliente encontrado.
              </div>
            ) : (
              pagedCustomers.map((c) => (
                <article key={c.id} className="border border-white/10 bg-[#170d1c] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-[#fff7fb]">{c.displayName}</h3>
                      <p className="truncate text-xs text-[#c6b1c0]">{c.email}</p>
                      <p className="mt-0.5 font-mono-num text-xs text-[#e8d9e4]">{c.phone}</p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        c.suspended
                          ? 'text-red-400'
                          : c.subscription.hasVipAccess
                          ? 'text-emerald-400'
                          : c.subscription.isExpired
                          ? 'text-neutral-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {c.subscription.statusLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-[#c6b1c0]">
                    <span>Gasto: {formatBrl(c.totalSpentCents)}</span>
                    <span>Cadastro: {formatDate(c.createdAt)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleInspectCustomer(c.id)}
                      className="min-h-[44px] flex items-center justify-center gap-1.5 border border-white/15 text-xs font-medium text-[#fff7fb]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Detalhes
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: c.suspended ? 'Reativar cliente?' : 'Suspender cliente?',
                          message: c.suspended
                            ? `Reativar acesso de ${c.displayName}?`
                            : `Suspender ${c.displayName}? A sessão ativa será encerrada imediatamente.`,
                          confirmLabel: c.suspended ? 'Reativar' : 'Suspender',
                          danger: !c.suspended,
                          onConfirm: async () => {
                            await apiRequest(`/api/admin/customers/${c.id}/suspend`, {
                              method: 'PATCH',
                              body: JSON.stringify({ suspended: !c.suspended }),
                            });
                            setBanner({
                              type: 'ok',
                              text: !c.suspended ? 'Cliente suspenso.' : 'Cliente reativado.',
                            });
                            await reloadAll();
                          },
                        })
                      }
                      className={`min-h-[44px] flex items-center justify-center gap-1.5 border text-xs font-medium ${
                        c.suspended
                          ? 'border-emerald-400/40 text-emerald-300'
                          : 'border-red-400/40 text-red-300'
                      }`}
                    >
                      {c.suspended ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
                      {c.suspended ? 'Reativar' : 'Suspender'}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block border border-white/10 bg-[#170d1c] overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-[#c6b1c0]">
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCustSortKey('displayName');
                        setCustSortDir((d) => (d === 1 ? -1 : 1));
                      }}
                      className="inline-flex items-center gap-1"
                    >
                      Cliente <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Assinatura</th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCustSortKey('totalSpentCents');
                        setCustSortDir((d) => (d === 1 ? -1 : 1));
                      }}
                      className="inline-flex items-center gap-1"
                    >
                      Total Gasto <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pagedCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#fff7fb]">{c.displayName}</p>
                      <p className="text-xs text-[#c6b1c0]">{c.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono-num text-xs text-[#e8d9e4]">{c.phone}</td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          c.suspended
                            ? 'text-red-400 font-semibold'
                            : c.subscription.hasVipAccess
                            ? 'text-emerald-400 font-semibold'
                            : 'text-amber-300 font-semibold'
                        }
                      >
                        {c.subscription.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono-num text-xs">{formatBrl(c.totalSpentCents)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleInspectCustomer(c.id)}
                          className="min-h-[36px] border border-white/15 px-3 text-xs"
                        >
                          Perfil
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: c.suspended ? 'Reativar cliente?' : 'Suspender cliente?',
                              message: `Confirmar alteração de acesso para ${c.displayName}?`,
                              confirmLabel: c.suspended ? 'Reativar' : 'Suspender',
                              danger: !c.suspended,
                              onConfirm: async () => {
                                await apiRequest(`/api/admin/customers/${c.id}/suspend`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ suspended: !c.suspended }),
                                });
                                setBanner({ type: 'ok', text: 'Status de cliente atualizado.' });
                                await reloadAll();
                              },
                            })
                          }
                          className="min-h-[36px] border border-white/15 px-3 text-xs"
                        >
                          {c.suspended ? 'Reativar' : 'Suspender'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border border-white/10 bg-[#170d1c] px-4 py-3 text-xs text-[#c6b1c0]">
            <span>
              {pagedCustomers.length} de {filteredCustomers.length}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={custPage === 0}
                onClick={() => setCustPage((p) => Math.max(0, p - 1))}
                className="min-h-[38px] border border-white/15 px-3 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={(custPage + 1) * 12 >= filteredCustomers.length}
                onClick={() => setCustPage((p) => p + 1)}
                className="min-h-[38px] border border-white/15 px-3 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= 3. PAGAMENTOS ================= */}
      {tab === 'payments' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#170d1c] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#c6b1c0]" />
              <input
                type="search"
                value={payQuery}
                onChange={(e) => setPayQuery(e.target.value)}
                placeholder="Buscar referência, cliente ou plano..."
                className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] pl-10 pr-3 text-sm text-[#fff7fb]"
              />
            </div>
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-4 text-xs font-semibold text-white whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Registrar Pagamento Manual
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ['all', 'Todos'],
                ['aguardando_analise', 'Aguardando Análise'],
                ['aguardando_pagamento', 'Aguardando Pag.'],
                ['aprovado', 'Aprovados'],
                ['recusado', 'Recusados'],
                ['cancelado', 'Cancelados'],
                ['reembolsado', 'Reembolsados'],
                ['expirado', 'Expirados'],
              ] as const
            ).map(([st, label]) => (
              <button
                key={st}
                type="button"
                onClick={() => setPayStatusFilter(st)}
                className={`min-h-[40px] rounded-xl px-3 text-xs font-medium border whitespace-nowrap ${
                  payStatusFilter === st
                    ? 'border-[#f06aa9] bg-[#2a1530] text-[#fff7fb]'
                    : 'border-white/10 bg-[#170d1c] text-[#c6b1c0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredPayments.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
                Nenhum pagamento localizado.
              </div>
            ) : (
              filteredPayments.map((pay) => {
                const meta = PAYMENT_STATUS_META[pay.status];
                return (
                  <article
                    key={pay.id}
                    className="rounded-2xl border border-white/10 bg-[#170d1c] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#fff7fb]">{pay.customerName || 'Cliente'}</p>
                        <p className="text-xs text-[#c6b1c0]">
                          {pay.customerEmail} · <span className="capitalize">{pay.planKey}</span> ·{' '}
                          <strong className="font-mono-num tabular-nums text-[#fff7fb]">
                            {formatBrl(pay.amountCents)}
                          </strong>
                        </p>
                        <p className="mt-0.5 font-mono-num text-[11px] text-[#8f7889]">
                          {pay.externalReference} · {formatDateTime(pay.createdAt)}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold ${meta?.toneClass || 'text-white'}`}>
                        {meta?.label || pay.status}
                      </span>
                    </div>

                    {pay.proofs && pay.proofs.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {pay.proofs.map((pr) => (
                          <button
                            key={pr.id}
                            type="button"
                            onClick={() => setZoomProof(pr)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#f06aa9]/35 bg-[#100814] px-3 text-xs text-[#f06aa9]"
                          >
                            <ZoomIn className="h-3.5 w-3.5" />
                            <span>Ver {pr.originalFilename}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setReviewPayment(pay);
                          setReviewNotes(pay.rejectionReason || '');
                        }}
                        className="min-h-[44px] rounded-xl bg-[#2a1530] px-4 text-xs font-semibold text-[#fff7fb] hover:bg-[#3a1d42]"
                      >
                        Analisar / Alterar Status
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= 4. COMPROVANTES (QUEUE + ZOOM) ================= */}
      {tab === 'proofs' && (
        <div className="space-y-5">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ['all', 'Todos'],
                ['aguardando_analise', 'Aguardando Análise'],
                ['em_analise', 'Em Análise'],
                ['aprovado', 'Aprovados'],
                ['recusado', 'Recusados'],
              ] as const
            ).map(([st, label]) => (
              <button
                key={st}
                type="button"
                onClick={() => setProofFilter(st)}
                className={`min-h-[40px] px-3.5 text-xs font-medium border whitespace-nowrap ${
                  proofFilter === st
                    ? 'border-[#f06aa9] bg-[#2a1530] text-[#fff7fb]'
                    : 'border-white/10 bg-[#170d1c] text-[#c6b1c0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredProofs.length === 0 ? (
            <div className="border border-white/10 bg-[#170d1c] p-10 text-center text-xs text-[#c6b1c0]">
              Nenhum comprovante nesta fila.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filteredProofs.map((pr) => {
                const stMeta = PAYMENT_STATUS_META[pr.status];
                const isImage = pr.mimeType.startsWith('image/');
                return (
                  <article key={pr.id} className="border border-white/10 bg-[#170d1c] p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#fff7fb]">{pr.customerName || 'Cliente'}</p>
                        <p className="truncate text-xs text-[#c6b1c0]">{pr.customerEmail}</p>
                        <p className="mt-1 text-xs text-[#e8d9e4]">
                          Plano <strong className="capitalize">{pr.planKey}</strong> ·{' '}
                          {pr.amountCents ? formatBrl(pr.amountCents) : '—'}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold ${stMeta?.toneClass}`}>
                        {stMeta?.label || pr.status}
                      </span>
                    </div>

                    <div className="border border-white/10 bg-[#100814] p-3">
                      {isImage ? (
                        <button
                          type="button"
                          onClick={() => setZoomProof(pr)}
                          className="relative block w-full overflow-hidden"
                        >
                          <img
                            src={`/api/proofs/${pr.id}/file`}
                            alt={pr.originalFilename}
                            className="max-h-52 w-full object-contain bg-black/40"
                          />
                          <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#f06aa9]">
                            <ZoomIn className="h-3.5 w-3.5" />
                            Toque para ampliar comprovante
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setZoomProof(pr)}
                          className="flex min-h-[56px] w-full items-center justify-between gap-3 px-2 text-left text-xs text-[#f06aa9]"
                        >
                          <span className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            <span>
                              {pr.originalFilename} ({formatFileSize(pr.sizeBytes)})
                            </span>
                          </span>
                          <span className="font-semibold">Abrir PDF</span>
                        </button>
                      )}

                      <div className="mt-2 flex flex-wrap gap-3 border-t border-white/10 pt-2 text-[11px] text-[#c6b1c0]">
                        <span>Enviado: {formatDateTime(pr.createdAt)}</span>
                        {pr.extractedReference && <span>Ref: {pr.extractedReference}</span>}
                        {pr.extractedAmountCents && (
                          <span>Valor informado: {formatBrl(pr.extractedAmountCents)}</span>
                        )}
                      </div>
                    </div>

                    <input
                      type="text"
                      value={proofNotesMap[pr.id] ?? pr.reviewNotes ?? ''}
                      onChange={(e) =>
                        setProofNotesMap((m) => ({ ...m, [pr.id]: e.target.value }))
                      }
                      placeholder="Observação ou motivo da decisão..."
                      className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={proofBusyId === pr.paymentId}
                        onClick={() =>
                          handleReviewPayment(
                            pr.paymentId,
                            'aprovado',
                            proofNotesMap[pr.id] ?? pr.reviewNotes ?? ''
                          )
                        }
                        className="min-h-[44px] bg-emerald-700 px-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        disabled={proofBusyId === pr.paymentId}
                        onClick={() =>
                          handleReviewPayment(
                            pr.paymentId,
                            'em_analise',
                            proofNotesMap[pr.id] ?? pr.reviewNotes ?? ''
                          )
                        }
                        className="min-h-[44px] border border-sky-400/40 bg-sky-950/30 px-2 text-xs font-semibold text-sky-200 disabled:opacity-50"
                      >
                        Em análise
                      </button>
                      <button
                        type="button"
                        disabled={proofBusyId === pr.paymentId}
                        onClick={() =>
                          handleReviewPayment(
                            pr.paymentId,
                            'recusado',
                            proofNotesMap[pr.id] ?? pr.reviewNotes ?? ''
                          )
                        }
                        className="min-h-[44px] border border-red-400/40 bg-red-950/30 px-2 text-xs font-semibold text-red-200 disabled:opacity-50"
                      >
                        Recusar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= 5. ASSINATURAS ================= */}
      {tab === 'subscriptions' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {(
                [
                  ['all', 'Todas'],
                  ['active', 'Ativas'],
                  ['expiring', 'Vencendo (≤5d)'],
                  ['expired', 'Vencidas'],
                  ['suspended', 'Suspensas'],
                  ['canceled', 'Canceladas'],
                  ['lifetime', 'Vitalícias'],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSubFilter(st)}
                  className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium border whitespace-nowrap ${
                    subFilter === st
                      ? 'border-[#f06aa9] bg-[#2a1530] text-[#fff7fb]'
                      : 'border-white/10 bg-[#170d1c] text-[#c6b1c0]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={async () => {
                const res = await apiRequest<{ expiredCount: number }>(
                  '/api/admin/subscriptions/sweep',
                  { method: 'POST' }
                );
                setBanner({
                  type: 'ok',
                  text: `Varredura executada: ${res.expiredCount} assinatura(s) vencida(s) bloqueada(s).`,
                });
                await reloadAll();
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#170d1c] px-4 text-xs font-medium text-[#fff7fb]"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#f06aa9]" />
              Verificar Vencimentos
            </button>
          </div>

          <div className="space-y-3">
            {filteredSubscriptions.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
                Nenhuma assinatura nesta categoria.
              </div>
            ) : (
              filteredSubscriptions.map((s) => {
                const stLabel = s.customerSuspended
                  ? 'Conta Suspensa'
                  : s.status === 'aprovado'
                  ? 'Ativa'
                  : s.status === 'expirado'
                  ? 'Expirada'
                  : PAYMENT_STATUS_META[s.status]?.label || s.status;
                const stColor = s.customerSuspended
                  ? 'text-red-400'
                  : s.status === 'aprovado'
                  ? 'text-emerald-400'
                  : s.status === 'cancelado'
                  ? 'text-orange-300'
                  : s.status === 'reembolsado'
                  ? 'text-purple-300'
                  : 'text-neutral-400';

                return (
                  <article key={s.id} className="rounded-2xl border border-white/10 bg-[#170d1c] p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#fff7fb]">{s.customerName}</p>
                        <p className="text-xs text-[#c6b1c0]">
                          {s.customerEmail} · {s.customerPhone}
                        </p>
                        <p className="mt-1 text-xs text-[#e8d9e4]">
                          Plano <strong className="capitalize">{s.planKey}</strong> · Início:{' '}
                          {formatDate(s.approvedAt)} · Vencimento:{' '}
                          <strong>
                            {s.planKey === 'vitalicio' ? 'Vitalício' : formatDate(s.expiresAt)}
                          </strong>
                          {s.daysRemaining !== null && s.status === 'aprovado' && (
                            <span className="ml-1.5 text-emerald-300 font-mono-num tabular-nums">
                              ({s.daysRemaining}d)
                            </span>
                          )}
                          {s.activationOrigin && (
                            <span className="ml-2 text-[11px] text-[#c6b1c0]">
                              · Origem: {s.activationOrigin.replace(/_/g, ' ')}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold ${stColor}`}>{stLabel}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      {s.planKey !== 'vitalicio' && (
                        <button
                          type="button"
                          onClick={() => {
                            setExtendTarget({ id: s.id, customerName: s.customerName });
                            setExtendDays('30');
                          }}
                          className="min-h-[44px] rounded-xl border border-[#f06aa9]/40 bg-[#241028] px-4 text-xs font-semibold text-[#fff7fb]"
                        >
                          Estender Dias
                        </button>
                      )}
                      {s.status === 'aprovado' && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: 'Revogar assinatura VIP?',
                              message: `Isto bloqueará imediatamente a Área VIP de ${s.customerName}.`,
                              confirmLabel: 'Revogar Acesso',
                              danger: true,
                              onConfirm: async () => {
                                await apiRequest(`/api/admin/subscriptions/${s.id}/revoke`, {
                                  method: 'POST',
                                  body: JSON.stringify({
                                    reason: 'Assinatura revogada manualmente pelo administrador.',
                                  }),
                                });
                                setBanner({ type: 'ok', text: 'Assinatura revogada.' });
                                await reloadAll();
                              },
                            })
                          }
                          className="min-h-[44px] rounded-xl border border-red-400/40 bg-red-950/30 px-4 text-xs font-semibold text-red-200"
                        >
                          Revogar Acesso
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= 6. GRUPO VIP ================= */}
      {tab === 'vip-group' && (
        <div className="space-y-5">
          <div className="border border-[#f06aa9]/30 bg-[#170d1c] p-4 text-xs leading-relaxed text-[#d9c7d4]">
            Quando o assinante VIP clica em <strong>ACESSAR GRUPO VIP</strong>, a solicitação é
            registrada aqui e direcionada ao WhatsApp da Nicolly (sem nunca exibir o link privado do
            grupo para o cliente). Confirme abaixo quem já foi adicionado ou recusado.
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ['all', 'Todas'],
                ['pendente_whatsapp', 'Pendentes'],
                ['aceito_no_grupo', 'Aceitos'],
                ['recusado_no_grupo', 'Recusados'],
              ] as const
            ).map(([st, label]) => (
              <button
                key={st}
                type="button"
                onClick={() => setGroupFilter(st)}
                className={`min-h-[40px] px-3.5 text-xs font-medium border whitespace-nowrap ${
                  groupFilter === st
                    ? 'border-[#f06aa9] bg-[#2a1530] text-[#fff7fb]'
                    : 'border-white/10 bg-[#170d1c] text-[#c6b1c0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredGroupRequests.length === 0 ? (
            <div className="border border-white/10 bg-[#170d1c] p-10 text-center text-xs text-[#c6b1c0]">
              Nenhuma solicitação de entrada no Grupo VIP registrada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroupRequests.map((req) => (
                <article key={req.id} className="border border-white/10 bg-[#170d1c] p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#fff7fb]">{req.customerName}</p>
                      <p className="text-xs text-[#c6b1c0]">
                        {req.customerEmail} · {req.customerPhone}
                      </p>
                      <p className="mt-1 text-xs text-[#e8d9e4]">
                        Plano <strong className="capitalize">{req.planKey}</strong> ·{' '}
                        {formatDateTime(req.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        req.status === 'aceito_no_grupo'
                          ? 'text-emerald-400'
                          : req.status === 'recusado_no_grupo'
                          ? 'text-red-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {req.status === 'aceito_no_grupo'
                        ? 'Aceito no Grupo'
                        : req.status === 'recusado_no_grupo'
                        ? 'Recusado'
                        : 'Aguardando Nicolly'}
                    </span>
                  </div>

                  <input
                    type="text"
                    value={groupNotesMap[req.id] ?? req.adminNotes ?? ''}
                    onChange={(e) =>
                      setGroupNotesMap((m) => ({ ...m, [req.id]: e.target.value }))
                    }
                    placeholder="Observação interna (opcional)..."
                    className="min-h-[42px] w-full border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <a
                      href={`https://wa.me/${req.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        `Olá ${req.customerName}! Recebi sua solicitação de entrada no Grupo VIP da Nicolly.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 border border-white/15 px-3 text-xs font-medium text-[#fff7fb]"
                    >
                      <MessageCircle className="h-3.5 w-3.5 text-[#f06aa9]" />
                      Chamar no WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => handleGroupDecision(req.id, 'aceito_no_grupo')}
                      className="min-h-[44px] bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-600"
                    >
                      Aceitar no Grupo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGroupDecision(req.id, 'recusado_no_grupo')}
                      className="min-h-[44px] border border-red-400/40 bg-red-950/30 px-3 text-xs font-semibold text-red-200"
                    >
                      Recusar Entrada
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= 7. PLANOS ================= */}
      {tab === 'plans' && plansDraft && (
        <form onSubmit={handleSavePlans} className="space-y-6">
          <div className="border border-white/10 bg-[#170d1c] p-4 text-xs text-[#d9c7d4]">
            Alterações de preço e oferta passam a valer para <strong>novas compras</strong>,
            preservando integralmente os valores das assinaturas já pagas no histórico.
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {(['semanal', 'mensal', 'vitalicio'] as PlanKey[]).map((key) => {
              const plan = plansDraft[key];
              return (
                <section key={key} className="border border-white/10 bg-[#170d1c] p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h2 className="font-display text-lg font-semibold capitalize text-[#fff7fb]">
                      Plano {key}
                    </h2>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-[#e8d9e4]">
                      <input
                        type="checkbox"
                        checked={plan.active !== false}
                        onChange={(e) =>
                          setPlansDraft({
                            ...plansDraft,
                            [key]: { ...plan, active: e.target.checked },
                          })
                        }
                        className="h-4 w-4 accent-[#f06aa9]"
                      />
                      Ativo
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs text-[#c6b1c0]">Nome de exibição</label>
                    <input
                      type="text"
                      value={plan.name}
                      onChange={(e) =>
                        setPlansDraft({ ...plansDraft, [key]: { ...plan, name: e.target.value } })
                      }
                      className="mt-1 min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#c6b1c0]">Valor (R$)</label>
                      <input
                        type="text"
                        value={plan.preco}
                        onChange={(e) =>
                          setPlansDraft({
                            ...plansDraft,
                            [key]: { ...plan, preco: e.target.value },
                          })
                        }
                        className="mt-1 min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 font-mono-num text-sm text-[#fff7fb]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c6b1c0]">
                        {key === 'vitalicio' ? 'Vitalício' : 'Duração (dias)'}
                      </label>
                      <input
                        type="number"
                        disabled={key === 'vitalicio'}
                        value={key === 'vitalicio' ? 0 : plan.duracao}
                        onChange={(e) =>
                          setPlansDraft({
                            ...plansDraft,
                            [key]: { ...plan, duracao: Number(e.target.value) },
                          })
                        }
                        className="mt-1 min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 font-mono-num text-sm text-[#fff7fb] disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-[#c6b1c0]">Selo / Promoção (opcional)</label>
                    <input
                      type="text"
                      value={plan.offerBadge || ''}
                      onChange={(e) =>
                        setPlansDraft({
                          ...plansDraft,
                          [key]: { ...plan, offerBadge: e.target.value },
                        })
                      }
                      placeholder="Ex: Mais escolhido"
                      className="mt-1 min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#c6b1c0]">Descrição curta</label>
                    <textarea
                      rows={2}
                      value={plan.description || ''}
                      onChange={(e) =>
                        setPlansDraft({
                          ...plansDraft,
                          [key]: { ...plan, description: e.target.value },
                        })
                      }
                      className="mt-1 w-full border border-white/15 bg-[#100814] p-2.5 text-xs text-[#fff7fb]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#c6b1c0]">Link oficial Mercado Pago</label>
                    <input
                      type="url"
                      value={plan.link}
                      onChange={(e) =>
                        setPlansDraft({ ...plansDraft, [key]: { ...plan, link: e.target.value } })
                      }
                      className="mt-1 min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                    />
                  </div>
                </section>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={savingPlans}
            className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 text-sm font-semibold text-white"
          >
            <Check className="h-4 w-4" />
            {savingPlans ? 'Salvando planos...' : 'Salvar Alterações nos Planos'}
          </button>

          {planHistory.length > 0 && (
            <section className="border border-white/10 bg-[#170d1c] p-5">
              <h3 className="font-display text-base font-semibold text-[#fff7fb]">
                Histórico de Alterações de Planos
              </h3>
              <div className="mt-3 space-y-2 text-xs">
                {planHistory.slice(0, 8).map((h) => (
                  <div key={h.id} className="border-b border-white/5 pb-2 text-[#c6b1c0]">
                    <span className="text-[#fff7fb] font-medium">{h.adminName}</span> ·{' '}
                    {formatDateTime(h.createdAt)} · {JSON.stringify(h.changes)}
                  </div>
                ))}
              </div>
            </section>
          )}
        </form>
      )}

      {/* ================= 8. FINANCEIRO ================= */}
      {tab === 'finance' && financeData && (
        <div className="space-y-6">
          <div className="border border-white/10 bg-[#170d1c] p-4 space-y-3">
            <p className="text-xs text-[#c6b1c0]">
              Os KPIs principais somam <strong>exclusivamente pagamentos confirmados</strong>. Use os
              filtros abaixo para consultar lançamentos por data ou situação.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-[11px] text-[#c6b1c0]">Data inicial</label>
                <input
                  type="date"
                  value={financeRange.from}
                  onChange={(e) => setFinanceRange({ ...financeRange, from: e.target.value })}
                  className="mt-1 min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#c6b1c0]">Data final</label>
                <input
                  type="date"
                  value={financeRange.to}
                  onChange={(e) => setFinanceRange({ ...financeRange, to: e.target.value })}
                  className="mt-1 min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />
              </div>
              <button
                type="button"
                onClick={() => onRefreshFinance(financeRange.from, financeRange.to, financeRange.status)}
                className="min-h-[44px] self-end bg-[#2a1530] px-4 text-xs font-semibold text-[#fff7fb]"
              >
                Filtrar Período
              </button>
              <a
                href="/api/admin/export/finance"
                className="inline-flex min-h-[44px] self-end items-center justify-center gap-2 border border-[#f06aa9]/45 px-4 text-xs font-semibold text-[#f8b3d3]"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </a>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pt-1">
              {(
                [
                  ['confirmed', 'Confirmados'],
                  ['all', 'Todos os status'],
                  ['pending', 'Pendentes'],
                  ['rejected', 'Recusados'],
                  ['canceled', 'Cancelados'],
                  ['refunded', 'Reembolsados'],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setFinanceRange({ ...financeRange, status: st });
                    onRefreshFinance(financeRange.from, financeRange.to, st);
                  }}
                  className={`min-h-[38px] px-3 text-xs font-medium border whitespace-nowrap ${
                    financeRange.status === st
                      ? 'border-[#f06aa9] bg-[#2a1530] text-[#fff7fb]'
                      : 'border-white/10 bg-[#100814] text-[#c6b1c0]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Receita Confirmada"
              value={formatBrl(financeData.summary.totalConfirmedCents)}
              sub={`Hoje: ${formatBrl(financeData.summary.todayConfirmedCents ?? 0)} · Ano: ${formatBrl(
                financeData.summary.currentYearCents ?? 0
              )}`}
              highlight="emerald"
            />
            <KpiCard
              label="Ticket Médio"
              value={formatBrl(financeData.summary.averageTicketCents)}
              sub={`${financeData.summary.confirmedCount} pagamento(s) confirmado(s)`}
            />
            <KpiCard
              label="Mês Atual vs Anterior"
              value={formatBrl(financeData.summary.currentMonthCents)}
              sub={`Mês anterior: ${formatBrl(financeData.summary.previousMonthCents)}`}
              highlight="pink"
            />
            <KpiCard
              label="Pendente / Estornado"
              value={formatBrl(financeData.summary.pendingPotentialCents)}
              sub={`${financeData.summary.pendingCount} pend. · ${
                financeData.summary.canceledCount ?? 0
              } canc. (${formatBrl(financeData.summary.canceledCents ?? 0)}) · ${
                financeData.summary.refundedCount ?? 0
              } reemb.`}
              highlight="amber"
            />
          </section>

          <section className="border border-white/10 bg-[#170d1c] p-5">
            <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
              Faturamento Confirmado por Plano
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {financeData.byPlan.map((bp) => (
                <div key={bp.planKey} className="border border-white/10 bg-[#100814] p-4">
                  <p className="text-xs capitalize text-[#c6b1c0]">Plano {bp.planKey}</p>
                  <p className="mt-1 font-mono-num text-xl font-semibold text-[#fff7fb]">
                    {formatBrl(bp.revenueCents)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#c6b1c0]">{bp.count} venda(s) confirmada(s)</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-white/10 bg-[#170d1c] p-5 space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
              Lançamentos ({financeData.transactions.length})
            </h2>
            {financeData.transactions.length === 0 ? (
              <p className="text-xs text-[#c6b1c0]">Nenhuma transação localizada neste filtro.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {financeData.transactions.slice(0, 60).map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div className="min-w-0 pr-3">
                      <p className="truncate font-medium text-[#fff7fb]">
                        {t.customerName} · <span className="capitalize">{t.planKey}</span>
                        {t.couponCode && (
                          <span className="ml-2 text-emerald-400 font-mono-num">
                            [{t.couponCode}]
                          </span>
                        )}
                      </p>
                      <p className="text-[#8f7889]">
                        {formatDateTime(t.approvedAt || t.createdAt)} · {t.externalReference} ·{' '}
                        {PAYMENT_STATUS_META[t.status as PaymentStatus]?.label || t.status}
                      </p>
                    </div>
                    <span className="font-mono-num font-semibold text-emerald-300">
                      {formatBrl(t.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ================= 9. RELATÓRIOS (7 EXPORTS CSV) ================= */}
      {tab === 'reports' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: 'Relatório de Clientes (CSV)',
              desc: 'Clientes cadastrados, telefones, conta e status atual da assinatura.',
              href: '/api/admin/export/customers',
            },
            {
              title: 'Relatório de Pagamentos (CSV)',
              desc: 'Transações (aprovadas, pendentes, recusadas, cupons e origem).',
              href: '/api/admin/export/payments',
            },
            {
              title: 'Relatório de Assinaturas (CSV)',
              desc: 'Vigência, início, vencimento, origem de ativação e status.',
              href: '/api/admin/export/subscriptions',
            },
            {
              title: 'Fechamento Financeiro (CSV)',
              desc: 'Receitas confirmadas prontas para Excel ou Google Planilhas no Android.',
              href: '/api/admin/export/finance',
            },
            {
              title: 'Acessos ao Grupo VIP (CSV)',
              desc: 'Solicitações de entrada no Grupo VIP via WhatsApp e decisões da Nicolly.',
              href: '/api/admin/export/vip-access',
            },
            {
              title: 'Relatório de Cupons (CSV)',
              desc: 'Códigos cadastrados, regras de desconto, usos realizados e validade.',
              href: '/api/admin/export/coupons',
            },
            {
              title: 'Trilha de Auditoria (CSV)',
              desc: 'Registro cronológico completo de eventos administrativos e de segurança.',
              href: '/api/admin/export/audit',
            },
          ].map((rep) => (
            <div key={rep.href} className="border border-white/10 bg-[#170d1c] p-5 flex flex-col justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#fff7fb]">{rep.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[#c6b1c0]">{rep.desc}</p>
              </div>
              <a
                href={rep.href}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-4 text-xs font-semibold text-white"
              >
                <Download className="h-4 w-4" />
                Baixar Arquivo CSV
              </a>
            </div>
          ))}
        </div>
      )}

      {/* ================= MODALS (Customer 360 Drawer, New Customer, Manual Payment, Review Payment, Extend Sub) ================= */}
      {selectedCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/15 bg-[#170d1c] p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-[#fff7fb]">
                  {selectedCustomer.customer.displayName}
                </h2>
                <p className="text-xs text-[#c6b1c0]">
                  {selectedCustomer.customer.email} · {selectedCustomer.customer.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#c6b1c0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabbed Drawer Nav */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {(
                [
                  ['resumo', 'Resumo'],
                  ['pagamentos', `Pagamentos (${selectedCustomer.payments.length})`],
                  ['notificacoes', `Avisos (${selectedCustomer.userNotifications?.length ?? 0})`],
                  ['chamados', `Chamados (${selectedCustomer.supportTickets?.length ?? 0})`],
                  ['auditoria', `Auditoria (${selectedCustomer.auditHistory?.length ?? 0})`],
                ] as const
              ).map(([tKey, label]) => (
                <button
                  key={tKey}
                  type="button"
                  onClick={() => setCustDrawerTab(tKey)}
                  className={`min-h-[38px] rounded-xl border px-3 text-xs font-medium whitespace-nowrap ${
                    custDrawerTab === tKey
                      ? 'border-[#f06aa9] bg-[#2a1530] text-white'
                      : 'border-white/10 bg-[#100814] text-[#c6b1c0]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {custDrawerTab === 'resumo' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs border border-white/10 bg-[#100814] p-3">
                  <div>
                    <span className="text-[#c6b1c0]">Assinatura:</span>
                    <p className="font-semibold text-[#fff7fb]">
                      {selectedCustomer.customer.subscription.statusLabel}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#c6b1c0]">Nascimento:</span>
                    <p className="font-mono-num text-[#fff7fb]">
                      {formatDate(selectedCustomer.customer.birthDate)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#c6b1c0]">Total gasto:</span>
                    <p className="font-mono-num text-[#fff7fb]">
                      {formatBrl(selectedCustomer.customer.totalSpentCents)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#c6b1c0]">Último login:</span>
                    <p className="font-mono-num text-[#fff7fb]">
                      {formatDateTime(selectedCustomer.customer.lastLoginAt)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[#e8d9e4]">
                    Observações administrativas internas
                  </label>
                  <textarea
                    rows={3}
                    value={custNotesDraft}
                    onChange={(e) => setCustNotesDraft(e.target.value)}
                    placeholder="Anotações sobre atendimento, grupo VIP ou histórico..."
                    className="w-full border border-white/15 bg-[#100814] p-3 text-xs text-[#fff7fb]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={savingNotes}
                      onClick={handleSaveCustomerNotes}
                      className="min-h-[44px] flex-1 bg-[#2a1530] px-4 text-xs font-semibold text-white"
                    >
                      {savingNotes ? 'Salvando...' : 'Salvar Observações'}
                    </button>
                    <a
                      href={`https://wa.me/${selectedCustomer.customer.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center gap-1.5 border border-white/15 px-4 text-xs font-medium text-[#f06aa9]"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            )}

            {custDrawerTab === 'pagamentos' && (
              <div className="space-y-2">
                {selectedCustomer.payments.length === 0 ? (
                  <p className="text-xs text-[#8f7889]">Sem pagamentos.</p>
                ) : (
                  selectedCustomer.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between border border-white/10 bg-[#100814] p-3 text-xs">
                      <div>
                        <p className="capitalize font-semibold text-[#fff7fb]">
                          {p.planKey} · {formatBrl(p.amountCents)}
                        </p>
                        <p className="font-mono-num text-[11px] text-[#8f7889]">
                          {p.externalReference} · {formatDateTime(p.createdAt)}
                        </p>
                      </div>
                      <span className="text-[#c6b1c0]">{PAYMENT_STATUS_META[p.status]?.label || p.status}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {custDrawerTab === 'notificacoes' && (
              <div className="space-y-2">
                {!selectedCustomer.userNotifications || selectedCustomer.userNotifications.length === 0 ? (
                  <p className="text-xs text-[#8f7889]">Nenhuma notificação enviada.</p>
                ) : (
                  selectedCustomer.userNotifications.map((n) => (
                    <div key={n.id} className="border border-white/10 bg-[#100814] p-3 text-xs">
                      <div className="flex justify-between font-semibold text-[#fff7fb]">
                        <span>{n.title}</span>
                        <span className="font-mono-num text-[11px] text-[#8f7889]">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[#c6b1c0]">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {custDrawerTab === 'chamados' && (
              <div className="space-y-2">
                {!selectedCustomer.supportTickets || selectedCustomer.supportTickets.length === 0 ? (
                  <p className="text-xs text-[#8f7889]">Sem chamados abertos.</p>
                ) : (
                  selectedCustomer.supportTickets.map((tk) => (
                    <div key={tk.id} className="border border-white/10 bg-[#100814] p-3 text-xs">
                      <div className="flex justify-between font-semibold text-[#fff7fb]">
                        <span>{tk.subject}</span>
                        <span className={SUPPORT_STATUS_META[tk.status]?.toneClass}>
                          {SUPPORT_STATUS_META[tk.status]?.label || tk.status}
                        </span>
                      </div>
                      <p className="mt-1 text-[#8f7889]">
                        {tk.category} · {formatDateTime(tk.updatedAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {custDrawerTab === 'auditoria' && (
              <div className="space-y-2">
                {!selectedCustomer.auditHistory || selectedCustomer.auditHistory.length === 0 ? (
                  <p className="text-xs text-[#8f7889]">Sem eventos administrativos vinculados.</p>
                ) : (
                  selectedCustomer.auditHistory.map((a) => (
                    <div key={a.id} className="border border-white/10 bg-[#100814] p-3 text-xs">
                      <div className="flex justify-between text-[#fff7fb]">
                        <span className="font-semibold">{a.action}</span>
                        <span className="font-mono-num text-[11px] text-[#8f7889]">
                          {formatDateTime(a.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-[#c6b1c0]">Responsável: {a.adminName}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {newCustModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleCreateCustomer}
            className="max-h-[92vh] w-full max-w-md overflow-y-auto border border-white/15 bg-[#170d1c] p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                Cadastrar Novo Cliente
              </h2>
              <button
                type="button"
                onClick={() => setNewCustModal(false)}
                className="flex h-10 w-10 items-center justify-center border border-white/15 text-[#c6b1c0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="Nome completo"
              value={newCust.displayName}
              onChange={(e) => setNewCust({ ...newCust, displayName: e.target.value })}
              className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
            />
            <input
              type="email"
              required
              placeholder="E-mail"
              value={newCust.email}
              onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
              className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="tel"
                required
                placeholder="(41) 99999-9999"
                value={newCust.phone}
                onChange={(e) => setNewCust({ ...newCust, phone: maskPhoneInput(e.target.value) })}
                className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
              />
              <input
                type="date"
                required
                value={newCust.birthDate}
                onChange={(e) => setNewCust({ ...newCust, birthDate: e.target.value })}
                className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
              />
            </div>
            <input
              type="password"
              required
              placeholder="Senha inicial (mín. 6 caracteres)"
              value={newCust.password}
              onChange={(e) => setNewCust({ ...newCust, password: e.target.value })}
              className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
            />
            <textarea
              rows={2}
              placeholder="Observações administrativas (opcional)"
              value={newCust.adminNotes}
              onChange={(e) => setNewCust({ ...newCust, adminNotes: e.target.value })}
              className="w-full border border-white/15 bg-[#100814] p-2.5 text-xs text-[#fff7fb]"
            />
            <button
              type="submit"
              disabled={creatingCust}
              className="min-h-[48px] w-full bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-sm font-semibold text-white"
            >
              {creatingCust ? 'Cadastrando...' : 'Criar Conta do Cliente'}
            </button>
          </form>
        </div>
      )}

      {reviewPayment && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
        >
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/15 bg-[#170d1c] p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                  Conferir Pagamento
                </h2>
                <p className="text-xs text-[#c6b1c0]">
                  {reviewPayment.customerName} · {formatBrl(reviewPayment.amountCents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewPayment(null)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#c6b1c0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {reviewPayment.proofs && reviewPayment.proofs.length > 0 && (
              <div className="space-y-2">
                {reviewPayment.proofs.map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => setZoomProof(pr)}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[#f06aa9]/35 bg-[#100814] px-3 text-xs text-[#f06aa9]"
                  >
                    <span className="truncate">{pr.originalFilename}</span>
                    <span className="font-semibold">Ampliar</span>
                  </button>
                ))}
              </div>
            )}

            <textarea
              rows={3}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Observação ou motivo da decisão..."
              className="w-full rounded-xl border border-white/15 bg-[#100814] p-3 text-xs text-[#fff7fb]"
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled={reviewBusy}
                onClick={() => handleReviewPayment(reviewPayment.id, 'aprovado', reviewNotes)}
                className="min-h-[44px] rounded-xl bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-600"
              >
                Aprovar
              </button>
              <button
                type="button"
                disabled={reviewBusy}
                onClick={() => handleReviewPayment(reviewPayment.id, 'em_analise', reviewNotes)}
                className="min-h-[44px] rounded-xl border border-sky-400/40 bg-sky-950/30 text-xs font-semibold text-sky-200"
              >
                Em análise
              </button>
              <button
                type="button"
                disabled={reviewBusy}
                onClick={() => handleReviewPayment(reviewPayment.id, 'recusado', reviewNotes)}
                className="min-h-[44px] rounded-xl border border-red-400/40 bg-red-950/30 text-xs font-semibold text-red-200"
              >
                Recusar
              </button>
              <button
                type="button"
                disabled={reviewBusy}
                onClick={() => handleReviewPayment(reviewPayment.id, 'cancelado', reviewNotes)}
                className="min-h-[44px] rounded-xl border border-orange-400/40 bg-orange-950/30 text-xs font-semibold text-orange-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reviewBusy}
                onClick={() => handleReviewPayment(reviewPayment.id, 'reembolsado', reviewNotes)}
                className="col-span-2 sm:col-span-2 min-h-[44px] rounded-xl border border-purple-400/40 bg-purple-950/30 text-xs font-semibold text-purple-200"
              >
                Marcar como Reembolsado
              </button>
            </div>
          </div>
        </div>
      )}

      {manualModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleCreateManualPayment}
            className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-white/15 bg-[#170d1c] p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                Registrar Pagamento Manual
              </h2>
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#c6b1c0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <select
              required
              value={manualUserId}
              onChange={(e) => setManualUserId(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
            >
              <option value="">Selecione o cliente...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName} ({c.email})
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <select
                value={manualPlanKey}
                onChange={(e) => setManualPlanKey(e.target.value as PlanKey)}
                className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
              >
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
                <option value="vitalicio">Vitalício</option>
              </select>
              <select
                value={manualStatus}
                onChange={(e) => setManualStatus(e.target.value as PaymentStatus)}
                className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
              >
                <option value="aprovado">Aprovado (Libera VIP)</option>
                <option value="aguardando_analise">Aguardando análise</option>
                <option value="aguardando_pagamento">Aguardando pagamento</option>
                <option value="cancelado">Cancelado</option>
                <option value="reembolsado">Reembolsado</option>
              </select>
            </div>

            <textarea
              rows={2}
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Observação interna (ex: Pix confirmado direto)..."
              className="w-full rounded-xl border border-white/15 bg-[#100814] p-2.5 text-xs text-[#fff7fb]"
            />

            <button
              type="submit"
              disabled={manualBusy}
              className="min-h-[48px] w-full rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-sm font-semibold text-white"
            >
              <CreditCard className="inline h-4 w-4 mr-1.5" />
              {manualBusy ? 'Registrando...' : 'Salvar Lançamento'}
            </button>
          </form>
        </div>
      )}

      {extendTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleExtendSubscription}
            className="w-full max-w-sm border border-white/15 bg-[#170d1c] p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                Estender Assinatura
              </h2>
              <button
                type="button"
                onClick={() => setExtendTarget(null)}
                className="flex h-10 w-10 items-center justify-center border border-white/15 text-[#c6b1c0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-[#c6b1c0]">{extendTarget.customerName}</p>
            <div className="grid grid-cols-3 gap-2">
              {['7', '15', '30'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setExtendDays(d)}
                  className={`min-h-[42px] border text-xs font-semibold ${
                    extendDays === d
                      ? 'border-[#f06aa9] bg-[#2a1530] text-white'
                      : 'border-white/15 text-[#c6b1c0]'
                  }`}
                >
                  +{d} dias
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={365}
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 font-mono-num text-sm text-[#fff7fb]"
            />
            <button
              type="submit"
              className="min-h-[46px] w-full bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-xs font-semibold text-white"
            >
              Confirmar Extensão
            </button>
          </form>
        </div>
      )}
    </>
  );
};

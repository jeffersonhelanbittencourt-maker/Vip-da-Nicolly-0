import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  FileCheck2,
  Grid,
  Heart,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Moon,
  RefreshCw,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { apiRequest } from './api.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { ADMIN_MODULES, type AdminModuleKey } from './AdminShared.tsx';
import { AdminBusinessModules } from './AdminBusinessModules.tsx';
import { AdminGrowthModules } from './AdminGrowthModules.tsx';
import { AdminSystemModules } from './AdminSystemModules.tsx';
import type {
  AdminCustomerRow,
  AdminNotification,
  AdminOverviewData,
  AuditLogEntry,
  PaymentProof,
  PaymentRecord,
  SiteAppearanceConfig,
  SiteConfig,
  SystemControlsConfig,
  UserProfile,
  VipGroupRequest,
} from './types.ts';

interface AdminDashboardProps {
  currentUser: UserProfile;
  onExitToClient: () => void;
  onLogout: () => void;
  onAppearancePublished?: () => Promise<void> | void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

const BUSINESS_TABS = new Set<AdminModuleKey>([
  'overview',
  'customers',
  'payments',
  'proofs',
  'subscriptions',
  'vip-group',
  'plans',
  'finance',
  'reports',
]);

const GROWTH_TABS = new Set<AdminModuleKey>(['coupons', 'media', 'support']);

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onExitToClient,
  onLogout,
  onAppearancePublished,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [tab, setTab] = useState<AdminModuleKey>('overview');
  const [modulesSheetOpen, setModulesSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [overviewPeriod, setOverviewPeriod] = useState('30d');
  const [financeRange, setFinanceRange] = useState({ from: '', to: '', status: 'confirmed' });

  // Core states across all 21 modules
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [customers, setCustomers] = useState<AdminCustomerRow[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [subscriptionsList, setSubscriptionsList] = useState<any[]>([]);
  const [groupRequests, setGroupRequests] = useState<VipGroupRequest[]>([]);
  const [settings, setSettings] = useState<SiteConfig | null>(null);
  const [planHistory, setPlanHistory] = useState<any[]>([]);
  const [financeData, setFinanceData] = useState<any | null>(null);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [appearanceDraft, setAppearanceDraft] = useState<SiteAppearanceConfig | null>(null);
  const [controls, setControls] = useState<SystemControlsConfig | null>(null);
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [integrationsStatus, setIntegrationsStatus] = useState<any | null>(null);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);

  const loadFinance = useCallback(async (from: string, to: string, status = 'confirmed') => {
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (status) qs.set('status', status);
      const data = await apiRequest<any>(`/api/admin/finance?${qs.toString()}`);
      setFinanceData(data);
    } catch {
      // Permission-restricted admins may not access finance
    }
  }, []);

  const loadAllAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        ov,
        custRes,
        payRes,
        proofRes,
        subRes,
        grpRes,
        setRes,
        planHistRes,
        notifRes,
        appRes,
        admRes,
        secRes,
        audRes,
        intRes,
        diagRes,
      ] = await Promise.all([
        apiRequest<AdminOverviewData>(`/api/admin/overview?period=${overviewPeriod}`),
        apiRequest<{ customers: AdminCustomerRow[] }>('/api/admin/customers'),
        apiRequest<{ payments: PaymentRecord[] }>('/api/admin/payments'),
        apiRequest<{ proofs: PaymentProof[] }>('/api/admin/proofs'),
        apiRequest<{ subscriptions: any[] }>('/api/admin/subscriptions'),
        apiRequest<{ requests: VipGroupRequest[] }>('/api/admin/group-requests'),
        apiRequest<{ settings: SiteConfig }>('/api/admin/settings'),
        apiRequest<{ history: any[] }>('/api/admin/plans/history'),
        apiRequest<{ notifications: AdminNotification[] }>('/api/admin/notifications'),
        apiRequest<{ draft: SiteAppearanceConfig; controls: SystemControlsConfig }>(
          '/api/admin/appearance'
        ),
        apiRequest<{ admins: UserProfile[] }>('/api/admin/admins'),
        apiRequest<{ sessions: any[]; controls: SystemControlsConfig }>(
          '/api/admin/security/sessions'
        ),
        apiRequest<{ logs: AuditLogEntry[] }>('/api/admin/audit-logs'),
        apiRequest<any>('/api/admin/integrations/status'),
        apiRequest<any>('/api/admin/diagnostics'),
      ]);

      setOverview(ov);
      setCustomers(custRes.customers);
      setPayments(payRes.payments);
      setProofs(proofRes.proofs);
      setSubscriptionsList(subRes.subscriptions);
      setGroupRequests(grpRes.requests);
      setSettings(setRes.settings);
      setPlanHistory(planHistRes.history || []);
      setNotifications(notifRes.notifications);
      setAppearanceDraft(appRes.draft);
      setControls(secRes.controls || appRes.controls);
      setAdmins(admRes.admins);
      setSessions(secRes.sessions);
      setAuditLogs(audRes.logs);
      setIntegrationsStatus(intRes);
      setDiagnostics(diagRes);

      await loadFinance(financeRange.from, financeRange.to, financeRange.status);
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message || 'Erro ao carregar dados administrativos.' });
    } finally {
      setLoading(false);
    }
  }, [overviewPeriod, financeRange.from, financeRange.to, financeRange.status, loadFinance]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications]
  );
  const pendingProofsCount = useMemo(
    () =>
      proofs.filter((p) => p.status === 'aguardando_analise' || p.status === 'em_analise')
        .length,
    [proofs]
  );
  const pendingGroupCount = useMemo(
    () => groupRequests.filter((r) => r.status === 'pendente_whatsapp').length,
    [groupRequests]
  );

  const currentModuleDef = useMemo(
    () => ADMIN_MODULES.find((m) => m.key === tab) || ADMIN_MODULES[0],
    [tab]
  );

  const groupedModules = useMemo(() => {
    const groups: Array<{
      name: 'Gestão Diária' | 'Comercial & Acesso' | 'Personalização' | 'Sistema & Segurança';
      items: typeof ADMIN_MODULES;
    }> = [
      { name: 'Gestão Diária', items: [] },
      { name: 'Comercial & Acesso', items: [] },
      { name: 'Personalização', items: [] },
      { name: 'Sistema & Segurança', items: [] },
    ];
    for (const m of ADMIN_MODULES) {
      groups.find((g) => g.name === m.group)?.items.push(m);
    }
    return groups;
  }, []);

  function getBadgeCount(key: AdminModuleKey): number {
    if (key === 'proofs') return pendingProofsCount;
    if (key === 'vip-group') return pendingGroupCount;
    if (key === 'notifications') return unreadCount;
    if (key === 'support') return overview?.metrics?.openSupportTickets || 0;
    return 0;
  }

  function handleSelectTab(next: AdminModuleKey) {
    setTab(next);
    setModulesSheetOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen flex bg-[#0e0711] text-[#fff7fb]">
      {/* Desktop Sidebar (lg+) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between border-r border-white/10 bg-[#140a18]">
        <div className="overflow-y-auto">
          <div className="flex h-14 items-center gap-3 border-b border-white/10 px-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#f06aa9] to-[#c83c82] text-white">
              <Heart className="h-4 w-4 fill-current" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">
              VIP da Nicolly
            </span>
          </div>

          <div className="p-3 space-y-5">
            {groupedModules.map((grp) => (
              <div key={grp.name}>
                <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#8f7889]">
                  {grp.name}
                </p>
                <nav className="mt-1.5 space-y-0.5">
                  {grp.items.map((item) => {
                    const badge = getBadgeCount(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectTab(item.key)}
                        className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-xl px-2.5 text-xs font-medium transition-colors ${
                          tab === item.key
                            ? 'bg-[#2a1530] text-[#fff7fb]'
                            : 'text-[#c6b1c0] hover:bg-white/[0.03] hover:text-[#fff7fb]'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <span className={tab === item.key ? 'text-[#f06aa9]' : ''}>
                            {item.icon}
                          </span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        {badge > 0 && (
                          <span className="shrink-0 rounded-md bg-[#f06aa9] px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[#0e0711]">
                            {badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 p-3.5 space-y-2">
          <div className="px-1 pb-1">
            <p className="text-[11px] text-[#c6b1c0]">Admin conectado</p>
            <p className="text-sm font-semibold text-[#fff7fb]">{currentUser.displayName}</p>
          </div>
          <button
            type="button"
            onClick={onExitToClient}
            className="flex min-h-[40px] w-full items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-medium text-[#e8d9e4] hover:border-[#f06aa9]/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Área do Cliente
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-[40px] w-full items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-medium text-[#c6b1c0] hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact Sticky Top Header (52px on mobile) */}
        <header className="sticky top-0 z-20 flex h-[52px] items-center justify-between gap-2 border-b border-white/10 bg-[#0e0711]/95 px-3 backdrop-blur-md lg:h-14 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setModulesSheetOpen(true)}
              aria-label="Abrir todos os módulos"
              className="flex lg:hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-[#170d1c] text-[#f06aa9]"
            >
              <Grid className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#fff7fb]">
                {currentModuleDef.label}
              </p>
              <p className="hidden sm:block truncate text-[11px] text-[#c6b1c0]">
                {currentModuleDef.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton compact />

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={theme === 'dark' ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#170d1c] text-[#fff7fb]"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 text-[#f8b3d3]" /> : <Moon className="h-4 w-4 text-[#f06aa9]" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSelectTab('notifications')}
              aria-label="Abrir notificações"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#170d1c] text-[#fff7fb]"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-md bg-[#f06aa9] px-1 font-mono-num text-[10px] font-bold text-[#0e0711]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={loadAllAdminData}
              aria-label="Atualizar dados"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#170d1c] px-2.5 text-xs font-medium text-[#fff7fb]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </header>

        {/* Main Scrollable Workspace */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-3.5 pb-24 sm:p-6 lg:p-8 lg:pb-10 space-y-5">
          {banner && (
            <div
              role="status"
              className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs sm:text-sm ${
                banner.type === 'ok'
                  ? 'border-emerald-400/35 bg-emerald-950/35 text-emerald-200'
                  : 'border-red-400/35 bg-red-950/35 text-red-200'
              }`}
            >
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="shrink-0 text-xs opacity-75 hover:opacity-100"
              >
                Fechar
              </button>
            </div>
          )}

          {BUSINESS_TABS.has(tab) ? (
            <AdminBusinessModules
              tab={tab}
              setTab={handleSelectTab}
              setBanner={setBanner}
              reloadAll={loadAllAdminData}
              overview={overview}
              overviewPeriod={overviewPeriod}
              setOverviewPeriod={setOverviewPeriod}
              customers={customers}
              payments={payments}
              proofs={proofs}
              subscriptionsList={subscriptionsList}
              groupRequests={groupRequests}
              settings={settings}
              planHistory={planHistory}
              financeData={financeData}
              financeRange={financeRange}
              setFinanceRange={setFinanceRange}
              onRefreshFinance={loadFinance}
            />
          ) : GROWTH_TABS.has(tab) ? (
            <AdminGrowthModules
              tab={tab}
              setBanner={setBanner}
              reloadAll={loadAllAdminData}
              onAppearancePublished={onAppearancePublished}
              settings={settings}
            />
          ) : (
            <AdminSystemModules
              tab={tab}
              setTab={handleSelectTab}
              setBanner={setBanner}
              reloadAll={loadAllAdminData}
              onAppearancePublished={onAppearancePublished}
              currentUser={currentUser}
              notifications={notifications}
              settings={settings}
              appearanceDraft={appearanceDraft}
              controls={controls}
              admins={admins}
              sessions={sessions}
              auditLogs={auditLogs}
              integrationsStatus={integrationsStatus}
              diagnostics={diagnostics}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Thumb-Zone Bottom Bar (56px, Samsung Android optimized) */}
      <nav
        aria-label="Menu rápido administrativo"
        className="fixed bottom-0 left-0 right-0 z-30 grid h-14 grid-cols-5 border-t border-white/15 bg-[#120816]/95 backdrop-blur-md lg:hidden"
      >
        {(
          [
            { key: 'overview' as AdminModuleKey, label: 'Início', icon: <LayoutDashboard className="h-4 w-4" /> },
            { key: 'customers' as AdminModuleKey, label: 'Clientes', icon: <Users className="h-4 w-4" /> },
            {
              key: 'proofs' as AdminModuleKey,
              label: 'Provas',
              badge: pendingProofsCount,
              icon: <FileCheck2 className="h-4 w-4" />,
            },
            {
              key: 'vip-group' as AdminModuleKey,
              label: 'VIP',
              badge: pendingGroupCount,
              icon: <MessageCircle className="h-4 w-4" />,
            },
          ] as Array<{
            key: AdminModuleKey;
            label: string;
            badge?: number;
            icon: React.ReactNode;
          }>
        ).map((item) => {
          const active = tab === item.key && !modulesSheetOpen;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleSelectTab(item.key)}
              className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? 'text-[#f06aa9]' : 'text-[#c6b1c0]'
              }`}
            >
              <span className="relative">
                {item.icon}
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-3.5 min-w-[14px] items-center justify-center bg-[#f06aa9] px-0.5 font-mono-num text-[9px] font-bold text-[#0e0711]">
                    {item.badge}
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setModulesSheetOpen((v) => !v)}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
            modulesSheetOpen ? 'text-[#f06aa9]' : 'text-[#fff7fb]'
          }`}
        >
          <Grid className="h-4 w-4" />
          <span>Módulos</span>
        </button>
      </nav>

      {/* Mobile All-21 Modules Launcher Sheet */}
      {modulesSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex flex-col bg-[#0e0711] lg:hidden"
        >
          <div className="flex h-14 items-center justify-between border-b border-white/15 bg-[#140a18] px-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#f06aa9] to-[#c83c82] text-white">
                <Heart className="h-3.5 w-3.5 fill-current" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#fff7fb]">Todos os Módulos (21)</p>
                <p className="text-[11px] text-[#c6b1c0]">Admin: {currentUser.displayName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setModulesSheetOpen(false)}
              aria-label="Fechar módulos"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#2a1530] text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pb-8 space-y-6">
            {groupedModules.map((grp) => (
              <section key={grp.name}>
                <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#f06aa9]">
                  {grp.name}
                </h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {grp.items.map((item) => {
                    const badge = getBadgeCount(item.key);
                    const active = tab === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectTab(item.key)}
                        className={`flex min-h-[68px] flex-col justify-between rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-[#f06aa9] bg-[#2a1530]'
                            : 'border-white/10 bg-[#170d1c]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={active ? 'text-[#f06aa9]' : 'text-[#d9c7d4]'}>
                            {item.icon}
                          </span>
                          {badge > 0 && (
                            <span className="rounded-md bg-[#f06aa9] px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[#0e0711]">
                              {badge}
                            </span>
                          )}
                        </div>
                        <span className="mt-2 text-xs font-semibold text-[#fff7fb]">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onExitToClient}
                className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/15 text-xs font-medium text-[#fff7fb]"
              >
                <ArrowLeft className="h-4 w-4" />
                Área do Cliente
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-red-400/35 bg-red-950/25 text-xs font-semibold text-red-200"
              >
                <LogOut className="h-4 w-4" />
                Sair do Painel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

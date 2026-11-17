import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  Check,
  CheckCheck,
  Copy,
  Download,
  Eye,
  KeyRound,
  Palette,
  Plug,
  RefreshCw,
  RotateCcw,
  Shield,
  Trash2,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { apiRequest, formatDateTime } from './api.ts';
import { useOnlineStatus, usePWAInstall } from './usePWAInstall.ts';
import type {
  AdminNotification,
  AdminPermissions,
  AuditLogEntry,
  CommunicationTemplate,
  SiteAppearanceConfig,
  SiteConfig,
  SystemControlsConfig,
  UserProfile,
} from './types.ts';
import { AdminModuleKey, ConfirmDialog } from './AdminShared.tsx';

export interface AdminSystemProps {
  tab: AdminModuleKey;
  setTab: (t: AdminModuleKey) => void;
  setBanner: (b: { type: 'ok' | 'err'; text: string } | null) => void;
  reloadAll: () => Promise<void>;
  onAppearancePublished?: () => Promise<void> | void;
  currentUser: UserProfile;
  notifications: AdminNotification[];
  settings: SiteConfig | null;
  appearanceDraft: SiteAppearanceConfig | null;
  controls: SystemControlsConfig | null;
  admins: UserProfile[];
  sessions: Array<{
    id: string;
    userId: string;
    displayName: string;
    email: string;
    username: string | null;
    role: string;
    isCurrent: boolean;
    createdAt: string;
    expiresAt: string;
  }>;
  auditLogs: AuditLogEntry[];
  integrationsStatus: {
    mercadoPago: {
      configured: boolean;
      tokenMasked: string;
      webhookSecretConfigured: boolean;
      webhookUrl: string;
      lastEventAt?: string | null;
      lastStatus?: string;
      lastMessage?: string;
      lastErrorAt?: string | null;
      lastErrorMessage?: string | null;
    };
    supabase: {
      configured: boolean;
      url: string;
      storageMode: string;
      bucketName: string;
      lastEventAt?: string | null;
      lastStatus?: string;
      lastMessage?: string;
      lastErrorAt?: string | null;
      lastErrorMessage?: string | null;
    };
  } | null;
  diagnostics: {
    checkedAt: string;
    checks: Array<{ key: string; label: string; status: string; detail: string }>;
  } | null;
}

export const AdminSystemModules: React.FC<AdminSystemProps> = ({
  tab,
  setTab,
  setBanner,
  reloadAll,
  onAppearancePublished,
  currentUser,
  notifications,
  settings,
  appearanceDraft,
  controls,
  admins,
  sessions,
  auditLogs,
  integrationsStatus,
  diagnostics,
}) => {
  const isOnline = useOnlineStatus();
  const { isInstalled } = usePWAInstall();

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Notifications & Communication Templates
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  const [notifSubTab, setNotifSubTab] = useState<'alerts' | 'templates' | 'logs'>('alerts');
  const [commTemplates, setCommTemplates] = useState<CommunicationTemplate[]>([]);
  const [commLogs, setCommLogs] = useState<any[]>([]);
  const [savingTemplates, setSavingTemplates] = useState(false);

  useEffect(() => {
    if (tab === 'notifications') {
      apiRequest<{ templates: CommunicationTemplate[]; logs: any[] }>(
        '/api/admin/communication/templates'
      )
        .then((res) => {
          setCommTemplates(res.templates || []);
          setCommLogs(res.logs || []);
        })
        .catch(() => {});
    }
  }, [tab]);

  // Site settings & Support state
  const [heroInput, setHeroInput] = useState(settings?.hero || '');
  const [groupInviteInput, setGroupInviteInput] = useState(settings?.vipGroupInvite || '');
  const [waInput, setWaInput] = useState(settings?.whatsapp || '');
  const [waLabelInput, setWaLabelInput] = useState(settings?.whatsappLabel || '');
  const [msgInput, setMsgInput] = useState(settings?.mensagem || '');
  const [savingSettings, setSavingSettings] = useState(false);

  // Appearance draft form
  const [appDraft, setAppDraft] = useState<SiteAppearanceConfig | null>(appearanceDraft);
  const [savingApp, setSavingApp] = useState(false);
  const [showPreviewCard, setShowPreviewCard] = useState(true);

  // Admins state
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminUser, setNewAdminUser] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPassValue, setResetPassValue] = useState('');
  const [resetPassBusy, setResetPassBusy] = useState(false);
  const [currPass, setCurrPass] = useState('');
  const [nextPass, setNextPass] = useState('');

  // Controls state
  const [ctrlDraft, setCtrlDraft] = useState<SystemControlsConfig | null>(controls);
  const [savingControls, setSavingControls] = useState(false);

  // Audit filter
  const [auditQuery, setAuditQuery] = useState('');

  // Integrations test state
  const [testingIntegrations, setTestingIntegrations] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }> | null>(
    null
  );

  useEffect(() => {
    if (settings) {
      setHeroInput(settings.hero);
      setGroupInviteInput(settings.vipGroupInvite || '');
      setWaInput(settings.whatsapp);
      setWaLabelInput(settings.whatsappLabel);
      setMsgInput(settings.mensagem);
    }
  }, [settings]);

  useEffect(() => {
    if (appearanceDraft) setAppDraft(appearanceDraft);
  }, [appearanceDraft]);

  useEffect(() => {
    if (controls) setCtrlDraft(controls);
  }, [controls]);

  async function runConfirmed(action: () => Promise<void>) {
    setConfirmBusy(true);
    try {
      await action();
      setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleSaveSiteOrSupport(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          hero: heroInput,
          vipGroupInvite: groupInviteInput,
          whatsapp: waInput,
          whatsappLabel: waLabelInput,
          mensagem: msgInput,
        }),
      });
      setBanner({ type: 'ok', text: 'Configurações salvas no servidor com segurança.' });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveAppearanceDraft() {
    if (!appDraft) return;
    setSavingApp(true);
    try {
      await apiRequest('/api/admin/appearance/draft', {
        method: 'PUT',
        body: JSON.stringify({ appearance: appDraft }),
      });
      setBanner({ type: 'ok', text: 'Rascunho de aparência salvo.' });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setSavingApp(false);
    }
  }

  async function handlePublishAppearance() {
    if (!appDraft) return;
    setSavingApp(true);
    try {
      await apiRequest('/api/admin/appearance/publish', {
        method: 'POST',
        body: JSON.stringify({ appearance: appDraft }),
      });
      setBanner({ type: 'ok', text: 'Aparência publicada ao vivo no site!' });
      await reloadAll();
      if (onAppearancePublished) await onAppearancePublished();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setSavingApp(false);
    }
  }

  async function handleSaveControls(next?: SystemControlsConfig) {
    const payload = next || ctrlDraft;
    if (!payload) return;
    setSavingControls(true);
    try {
      await apiRequest('/api/admin/security/controls', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setBanner({ type: 'ok', text: 'Controles de segurança e notificações atualizados.' });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setSavingControls(false);
    }
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          displayName: newAdminName,
          username: newAdminUser,
          email: newAdminEmail,
          password: newAdminPass,
        }),
      });
      setNewAdminName('');
      setNewAdminUser('');
      setNewAdminEmail('');
      setNewAdminPass('');
      setBanner({ type: 'ok', text: 'Administrador adicionado com sucesso.' });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  }

  async function handleTogglePermission(adm: UserProfile, key: keyof AdminPermissions) {
    const base: AdminPermissions = adm.permissions || {
      canManageClients: true,
      canManageFinance: true,
      canManageSettings: true,
      canManageAdmins: true,
    };
    const next = { ...base, [key]: !base[key] };
    try {
      await apiRequest(`/api/admin/admins/${adm.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: next }),
      });
      setBanner({ type: 'ok', text: `Permissões de ${adm.displayName} atualizadas.` });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  }

  async function handleResetAdminPassword(adminId: string) {
    if (resetPassValue.length < 6) {
      setBanner({ type: 'err', text: 'A nova senha deve possuir no mínimo 6 caracteres.' });
      return;
    }
    setResetPassBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>(
        `/api/admin/admins/${adminId}/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({ newPassword: resetPassValue }),
        }
      );
      setBanner({ type: 'ok', text: res.message || 'Senha redefinida com sucesso.' });
      setResetTargetId(null);
      setResetPassValue('');
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setResetPassBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: currPass, newPassword: nextPass }),
      });
      setCurrPass('');
      setNextPass('');
      setBanner({ type: 'ok', text: 'Sua senha foi atualizada com segurança.' });
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  }

  async function handleTestIntegrations(target: 'all' | 'mercadopago' | 'supabase') {
    setTestingIntegrations(true);
    try {
      const res = await apiRequest<{ results: Record<string, { ok: boolean; message: string }> }>(
        '/api/admin/integrations/test',
        { method: 'POST', body: JSON.stringify({ target }) }
      );
      setTestResults(res.results);
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setTestingIntegrations(false);
    }
  }

  async function handleSaveCommunicationTemplates() {
    setSavingTemplates(true);
    try {
      const res = await apiRequest<{ ok: boolean; templates: CommunicationTemplate[] }>(
        '/api/admin/communication/templates',
        {
          method: 'PUT',
          body: JSON.stringify({ templates: commTemplates }),
        }
      );
      setCommTemplates(res.templates || commTemplates);
      setBanner({
        type: 'ok',
        text: 'Régua automática e modelos de comunicação atualizados com sucesso.',
      });
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message || 'Erro ao salvar modelos.' });
    } finally {
      setSavingTemplates(false);
    }
  }

  return (
    <>
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

      {/* ================= 10. NOTIFICAÇÕES & RÉGUA DE COMUNICAÇÃO ================= */}
      {tab === 'notifications' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 border border-white/10 bg-[#170d1c] p-3">
            <button
              type="button"
              onClick={() => setNotifSubTab('alerts')}
              className={`min-h-[42px] px-4 text-xs font-semibold border transition-colors ${
                notifSubTab === 'alerts'
                  ? 'border-[#f06aa9] bg-[#2a1530] text-white'
                  : 'border-white/15 text-[#c6b1c0]'
              }`}
            >
              Alertas Internos ({notifications.filter((n) => !n.readAt).length} não lidas)
            </button>
            <button
              type="button"
              onClick={() => setNotifSubTab('templates')}
              className={`min-h-[42px] px-4 text-xs font-semibold border transition-colors ${
                notifSubTab === 'templates'
                  ? 'border-[#f06aa9] bg-[#2a1530] text-white'
                  : 'border-white/15 text-[#c6b1c0]'
              }`}
            >
              Modelos Automáticos ({commTemplates.length})
            </button>
            <button
              type="button"
              onClick={() => setNotifSubTab('logs')}
              className={`min-h-[42px] px-4 text-xs font-semibold border transition-colors ${
                notifSubTab === 'logs'
                  ? 'border-[#f06aa9] bg-[#2a1530] text-white'
                  : 'border-white/15 text-[#c6b1c0]'
              }`}
            >
              Histórico de Envios ({commLogs.length})
            </button>
          </div>

          {notifSubTab === 'alerts' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-[#170d1c] p-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifFilter('all')}
                    className={`min-h-[40px] px-3.5 text-xs font-medium border ${
                      notifFilter === 'all'
                        ? 'border-[#f06aa9] bg-[#2a1530] text-white'
                        : 'border-white/15 text-[#c6b1c0]'
                    }`}
                  >
                    Todas ({notifications.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifFilter('unread')}
                    className={`min-h-[40px] px-3.5 text-xs font-medium border ${
                      notifFilter === 'unread'
                        ? 'border-[#f06aa9] bg-[#2a1530] text-white'
                        : 'border-white/15 text-[#c6b1c0]'
                    }`}
                  >
                    Não lidas ({notifications.filter((n) => !n.readAt).length})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest('/api/admin/notifications/read-all', { method: 'POST' });
                    await reloadAll();
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 border border-white/15 px-3 text-xs text-[#fff7fb]"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-[#f06aa9]" />
                  Marcar todas como lidas
                </button>
              </div>

              <div className="space-y-2.5">
                {notifications
                  .filter((n) => (notifFilter === 'unread' ? !n.readAt : true))
                  .map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={async () => {
                        if (!n.readAt) {
                          await apiRequest(`/api/admin/notifications/${n.id}/read`, { method: 'PATCH' });
                        }
                        await reloadAll();
                        setTab((n.targetTab || 'overview') as AdminModuleKey);
                      }}
                      className={`w-full text-left border p-4 transition-colors ${
                        n.readAt
                          ? 'border-white/10 bg-[#170d1c] text-[#c6b1c0]'
                          : 'border-[#f06aa9]/45 bg-[#221029] text-[#fff7fb]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Bell className={`h-4 w-4 ${n.readAt ? 'text-[#8f7889]' : 'text-[#f06aa9]'}`} />
                          <span className="text-sm font-semibold">{n.title}</span>
                        </div>
                        <span className="shrink-0 font-mono-num text-[11px] text-[#8f7889]">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-[#d9c7d4]">{n.message}</p>
                    </button>
                  ))}
                {notifications.length === 0 && (
                  <div className="border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
                    Nenhuma notificação registrada ainda.
                  </div>
                )}
              </div>
            </>
          )}

          {notifSubTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-[#170d1c] p-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                    Régua Automática de Comunicação
                  </h2>
                  <p className="mt-0.5 text-xs text-[#c6b1c0]">
                    Dispara avisos reais no sino da Área do Cliente e registra eventos prontos para e-mail. Use{' '}
                    <code className="font-mono-num text-[#f8b3d3]">{'{{nome}}'}</code>,{' '}
                    <code className="font-mono-num text-[#f8b3d3]">{'{{plano}}'}</code>,{' '}
                    <code className="font-mono-num text-[#f8b3d3]">{'{{dias}}'}</code> e{' '}
                    <code className="font-mono-num text-[#f8b3d3]">{'{{referencia}}'}</code>.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingTemplates}
                  onClick={handleSaveCommunicationTemplates}
                  className="inline-flex min-h-[44px] items-center gap-2 bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  {savingTemplates ? 'Salvando...' : 'Salvar Modelos'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {commTemplates.map((tpl, idx) => (
                  <div key={tpl.key} className="border border-white/10 bg-[#170d1c] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#fff7fb]">{tpl.label}</p>
                        <p className="mt-0.5 text-[11px] text-[#c6b1c0]">{tpl.description}</p>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs text-[#e8d9e4] cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={tpl.enabled}
                          onChange={(e) => {
                            const next = [...commTemplates];
                            next[idx] = { ...tpl, enabled: e.target.checked };
                            setCommTemplates(next);
                          }}
                          className="h-4 w-4 accent-[#f06aa9]"
                        />
                        Ativo
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] text-[#c6b1c0]">Canal</label>
                        <select
                          value={tpl.channel}
                          onChange={(e) => {
                            const next = [...commTemplates];
                            next[idx] = {
                              ...tpl,
                              channel: e.target.value as CommunicationTemplate['channel'],
                            };
                            setCommTemplates(next);
                          }}
                          className="mt-1 min-h-[40px] w-full border border-white/15 bg-[#100814] px-2.5 text-xs text-[#fff7fb]"
                        >
                          <option value="in_app">Notificação no Portal</option>
                          <option value="in_app_and_email_ready">Portal + Log p/ E-mail</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#c6b1c0]">Título / Assunto</label>
                        <input
                          type="text"
                          value={tpl.subject}
                          onChange={(e) => {
                            const next = [...commTemplates];
                            next[idx] = { ...tpl, subject: e.target.value };
                            setCommTemplates(next);
                          }}
                          className="mt-1 min-h-[40px] w-full border border-white/15 bg-[#100814] px-2.5 text-xs text-[#fff7fb]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#c6b1c0]">Mensagem enviada</label>
                      <textarea
                        rows={2}
                        value={tpl.bodyTemplate}
                        onChange={(e) => {
                          const next = [...commTemplates];
                          next[idx] = { ...tpl, bodyTemplate: e.target.value };
                          setCommTemplates(next);
                        }}
                        className="mt-1 w-full border border-white/15 bg-[#100814] p-2.5 text-xs text-[#fff7fb]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {notifSubTab === 'logs' && (
            <div className="space-y-2.5">
              {commLogs.map((log) => (
                <div key={log.id} className="border border-white/10 bg-[#170d1c] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-[#fff7fb]">
                        {log.customerName}
                      </span>
                      <span className="ml-2 text-[11px] text-[#8f7889]">{log.customerEmail}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#f8b3d3]">
                        {log.eventKey}
                      </span>
                      <span className="font-mono-num text-[11px] text-[#8f7889]">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-[#e8d9e4]">{log.title}</p>
                  <p className="mt-0.5 text-xs text-[#c6b1c0]">{log.message}</p>
                </div>
              ))}
              {commLogs.length === 0 && (
                <div className="border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
                  Nenhum disparo de comunicação registrado ainda.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= 11. CONFIGURAÇÕES DO SITE ================= */}
      {tab === 'site-settings' && (
        <form onSubmit={handleSaveSiteOrSupport} className="space-y-5 max-w-2xl">
          <section className="border border-white/10 bg-[#170d1c] p-5 space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
              Configurações Gerais & Link Privado
            </h2>

            <div>
              <label className="block text-xs font-medium text-[#e8d9e4]">
                Mensagem de Boas-vindas (Área Autenticada)
              </label>
              <textarea
                rows={3}
                value={heroInput}
                onChange={(e) => setHeroInput(e.target.value)}
                className="mt-1.5 w-full border border-white/15 bg-[#100814] p-3 text-sm text-[#fff7fb]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#e8d9e4]">
                Link Privado do Grupo VIP (Armazenado exclusivamente no servidor)
              </label>
              <input
                type="url"
                value={groupInviteInput}
                onChange={(e) => setGroupInviteInput(e.target.value)}
                placeholder="https://chat.whatsapp.com/... ou https://t.me/+..."
                className="mt-1.5 min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
              />
              <p className="mt-1.5 text-[11px] text-[#c6b1c0]">
                Protegido no backend: este link nunca é enviado ao navegador do cliente. O
                ingresso acontece via validação pela Nicolly no WhatsApp.
              </p>
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 text-sm font-semibold text-white"
            >
              <Check className="h-4 w-4" />
              {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </section>
        </form>
      )}

      {/* ================= 12. APARÊNCIA DO SITE ================= */}
      {tab === 'appearance' && appDraft && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#170d1c] p-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                Editor Visual & Textos do Site
              </h2>
              <p className="text-xs text-[#c6b1c0]">
                Salve um rascunho e visualize a prévia antes de publicar ao vivo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPreviewCard((v) => !v)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 px-3 text-xs text-[#fff7fb]"
            >
              <Eye className="h-3.5 w-3.5 text-[#f06aa9]" />
              {showPreviewCard ? 'Ocultar Prévia' : 'Ver Prévia'}
            </button>
          </div>

          {showPreviewCard && (
            <div
              style={{
                backgroundColor: appDraft.backgroundColor,
                borderColor: appDraft.primaryColor,
              }}
              className="rounded-2xl border p-5 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    style={{ backgroundColor: appDraft.faviconColor || appDraft.primaryColor }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
                  >
                    ♥
                  </span>
                  <span className="font-display text-lg font-semibold text-white">
                    {appDraft.logoText}
                  </span>
                </div>
                <span
                  style={{ backgroundColor: appDraft.primaryColor }}
                  className="rounded-md px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  Prévia ao Vivo
                </span>
              </div>
              {appDraft.showOfferBanner && appDraft.offerBannerText && (
                <div
                  style={{ borderColor: appDraft.primaryColor }}
                  className="rounded-xl border bg-black/30 px-3 py-2 text-xs text-white"
                >
                  {appDraft.offerBannerText}
                </div>
              )}
              <div className="space-y-1.5">
                <p className="font-display text-xl text-white">{appDraft.heroTitle}</p>
                <p className="text-xs text-neutral-300">{appDraft.heroSubtitle}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <span
                  style={{
                    backgroundImage: `linear-gradient(to right, ${appDraft.primaryColor}, ${appDraft.secondaryColor})`,
                  }}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  {appDraft.loginButtonLabel || 'Entrar na minha conta'}
                </span>
                <span className="rounded-lg border border-white/20 px-3 py-1.5 text-[11px] font-medium text-white">
                  {appDraft.registerButtonLabel || 'Criar minha conta'}
                </span>
                <span className="rounded-lg border border-[#f06aa9]/40 px-3 py-1.5 text-[11px] font-medium text-[#f8b3d3]">
                  {appDraft.vipGroupButtonLabel || 'ACESSAR GRUPO VIP'}
                </span>
              </div>
              <div className="border-t border-white/10 pt-2.5 text-[11px] text-neutral-300">
                <strong>{appDraft.supportTitle || 'Atendimento Oficial'}</strong> ·{' '}
                {appDraft.supportHours || 'Atendimento diário via WhatsApp'}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#fff7fb]">
                <Palette className="h-4 w-4 text-[#f06aa9]" />
                Identidade, Cores & Imagens
              </h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Nome do site</label>
                  <input
                    type="text"
                    value={appDraft.siteName}
                    onChange={(e) => setAppDraft({ ...appDraft, siteName: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Texto do logotipo</label>
                  <input
                    type="text"
                    value={appDraft.logoText}
                    onChange={(e) => setAppDraft({ ...appDraft, logoText: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-[11px] text-[#c6b1c0]">Cor principal</label>
                  <input
                    type="color"
                    value={appDraft.primaryColor}
                    onChange={(e) => setAppDraft({ ...appDraft, primaryColor: e.target.value })}
                    className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-[#100814] p-1"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#c6b1c0]">Cor secundária</label>
                  <input
                    type="color"
                    value={appDraft.secondaryColor}
                    onChange={(e) => setAppDraft({ ...appDraft, secondaryColor: e.target.value })}
                    className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-[#100814] p-1"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#c6b1c0]">Fundo</label>
                  <input
                    type="color"
                    value={appDraft.backgroundColor}
                    onChange={(e) => setAppDraft({ ...appDraft, backgroundColor: e.target.value })}
                    className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-[#100814] p-1"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#c6b1c0]">Cor do Favicon</label>
                  <input
                    type="color"
                    value={appDraft.faviconColor || appDraft.primaryColor}
                    onChange={(e) => setAppDraft({ ...appDraft, faviconColor: e.target.value })}
                    className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-white/15 bg-[#100814] p-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Imagem principal (Hero / URL)</label>
                  <input
                    type="text"
                    value={appDraft.heroImageUrl || ''}
                    onChange={(e) => setAppDraft({ ...appDraft, heroImageUrl: e.target.value })}
                    placeholder="/src/assets/images/vip_hero_editorial_1794936333061.jpg"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Banner Área VIP (URL)</label>
                  <input
                    type="text"
                    value={appDraft.vipBannerUrl || ''}
                    onChange={(e) => setAppDraft({ ...appDraft, vipBannerUrl: e.target.value })}
                    placeholder="/src/assets/images/vip_lounge_banner_1794936334758.jpg"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[#e8d9e4]">
                  <input
                    type="checkbox"
                    checked={appDraft.showOfferBanner}
                    onChange={(e) =>
                      setAppDraft({ ...appDraft, showOfferBanner: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#f06aa9]"
                  />
                  Exibir banner/aviso de destaque no topo do site
                </label>
                <input
                  type="text"
                  value={appDraft.offerBannerText}
                  onChange={(e) => setAppDraft({ ...appDraft, offerBannerText: e.target.value })}
                  placeholder="Ex: Condição especial no plano mensal esta semana..."
                  className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />
              </div>

              <div>
                <label className="block text-xs text-[#c6b1c0]">Texto do rodapé</label>
                <input
                  type="text"
                  value={appDraft.footerText}
                  onChange={(e) => setAppDraft({ ...appDraft, footerText: e.target.value })}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#fff7fb]">
                Textos das Telas, Botões & Suporte
              </h3>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Título tela inicial</label>
                <input
                  type="text"
                  value={appDraft.heroTitle}
                  onChange={(e) => setAppDraft({ ...appDraft, heroTitle: e.target.value })}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Subtítulo tela inicial</label>
                <textarea
                  rows={2}
                  value={appDraft.heroSubtitle}
                  onChange={(e) => setAppDraft({ ...appDraft, heroSubtitle: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-[#100814] p-2.5 text-xs text-[#fff7fb]"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Botão Login</label>
                  <input
                    type="text"
                    value={appDraft.loginButtonLabel || ''}
                    onChange={(e) =>
                      setAppDraft({ ...appDraft, loginButtonLabel: e.target.value })
                    }
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Botão Cadastro</label>
                  <input
                    type="text"
                    value={appDraft.registerButtonLabel || ''}
                    onChange={(e) =>
                      setAppDraft({ ...appDraft, registerButtonLabel: e.target.value })
                    }
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Botão Grupo VIP</label>
                  <input
                    type="text"
                    value={appDraft.vipGroupButtonLabel || ''}
                    onChange={(e) =>
                      setAppDraft({ ...appDraft, vipGroupButtonLabel: e.target.value })
                    }
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Título Área VIP</label>
                <input
                  type="text"
                  value={appDraft.vipTitle}
                  onChange={(e) => setAppDraft({ ...appDraft, vipTitle: e.target.value })}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Descrição Área VIP</label>
                <textarea
                  rows={2}
                  value={appDraft.vipDescription}
                  onChange={(e) => setAppDraft({ ...appDraft, vipDescription: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-[#100814] p-2.5 text-xs text-[#fff7fb]"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Aviso acesso aprovado</label>
                  <input
                    type="text"
                    value={appDraft.approvedMessage}
                    onChange={(e) => setAppDraft({ ...appDraft, approvedMessage: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Aviso assinatura vencida</label>
                  <input
                    type="text"
                    value={appDraft.expiredMessage}
                    onChange={(e) => setAppDraft({ ...appDraft, expiredMessage: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-white/10 pt-3">
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Título seção suporte</label>
                  <input
                    type="text"
                    value={appDraft.supportTitle || ''}
                    onChange={(e) => setAppDraft({ ...appDraft, supportTitle: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#c6b1c0]">Horário atendimento</label>
                  <input
                    type="text"
                    value={appDraft.supportHours || ''}
                    onChange={(e) => setAppDraft({ ...appDraft, supportHours: e.target.value })}
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[#c6b1c0]">Descrição suporte</label>
                  <input
                    type="text"
                    value={appDraft.supportDescription || ''}
                    onChange={(e) =>
                      setAppDraft({ ...appDraft, supportDescription: e.target.value })
                    }
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="block text-xs text-[#c6b1c0]">
                Termos de Uso personalizado (deixe vazio para usar padrão LGPD)
              </label>
              <textarea
                rows={4}
                value={appDraft.termsText}
                onChange={(e) => setAppDraft({ ...appDraft, termsText: e.target.value })}
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#100814] p-2.5 text-xs text-[#fff7fb]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#c6b1c0]">
                Política de Privacidade personalizada (deixe vazio para usar padrão)
              </label>
              <textarea
                rows={4}
                value={appDraft.privacyText}
                onChange={(e) => setAppDraft({ ...appDraft, privacyText: e.target.value })}
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#100814] p-2.5 text-xs text-[#fff7fb]"
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={savingApp}
              onClick={handleSaveAppearanceDraft}
              className="min-h-[48px] rounded-xl border border-white/15 bg-[#170d1c] px-5 text-sm font-medium text-[#fff7fb]"
            >
              Salvar Rascunho
            </button>
            <button
              type="button"
              disabled={savingApp}
              onClick={() =>
                setConfirmState({
                  open: true,
                  title: 'Publicar aparência ao vivo?',
                  message:
                    'As cores, textos e banners configurados passarão a aparecer imediatamente para todos os usuários.',
                  confirmLabel: 'Publicar Agora',
                  onConfirm: handlePublishAppearance,
                })
              }
              className="min-h-[48px] rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-5 text-sm font-semibold text-white"
            >
              {savingApp ? 'Publicando...' : 'Publicar Alterações no Site'}
            </button>
          </div>
        </div>
      )}

      {/* ================= 13. ADMINISTRADORES ================= */}
      {tab === 'admins' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 lg:col-span-7 space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
              Administradores & Permissões
            </h2>
            <div className="space-y-4">
              {admins.map((adm) => {
                const perms = adm.permissions || {
                  canManageClients: true,
                  canManageFinance: true,
                  canManageSettings: true,
                  canManageAdmins: true,
                };
                const recentAdminLogs = auditLogs
                  .filter((l) => l.adminId === adm.id || l.adminName === adm.displayName)
                  .slice(0, 3);
                const isResetOpen = resetTargetId === adm.id;

                return (
                  <article
                    key={adm.id}
                    className="rounded-2xl border border-white/10 bg-[#100814] p-4 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[#fff7fb]">
                            {adm.displayName}{' '}
                            {adm.id === currentUser.id && (
                              <span className="text-xs text-[#f06aa9]">(Você)</span>
                            )}
                          </p>
                          <span
                            className={`text-[11px] font-semibold ${
                              adm.suspended ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          >
                            {adm.suspended ? '· Desativado' : '· Ativo'}
                          </span>
                        </div>
                        <p className="text-xs text-[#c6b1c0]">
                          @{adm.username} · {adm.email}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#8f7889]">
                          Último acesso: {formatDateTime(adm.lastLoginAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setResetTargetId(isResetOpen ? null : adm.id);
                            setResetPassValue('');
                          }}
                          className="min-h-[38px] rounded-xl border border-white/15 px-3 text-xs font-medium text-[#e8d9e4] hover:border-[#f06aa9]/60"
                        >
                          Redefinir senha
                        </button>

                        {adm.id !== currentUser.id && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmState({
                                  open: true,
                                  title: adm.suspended
                                    ? 'Reativar administrador?'
                                    : 'Desativar administrador?',
                                  message: adm.suspended
                                    ? `Reativar acesso de ${adm.displayName} ao painel administrativo?`
                                    : `Desativar ${adm.displayName}? As sessões ativas serão encerradas imediatamente.`,
                                  confirmLabel: adm.suspended ? 'Reativar' : 'Desativar',
                                  danger: !adm.suspended,
                                  onConfirm: async () => {
                                    await apiRequest(`/api/admin/admins/${adm.id}/suspend`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ suspended: !adm.suspended }),
                                    });
                                    setBanner({
                                      type: 'ok',
                                      text: adm.suspended
                                        ? 'Administrador reativado.'
                                        : 'Administrador desativado.',
                                    });
                                    await reloadAll();
                                  },
                                })
                              }
                              className={`min-h-[38px] rounded-xl border px-3 text-xs font-medium ${
                                adm.suspended
                                  ? 'border-emerald-400/40 text-emerald-300'
                                  : 'border-amber-400/40 text-amber-200'
                              }`}
                            >
                              {adm.suspended ? 'Reativar' : 'Desativar'}
                            </button>

                            <button
                              type="button"
                              aria-label={`Remover ${adm.displayName}`}
                              onClick={() =>
                                setConfirmState({
                                  open: true,
                                  title: 'Remover administrador?',
                                  message: `Remover acesso administrativo de ${adm.displayName}?`,
                                  confirmLabel: 'Remover',
                                  danger: true,
                                  onConfirm: async () => {
                                    await apiRequest(`/api/admin/admins/${adm.id}`, {
                                      method: 'DELETE',
                                    });
                                    setBanner({ type: 'ok', text: 'Administrador removido.' });
                                    await reloadAll();
                                  },
                                })
                              }
                              className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-red-400/35 text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isResetOpen && (
                      <div className="rounded-xl border border-[#f06aa9]/35 bg-[#170d1c] p-3 space-y-2">
                        <p className="text-[11px] font-medium text-[#f8b3d3]">
                          Definir nova senha para {adm.displayName} (mínimo 6 caracteres)
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            type="password"
                            value={resetPassValue}
                            onChange={(e) => setResetPassValue(e.target.value)}
                            placeholder="Nova senha administrativa"
                            className="min-h-[42px] flex-1 rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                          />
                          <button
                            type="button"
                            disabled={resetPassBusy}
                            onClick={() => handleResetAdminPassword(adm.id)}
                            className="min-h-[42px] rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-4 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {resetPassBusy ? 'Salvando...' : 'Confirmar nova senha'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-xs">
                      {(
                        [
                          ['canManageClients', 'Clientes e VIP'],
                          ['canManageFinance', 'Financeiro'],
                          ['canManageSettings', 'Planos e Visual'],
                          ['canManageAdmins', 'Gerir Admins'],
                        ] as const
                      ).map(([pKey, label]) => (
                        <label key={pKey} className="flex cursor-pointer items-center gap-2 text-[#e8d9e4]">
                          <input
                            type="checkbox"
                            checked={Boolean(perms[pKey])}
                            disabled={adm.id === currentUser.id && pKey === 'canManageAdmins'}
                            onChange={() => handleTogglePermission(adm, pKey)}
                            className="h-4 w-4 accent-[#f06aa9]"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>

                    {recentAdminLogs.length > 0 && (
                      <div className="border-t border-white/10 pt-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8f7889]">
                          Ações recentes
                        </p>
                        <ul className="mt-1 space-y-1 text-[11px] text-[#c6b1c0]">
                          {recentAdminLogs.map((l) => (
                            <li key={l.id} className="flex items-center justify-between gap-2">
                              <span className="truncate">{l.action}</span>
                              <span className="shrink-0 font-mono-num tabular-nums text-[#8f7889]">
                                {formatDateTime(l.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <form
            onSubmit={handleAddAdmin}
            className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 lg:col-span-5 space-y-4 h-fit"
          >
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#fff7fb]">
              <UserPlus className="h-4 w-4 text-[#f06aa9]" />
              Adicionar Administrador
            </h2>
            <input
              type="text"
              required
              placeholder="Nome"
              value={newAdminName}
              onChange={(e) => setNewAdminName(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
            />
            <input
              type="text"
              required
              placeholder="Usuário de acesso"
              value={newAdminUser}
              onChange={(e) => setNewAdminUser(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
            />
            <input
              type="email"
              placeholder="E-mail (opcional)"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
            />
            <input
              type="password"
              required
              placeholder="Senha inicial"
              value={newAdminPass}
              onChange={(e) => setNewAdminPass(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
            />
            <button
              type="submit"
              className="min-h-[46px] w-full rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-sm font-semibold text-white"
            >
              Cadastrar Administrador
            </button>
          </form>
        </div>
      )}

      {/* ================= 14. SEGURANÇA ================= */}
      {tab === 'security' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <form
              onSubmit={handleChangePassword}
              className="border border-white/10 bg-[#170d1c] p-5 space-y-4"
            >
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#fff7fb]">
                <KeyRound className="h-4 w-4 text-[#f06aa9]" />
                Alterar Minha Senha Administrativa
              </h2>
              <input
                type="password"
                required
                placeholder="Senha atual"
                value={currPass}
                onChange={(e) => setCurrPass(e.target.value)}
                className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
              />
              <input
                type="password"
                required
                placeholder="Nova senha (mín. 6 caracteres)"
                value={nextPass}
                onChange={(e) => setNextPass(e.target.value)}
                className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
              />
              <button
                type="submit"
                className="min-h-[46px] w-full bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-sm font-semibold text-white"
              >
                Atualizar Minha Senha
              </button>
            </form>

            {ctrlDraft && (
              <div className="border border-white/10 bg-[#170d1c] p-5 space-y-4">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#fff7fb]">
                  <Shield className="h-4 w-4 text-[#f06aa9]" />
                  Controles Gerais & Manutenção
                </h2>

                <label className="flex cursor-pointer items-center justify-between gap-3 border border-white/10 bg-[#100814] p-3 text-xs">
                  <span>Permitir novos cadastros de clientes</span>
                  <input
                    type="checkbox"
                    checked={ctrlDraft.registrationEnabled}
                    onChange={(e) =>
                      setCtrlDraft({ ...ctrlDraft, registrationEnabled: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#f06aa9]"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-3 border border-white/10 bg-[#100814] p-3 text-xs">
                  <span>Modo manutenção (clientes bloqueados, admins ativos)</span>
                  <input
                    type="checkbox"
                    checked={ctrlDraft.maintenanceMode}
                    onChange={(e) =>
                      setCtrlDraft({ ...ctrlDraft, maintenanceMode: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#f06aa9]"
                  />
                </label>

                <input
                  type="text"
                  value={ctrlDraft.maintenanceMessage}
                  onChange={(e) =>
                    setCtrlDraft({ ...ctrlDraft, maintenanceMessage: e.target.value })
                  }
                  placeholder="Aviso durante manutenção"
                  className="min-h-[44px] w-full border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />

                <div className="grid grid-cols-1 gap-2 text-xs text-[#d9c7d4]">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ctrlDraft.notifyNewClient}
                      onChange={(e) =>
                        setCtrlDraft({ ...ctrlDraft, notifyNewClient: e.target.checked })
                      }
                      className="h-4 w-4 accent-[#f06aa9]"
                    />
                    Notificar novo cadastro de cliente
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ctrlDraft.notifyNewProof}
                      onChange={(e) =>
                        setCtrlDraft({ ...ctrlDraft, notifyNewProof: e.target.checked })
                      }
                      className="h-4 w-4 accent-[#f06aa9]"
                    />
                    Notificar novo comprovante enviado
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ctrlDraft.notifyExpiring}
                      onChange={(e) =>
                        setCtrlDraft({ ...ctrlDraft, notifyExpiring: e.target.checked })
                      }
                      className="h-4 w-4 accent-[#f06aa9]"
                    />
                    Notificar assinaturas vencidas bloqueadas
                  </label>
                </div>

                <button
                  type="button"
                  disabled={savingControls}
                  onClick={() => handleSaveControls()}
                  className="min-h-[46px] w-full bg-[#2a1530] text-xs font-semibold text-white"
                >
                  {savingControls ? 'Salvando...' : 'Salvar Controles do Sistema'}
                </button>
              </div>
            )}
          </div>

          <section className="border border-white/10 bg-[#170d1c] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                Sessões Ativas ({sessions.length})
              </h2>
              <button
                type="button"
                onClick={async () => {
                  const res = await apiRequest<{ revokedCount: number }>(
                    '/api/admin/security/revoke-other-sessions',
                    { method: 'POST' }
                  );
                  setBanner({
                    type: 'ok',
                    text: `${res.revokedCount} outra(s) sessão(ões) sua(s) encerrada(s).`,
                  });
                  await reloadAll();
                }}
                className="min-h-[42px] border border-red-400/40 px-4 text-xs font-semibold text-red-200"
              >
                Encerrar Minhas Outras Sessões
              </button>
            </div>

            <div className="space-y-2">
              {sessions.slice(0, 20).map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-[#100814] p-3 text-xs"
                >
                  <div>
                    <p className="font-medium text-[#fff7fb]">
                      {s.displayName} ({s.role}){' '}
                      {s.isCurrent && <span className="text-emerald-400">· Sessão Atual</span>}
                    </p>
                    <p className="text-[#c6b1c0]">
                      Criada: {formatDateTime(s.createdAt)} · Expira: {formatDateTime(s.expiresAt)}
                    </p>
                  </div>
                  {!s.isCurrent && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/security/sessions/${s.id}`, {
                          method: 'DELETE',
                        });
                        setBanner({ type: 'ok', text: 'Sessão encerrada.' });
                        await reloadAll();
                      }}
                      className="min-h-[38px] border border-white/15 px-3 text-xs text-red-300"
                    >
                      Encerrar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ================= 15. AUDITORIA ================= */}
      {tab === 'audit' && (
        <div className="space-y-4">
          <input
            type="search"
            value={auditQuery}
            onChange={(e) => setAuditQuery(e.target.value)}
            placeholder="Filtrar ação, administrador ou registro..."
            className="min-h-[44px] w-full border border-white/15 bg-[#170d1c] px-4 text-sm text-[#fff7fb]"
          />

          <div className="space-y-2.5">
            {auditLogs
              .filter((l) => {
                const q = auditQuery.trim().toLowerCase();
                if (!q) return true;
                return `${l.action} ${l.adminName} ${l.recordId || ''} ${JSON.stringify(l.details)}`
                  .toLowerCase()
                  .includes(q);
              })
              .map((log) => (
                <article key={log.id} className="border border-white/10 bg-[#170d1c] p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#fff7fb]">{log.action}</span>
                    <span className="font-mono-num text-[#8f7889]">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[#c6b1c0]">
                    Por <strong className="text-[#f06aa9]">{log.adminName}</strong> · Resultado:{' '}
                    {log.result || 'sucesso'}
                    {log.recordId ? ` · Registro: ${log.recordId}` : ''}
                  </p>
                  {Object.keys(log.details || {}).length > 0 && (
                    <pre className="mt-2 overflow-x-auto border border-white/5 bg-[#100814] p-2 font-mono-num text-[11px] text-[#d9c7d4]">
                      {JSON.stringify(log.details)}
                    </pre>
                  )}
                </article>
              ))}
          </div>
        </div>
      )}

      {/* ================= 16. INTEGRAÇÕES ================= */}
      {tab === 'integrations' && integrationsStatus && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="border border-white/10 bg-[#170d1c] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#fff7fb]">
                  <Plug className="h-4 w-4 text-[#f06aa9]" />
                  Mercado Pago
                </h2>
                <span
                  className={`text-xs font-semibold ${
                    integrationsStatus.mercadoPago.configured
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  {integrationsStatus.mercadoPago.configured ? 'Token Ativo' : 'Modo Link Manual'}
                </span>
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <dt className="text-[#c6b1c0]">Token (mascarado)</dt>
                  <dd className="font-mono-num text-[#fff7fb]">
                    {integrationsStatus.mercadoPago.tokenMasked}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <dt className="text-[#c6b1c0]">Segredo Webhook</dt>
                  <dd className="text-[#fff7fb]">
                    {integrationsStatus.mercadoPago.webhookSecretConfigured
                      ? 'Configurado'
                      : 'Não definido'}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-[#c6b1c0]">URL Oficial de Webhook</dt>
                  <dd className="flex items-center justify-between gap-2 border border-white/10 bg-[#100814] p-2 font-mono-num text-[11px] text-[#e8d9e4]">
                    <span className="truncate">{integrationsStatus.mercadoPago.webhookUrl}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(integrationsStatus.mercadoPago.webhookUrl);
                        setBanner({ type: 'ok', text: 'URL do webhook copiada.' });
                      }}
                      className="shrink-0 text-[#f06aa9]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </dd>
                </div>
                <p className="text-[#c6b1c0]">
                  Último evento: {integrationsStatus.mercadoPago.lastMessage || '—'}{' '}
                  {integrationsStatus.mercadoPago.lastEventAt
                    ? `(${formatDateTime(integrationsStatus.mercadoPago.lastEventAt)})`
                    : ''}
                </p>
                {integrationsStatus.mercadoPago.lastErrorMessage && (
                  <p className="text-red-300">
                    Último erro: {integrationsStatus.mercadoPago.lastErrorMessage}
                  </p>
                )}
              </dl>
            </section>

            <section className="border border-white/10 bg-[#170d1c] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                  Supabase & Banco de Dados
                </h2>
                <span
                  className={`text-xs font-semibold ${
                    integrationsStatus.supabase.configured
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  {integrationsStatus.supabase.configured ? 'Conectado' : 'SQLite Local Ativo'}
                </span>
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <dt className="text-[#c6b1c0]">Modo de Operação</dt>
                  <dd className="text-right text-[#fff7fb]">
                    {integrationsStatus.supabase.storageMode}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <dt className="text-[#c6b1c0]">Bucket Privado</dt>
                  <dd className="font-mono-num text-[#fff7fb]">
                    {integrationsStatus.supabase.bucketName}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <dt className="text-[#c6b1c0]">Chave Service Role</dt>
                  <dd className="text-emerald-300">Restrita ao servidor</dd>
                </div>
                <p className="text-[#c6b1c0]">
                  Status: {integrationsStatus.supabase.lastMessage || '—'}
                </p>
              </dl>
            </section>
          </div>

          <button
            type="button"
            disabled={testingIntegrations}
            onClick={() => handleTestIntegrations('all')}
            className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 text-sm font-semibold text-white"
          >
            <RefreshCw className={`h-4 w-4 ${testingIntegrations ? 'animate-spin' : ''}`} />
            {testingIntegrations ? 'Testando Conexões...' : 'Testar Integrações Agora'}
          </button>

          {testResults && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Object.entries(testResults).map(([k, r]) => (
                <div
                  key={k}
                  className={`border p-4 text-xs ${
                    r.ok
                      ? 'border-emerald-400/35 bg-emerald-950/25 text-emerald-200'
                      : 'border-amber-400/35 bg-amber-950/25 text-amber-200'
                  }`}
                >
                  <strong className="uppercase">{k}:</strong> {r.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= 17. DIAGNÓSTICO ================= */}
      {tab === 'diagnostics' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-white/10 bg-[#170d1c] p-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
                Diagnóstico Técnico do Sistema
              </h2>
              <p className="text-xs text-[#c6b1c0]">
                Última verificação: {diagnostics ? formatDateTime(diagnostics.checkedAt) : '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={reloadAll}
              className="inline-flex min-h-[42px] items-center gap-1.5 border border-white/15 px-3 text-xs text-[#fff7fb]"
            >
              <RefreshCw className="h-3.5 w-3.5 text-[#f06aa9]" />
              Reverificar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {diagnostics?.checks.map((ch) => (
              <div key={ch.key} className="border border-white/10 bg-[#170d1c] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#fff7fb]">{ch.label}</span>
                  <span
                    className={`text-xs font-semibold ${
                      ch.status === 'ok'
                        ? 'text-emerald-400'
                        : ch.status === 'warn'
                        ? 'text-amber-300'
                        : 'text-red-400'
                    }`}
                  >
                    {ch.status === 'ok' ? 'Operacional' : ch.status === 'warn' ? 'Atenção' : 'Erro'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[#c6b1c0]">{ch.detail}</p>
              </div>
            ))}

            <div className="border border-white/10 bg-[#170d1c] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#fff7fb]">
                  Dispositivo & PWA Mobile
                </span>
                <span className={`text-xs font-semibold ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#c6b1c0]">
                Modo instalado: {isInstalled ? 'App Standalone (Tela Inicial)' : 'Navegador Mobile/Web'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= 19. FERRAMENTAS ADMINISTRATIVAS ================= */}
      {tab === 'tools' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border border-white/10 bg-[#170d1c] p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#fff7fb]">
                Varredura de Assinaturas Vencidas
              </h3>
              <p className="mt-1 text-xs text-[#c6b1c0]">
                Verifica todas as assinaturas com data expirada e bloqueia o acesso imediatamente.
              </p>
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
                  text: `Varredura concluída: ${res.expiredCount} assinatura(s) vencida(s).`,
                });
                await reloadAll();
              }}
              className="min-h-[46px] bg-[#2a1530] px-4 text-xs font-semibold text-white"
            >
              <RefreshCw className="inline h-3.5 w-3.5 mr-1.5 text-[#f06aa9]" />
              Executar Varredura Agora
            </button>
          </div>

          <div className="border border-white/10 bg-[#170d1c] p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#fff7fb]">
                Limpar Sessões Expiradas
              </h3>
              <p className="mt-1 text-xs text-[#c6b1c0]">
                Remove tokens de sessão antigos já expirados do banco de dados.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const res = await apiRequest<{ removed: number }>(
                  '/api/admin/tools/clean-sessions',
                  { method: 'POST' }
                );
                setBanner({
                  type: 'ok',
                  text: `${res.removed} sessão(ões) expirada(s) removida(s).`,
                });
                await reloadAll();
              }}
              className="min-h-[46px] bg-[#2a1530] px-4 text-xs font-semibold text-white"
            >
              <Wrench className="inline h-3.5 w-3.5 mr-1.5 text-[#f06aa9]" />
              Limpar Banco de Sessões
            </button>
          </div>

          <div className="border border-white/10 bg-[#170d1c] p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#fff7fb]">
                Exportar Backup JSON de Configurações
              </h3>
              <p className="mt-1 text-xs text-[#c6b1c0]">
                Baixa planos, aparência, textos e configurações gerais em JSON seguro (sem senhas).
              </p>
            </div>
            <a
              href="/api/admin/tools/backup"
              className="inline-flex min-h-[46px] items-center justify-center gap-2 bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-4 text-xs font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              Baixar Backup JSON
            </a>
          </div>

          <div className="border border-white/10 bg-[#170d1c] p-5 flex flex-col justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-[#fff7fb]">
                Restaurar Aparência Padrão
              </h3>
              <p className="mt-1 text-xs text-[#c6b1c0]">
                Volta cores e textos do site para o visual editorial original VIP da Nicolly.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setConfirmState({
                  open: true,
                  title: 'Restaurar aparência padrão?',
                  message:
                    'Todas as personalizações de cores e textos publicadas serão substituídas pelo padrão original.',
                  confirmLabel: 'Restaurar Padrão',
                  danger: true,
                  onConfirm: async () => {
                    await apiRequest('/api/admin/tools/reset-appearance', { method: 'POST' });
                    setBanner({ type: 'ok', text: 'Aparência padrão restaurada.' });
                    await reloadAll();
                    if (onAppearancePublished) await onAppearancePublished();
                  },
                })
              }
              className="min-h-[46px] border border-red-400/40 bg-red-950/30 px-4 text-xs font-semibold text-red-200"
            >
              <RotateCcw className="inline h-3.5 w-3.5 mr-1.5" />
              Restaurar Visual Padrão
            </button>
          </div>
        </div>
      )}
    </>
  );
};

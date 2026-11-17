import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Image as ImageIcon,
  LifeBuoy,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  apiRequest,
  formatBrl,
  formatDate,
  formatDateTime,
  formatFileSize,
  maskPhoneInput,
  SUPPORT_STATUS_META,
} from './api.ts';
import type {
  CouponRecord,
  MediaAsset,
  PlanKey,
  SiteConfig,
  SupportTicket,
  SupportTicketStatus,
} from './types.ts';
import { AdminModuleKey, ConfirmDialog } from './AdminShared.tsx';

interface AdminGrowthProps {
  tab: AdminModuleKey;
  setBanner: (b: { type: 'ok' | 'err'; text: string } | null) => void;
  reloadAll: () => Promise<void>;
  onAppearancePublished?: () => Promise<void> | void;
  settings: SiteConfig | null;
}

export const AdminGrowthModules: React.FC<AdminGrowthProps> = ({
  tab,
  setBanner,
  reloadAll,
  onAppearancePublished,
  settings,
}) => {
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // ---------------- COUPONS STATE ----------------
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed_cents'>('percent');
  const [discountValInput, setDiscountValInput] = useState('15');
  const [maxUsesInput, setMaxUsesInput] = useState('');
  const [validUntilInput, setValidUntilInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [selectedPlans, setSelectedPlans] = useState<PlanKey[]>(['semanal', 'mensal', 'vitalicio']);
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  // ---------------- MEDIA STATE ----------------
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaCategory, setMediaCategory] = useState<'hero' | 'vip_banner' | 'logo' | 'geral'>('hero');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // ---------------- SUPPORT INBOX + WHATSAPP SETTINGS ----------------
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<'all' | SupportTicketStatus>('all');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyStatusMap, setReplyStatusMap] = useState<Record<string, SupportTicketStatus>>({});
  const [ticketBusyId, setTicketBusyId] = useState<string | null>(null);

  const [waInput, setWaInput] = useState(settings?.whatsapp || '');
  const [waLabelInput, setWaLabelInput] = useState(settings?.whatsappLabel || '');
  const [msgInput, setMsgInput] = useState(settings?.mensagem || '');
  const [savingWa, setSavingWa] = useState(false);

  useEffect(() => {
    if (settings) {
      setWaInput(settings.whatsapp);
      setWaLabelInput(settings.whatsappLabel);
      setMsgInput(settings.mensagem);
    }
  }, [settings]);

  const loadCoupons = useCallback(async () => {
    setLoadingCoupons(true);
    try {
      const res = await apiRequest<{ coupons: CouponRecord[] }>('/api/admin/coupons');
      setCoupons(res.coupons);
    } catch {
      // ignore if permission-gated
    } finally {
      setLoadingCoupons(false);
    }
  }, []);

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    try {
      const res = await apiRequest<{ assets: MediaAsset[] }>('/api/admin/media');
      setAssets(res.assets);
    } catch {
      // ignore
    } finally {
      setLoadingMedia(false);
    }
  }, []);

  const loadTickets = useCallback(async () => {
    try {
      const res = await apiRequest<{ tickets: SupportTicket[] }>('/api/admin/support/tickets');
      setTickets(res.tickets);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (tab === 'coupons') loadCoupons();
    if (tab === 'media') loadMedia();
    if (tab === 'support') loadTickets();
  }, [tab, loadCoupons, loadMedia, loadTickets]);

  async function runConfirmed(action: () => Promise<void>) {
    setConfirmBusy(true);
    try {
      await action();
      setConfirmState(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleCreateCoupon(e: React.FormEvent) {
    e.preventDefault();
    setCreatingCoupon(true);
    try {
      const rawVal = Number(discountValInput.replace(',', '.'));
      const discountValue =
        discountType === 'fixed_cents' ? Math.round(rawVal * 100) : Math.round(rawVal);

      await apiRequest('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: codeInput.trim().toUpperCase(),
          discountType,
          discountValue,
          applicablePlans: selectedPlans,
          maxUses: maxUsesInput ? Number(maxUsesInput) : null,
          validUntil: validUntilInput ? `${validUntilInput}T23:59:59.000Z` : null,
          description: descInput.trim() || null,
        }),
      });
      setCodeInput('');
      setDescInput('');
      setMaxUsesInput('');
      setValidUntilInput('');
      setBanner({ type: 'ok', text: 'Cupom criado e ativado com sucesso.' });
      await loadCoupons();
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setCreatingCoupon(false);
    }
  }

  async function handleToggleCoupon(c: CouponRecord) {
    try {
      await apiRequest(`/api/admin/coupons/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !c.active }),
      });
      setBanner({
        type: 'ok',
        text: c.active ? `Cupom ${c.code} pausado.` : `Cupom ${c.code} reativado.`,
      });
      await loadCoupons();
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  }

  async function handleUploadMedia(e: React.FormEvent) {
    e.preventDefault();
    if (!mediaFile) {
      setBanner({ type: 'err', text: 'Selecione uma imagem (JPG, PNG, WebP ou SVG) até 5 MB.' });
      return;
    }
    setUploadingMedia(true);
    try {
      const fd = new FormData();
      fd.append('file', mediaFile);
      fd.append('title', mediaTitle.trim() || mediaFile.name);
      fd.append('category', mediaCategory);
      await apiRequest('/api/admin/media', { method: 'POST', body: fd });
      setMediaFile(null);
      setMediaTitle('');
      setBanner({ type: 'ok', text: 'Mídia adicionada à biblioteca com sucesso.' });
      await loadMedia();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleApplyMedia(id: string, target: 'heroImageUrl' | 'vipBannerUrl') {
    try {
      await apiRequest(`/api/admin/media/${id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ target }),
      });
      setBanner({
        type: 'ok',
        text:
          target === 'heroImageUrl'
            ? 'Imagem aplicada ao Hero da página inicial!'
            : 'Imagem aplicada ao Banner da Área VIP!',
      });
      if (onAppearancePublished) await onAppearancePublished();
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    }
  }

  async function handleAdminReplyTicket(tk: SupportTicket) {
    const msg = (replyDrafts[tk.id] || '').trim();
    if (msg.length < 2) {
      setBanner({ type: 'err', text: 'Escreva uma resposta antes de enviar.' });
      return;
    }
    setTicketBusyId(tk.id);
    try {
      await apiRequest(`/api/admin/support/tickets/${tk.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          message: msg,
          status: replyStatusMap[tk.id] || 'aguardando_cliente',
        }),
      });
      setReplyDrafts((prev) => ({ ...prev, [tk.id]: '' }));
      setBanner({ type: 'ok', text: 'Resposta enviada e cliente notificado na conta.' });
      await loadTickets();
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setTicketBusyId(null);
    }
  }

  async function handleUpdateTicketStatus(tkId: string, status: SupportTicketStatus) {
    setTicketBusyId(tkId);
    try {
      await apiRequest(`/api/admin/support/tickets/${tkId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setBanner({ type: 'ok', text: 'Status do chamado atualizado.' });
      await loadTickets();
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setTicketBusyId(null);
    }
  }

  async function handleSaveSupportSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSavingWa(true);
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          hero: settings.hero,
          vipGroupInvite: settings.vipGroupInvite || '',
          whatsapp: waInput,
          whatsappLabel: waLabelInput,
          mensagem: msgInput,
        }),
      });
      setBanner({ type: 'ok', text: 'Canal oficial de WhatsApp atualizado.' });
      await reloadAll();
    } catch (err: any) {
      setBanner({ type: 'err', text: err.message });
    } finally {
      setSavingWa(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard?.writeText(text).then(
      () => setBanner({ type: 'ok', text: `${label} copiado.` }),
      () => {}
    );
  }

  const filteredTickets = tickets.filter(
    (t) => ticketFilter === 'all' || t.status === ticketFilter
  );

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

      {/* ================= CUPONS & PROMOÇÕES ================= */}
      {tab === 'coupons' && (
        <div className="space-y-6">
          <form
            onSubmit={handleCreateCoupon}
            className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 space-y-4"
          >
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#fff7fb]">
              <Tag className="h-4 w-4 text-[#f06aa9]" />
              Criar Novo Cupom Promocional
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs text-[#c6b1c0]">Código (ex: VIP15)</label>
                <input
                  type="text"
                  required
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="NICOLLY10"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 font-mono-num text-sm uppercase text-[#fff7fb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Tipo de desconto</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as any)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                >
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed_cents">Valor Fixo (R$)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">
                  {discountType === 'percent' ? 'Percentual (1 a 95%)' : 'Valor em Reais (ex: 10,00)'}
                </label>
                <input
                  type="text"
                  required
                  value={discountValInput}
                  onChange={(e) => setDiscountValInput(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 font-mono-num text-sm text-[#fff7fb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Limite de usos (opcional)</label>
                <input
                  type="number"
                  min={1}
                  value={maxUsesInput}
                  onChange={(e) => setMaxUsesInput(e.target.value)}
                  placeholder="Ilimitado"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 font-mono-num text-sm text-[#fff7fb]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-[#c6b1c0]">Válido até (opcional)</label>
                <input
                  type="date"
                  value={validUntilInput}
                  onChange={(e) => setValidUntilInput(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#c6b1c0]">Observação da campanha</label>
                <input
                  type="text"
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  placeholder="Ex: Campanha relâmpago de fim de semana"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-[#e8d9e4]">
              <span className="text-[#c6b1c0]">Aplicável aos planos:</span>
              {(['semanal', 'mensal', 'vitalicio'] as PlanKey[]).map((pk) => {
                const checked = selectedPlans.includes(pk);
                return (
                  <label key={pk} className="inline-flex cursor-pointer items-center gap-1.5 capitalize">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedPlans((prev) =>
                          prev.includes(pk) ? prev.filter((x) => x !== pk) : [...prev, pk]
                        )
                      }
                      className="h-4 w-4 accent-[#f06aa9]"
                    />
                    <span>{pk}</span>
                  </label>
                );
              })}
            </div>

            <button
              type="submit"
              disabled={creatingCoupon}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 text-xs font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              {creatingCoupon ? 'Criando cupom...' : 'Cadastrar Cupom'}
            </button>
          </form>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-[#fff7fb]">
              Cupons Cadastrados ({coupons.length})
            </h2>
            {loadingCoupons && coupons.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
                Carregando cupons...
              </div>
            ) : coupons.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
                Nenhum cupom promocional cadastrado ainda.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {coupons.map((c) => (
                  <article
                    key={c.id}
                    className="rounded-2xl border border-white/10 bg-[#170d1c] p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-lg font-bold text-[#fff7fb]">
                            {c.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(c.code, 'Código do cupom')}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 text-[#c6b1c0] hover:text-[#fff7fb]"
                            aria-label="Copiar código"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-xs font-semibold text-[#f06aa9]">
                          {c.discountType === 'percent'
                            ? `${c.discountValue}% de desconto`
                            : `${formatBrl(c.discountValue)} de desconto`}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          c.active ? 'text-emerald-400' : 'text-neutral-400'
                        }`}
                      >
                        {c.active ? 'Ativo' : 'Pausado'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-[#100814] p-3 text-xs text-[#c6b1c0]">
                      <div>
                        Usos:{' '}
                        <strong className="font-mono-num text-[#fff7fb]">
                          {c.usedCount}
                          {c.maxUses ? ` / ${c.maxUses}` : ' / ilimitado'}
                        </strong>
                      </div>
                      <div>
                        Validade:{' '}
                        <strong className="font-mono-num text-[#fff7fb]">
                          {c.validUntil ? formatDate(c.validUntil) : 'Sem prazo'}
                        </strong>
                      </div>
                    </div>

                    {c.description && <p className="text-xs text-[#c6b1c0]">{c.description}</p>}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleCoupon(c)}
                        className="min-h-[42px] rounded-xl border border-white/15 bg-[#2a1530] text-xs font-semibold text-[#fff7fb]"
                      >
                        {c.active ? 'Pausar Cupom' : 'Reativar Cupom'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            open: true,
                            title: `Excluir cupom ${c.code}?`,
                            message: 'Pagamentos anteriores com este cupom preservam o histórico.',
                            confirmLabel: 'Excluir Cupom',
                            danger: true,
                            onConfirm: async () => {
                              await apiRequest(`/api/admin/coupons/${c.id}`, { method: 'DELETE' });
                              setBanner({ type: 'ok', text: `Cupom ${c.code} excluído.` });
                              await loadCoupons();
                              await reloadAll();
                            },
                          })
                        }
                        className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-red-400/40 bg-red-950/25 text-xs font-semibold text-red-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ================= BIBLIOTECA DE MÍDIA ================= */}
      {tab === 'media' && (
        <div className="space-y-6">
          <form
            onSubmit={handleUploadMedia}
            className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 space-y-4"
          >
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#fff7fb]">
              <ImageIcon className="h-4 w-4 text-[#f06aa9]" />
              Enviar Nova Imagem do Site
            </h2>
            <p className="text-xs text-[#c6b1c0]">
              Armazenamento dedicado de mídias públicas do site (separado do repositório privado de comprovantes).
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-[#c6b1c0]">Título da imagem</label>
                <input
                  type="text"
                  value={mediaTitle}
                  onChange={(e) => setMediaTitle(e.target.value)}
                  placeholder="Ex: Capa Editorial Novembro"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Categoria</label>
                <select
                  value={mediaCategory}
                  onChange={(e) => setMediaCategory(e.target.value as any)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                >
                  <option value="hero">Capa Principal (Hero)</option>
                  <option value="vip_banner">Banner Área VIP</option>
                  <option value="logo">Logo / Emblema</option>
                  <option value="geral">Geral</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Arquivo (JPG, PNG, WebP ou SVG)</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
                  className="mt-1 block min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 py-2 text-xs text-[#e8d9e4] file:mr-2 file:rounded-lg file:border-0 file:bg-[#2a1530] file:px-2.5 file:py-1 file:text-xs file:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={uploadingMedia}
              className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 text-xs font-semibold text-white"
            >
              <Upload className="h-4 w-4" />
              {uploadingMedia ? 'Enviando imagem...' : 'Enviar para Biblioteca'}
            </button>
          </form>

          {loadingMedia && assets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
              Carregando biblioteca...
            </div>
          ) : assets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
              Nenhuma mídia enviada ainda. Você pode enviar banners aqui e aplicá-los com 1 toque.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <article
                  key={asset.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-[#170d1c] flex flex-col justify-between"
                >
                  <div className="aspect-[16/10] w-full bg-[#100814] overflow-hidden">
                    <img
                      src={asset.url}
                      alt={asset.title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="truncate text-sm font-semibold text-[#fff7fb]">{asset.title}</p>
                      <p className="text-[11px] text-[#c6b1c0]">
                        {asset.category} · {formatFileSize(asset.sizeBytes)} · {formatDate(asset.createdAt)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleApplyMedia(asset.id, 'heroImageUrl')}
                        className="min-h-[38px] rounded-lg border border-[#f06aa9]/40 bg-[#241028] px-2 text-[11px] font-semibold text-[#fff7fb]"
                      >
                        <Sparkles className="inline h-3 w-3 mr-1 text-[#f06aa9]" />
                        Usar no Hero
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyMedia(asset.id, 'vipBannerUrl')}
                        className="min-h-[38px] rounded-lg border border-white/15 bg-[#100814] px-2 text-[11px] font-semibold text-[#fff7fb]"
                      >
                        Banner VIP
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(asset.url, 'Link da mídia')}
                        className="min-h-[38px] rounded-lg border border-white/15 text-[11px] text-[#c6b1c0]"
                      >
                        <Copy className="inline h-3 w-3 mr-1" />
                        Copiar URL
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            open: true,
                            title: 'Excluir mídia?',
                            message: `Remover "${asset.title}" da biblioteca?`,
                            confirmLabel: 'Excluir',
                            danger: true,
                            onConfirm: async () => {
                              await apiRequest(`/api/admin/media/${asset.id}`, { method: 'DELETE' });
                              setBanner({ type: 'ok', text: 'Mídia removida.' });
                              await loadMedia();
                            },
                          })
                        }
                        className="min-h-[38px] rounded-lg border border-red-400/35 bg-red-950/25 text-[11px] font-semibold text-red-200"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= CENTRAL DE SUPORTE (CHAMADOS + WHATSAPP) ================= */}
      {tab === 'support' && (
        <div className="space-y-6">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ['all', 'Todos Chamados'],
                ['aberto', 'Abertos'],
                ['em_atendimento', 'Em Atendimento'],
                ['aguardando_cliente', 'Aguardando Cliente'],
                ['resolvido', 'Resolvidos'],
                ['encerrado', 'Encerrados'],
              ] as const
            ).map(([st, label]) => (
              <button
                key={st}
                type="button"
                onClick={() => setTicketFilter(st)}
                className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium border whitespace-nowrap ${
                  ticketFilter === st
                    ? 'border-[#f06aa9] bg-[#2a1530] text-[#fff7fb]'
                    : 'border-white/10 bg-[#170d1c] text-[#c6b1c0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredTickets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center text-xs text-[#c6b1c0]">
              Nenhum chamado nesta categoria.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((tk) => {
                const st = SUPPORT_STATUS_META[tk.status];
                return (
                  <article
                    key={tk.id}
                    className="rounded-2xl border border-white/10 bg-[#170d1c] p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <LifeBuoy className="h-4 w-4 text-[#f06aa9]" />
                          <h3 className="font-semibold text-[#fff7fb]">{tk.subject}</h3>
                          {tk.priority === 'alta' && (
                            <span className="rounded-md border border-red-400/40 bg-red-950/30 px-2 py-0.5 text-[10px] font-semibold text-red-200">
                              Urgente
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[#c6b1c0]">
                          {tk.customerName} ({tk.customerEmail}) · {tk.customerPhone} ·{' '}
                          <span className="capitalize">{tk.category.replace('_', ' ')}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${st.toneClass}`}>{st.label}</span>
                        <select
                          value={tk.status}
                          disabled={ticketBusyId === tk.id}
                          onChange={(e) =>
                            handleUpdateTicketStatus(tk.id, e.target.value as SupportTicketStatus)
                          }
                          className="min-h-[36px] rounded-lg border border-white/15 bg-[#100814] px-2 text-xs text-[#fff7fb]"
                        >
                          <option value="aberto">Aberto</option>
                          <option value="em_atendimento">Em atendimento</option>
                          <option value="aguardando_cliente">Aguardando cliente</option>
                          <option value="resolvido">Resolvido</option>
                          <option value="encerrado">Encerrado</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {tk.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-xl p-3 text-xs ${
                            m.senderRole === 'admin'
                              ? 'border border-[#f06aa9]/35 bg-[#221029] text-[#fff7fb]'
                              : 'border border-white/10 bg-[#100814] text-[#e8d9e4]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] opacity-80">
                            <span className="font-semibold">{m.senderName}</span>
                            <span className="font-mono-num">{formatDateTime(m.createdAt)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.message}</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                      <input
                        type="text"
                        value={replyDrafts[tk.id] || ''}
                        onChange={(e) =>
                          setReplyDrafts((prev) => ({ ...prev, [tk.id]: e.target.value }))
                        }
                        placeholder="Escrever resposta oficial para o cliente..."
                        className="sm:col-span-7 min-h-[44px] rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                      />
                      <select
                        value={replyStatusMap[tk.id] || 'aguardando_cliente'}
                        onChange={(e) =>
                          setReplyStatusMap((prev) => ({
                            ...prev,
                            [tk.id]: e.target.value as SupportTicketStatus,
                          }))
                        }
                        className="sm:col-span-3 min-h-[44px] rounded-xl border border-white/15 bg-[#100814] px-2.5 text-xs text-[#fff7fb]"
                      >
                        <option value="aguardando_cliente">Aguardando cliente</option>
                        <option value="em_atendimento">Em atendimento</option>
                        <option value="resolvido">Marcar como Resolvido</option>
                        <option value="encerrado">Encerrar chamado</option>
                      </select>
                      <button
                        type="button"
                        disabled={ticketBusyId === tk.id}
                        onClick={() => handleAdminReplyTicket(tk)}
                        className="sm:col-span-2 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-3 text-xs font-semibold text-white"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Responder
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* WhatsApp Official Contact Form */}
          <form
            onSubmit={handleSaveSupportSettings}
            className="max-w-xl rounded-2xl border border-white/10 bg-[#170d1c] p-5 space-y-4"
          >
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[#fff7fb]">
              <MessageCircle className="h-4 w-4 text-[#f06aa9]" />
              WhatsApp Oficial & Mensagem Padrão
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[#c6b1c0]">Número WhatsApp (com DDI 55)</label>
                <input
                  type="text"
                  value={waInput}
                  onChange={(e) => setWaInput(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 font-mono-num text-sm text-[#fff7fb]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#c6b1c0]">Rótulo exibido ao cliente</label>
                <input
                  type="text"
                  value={waLabelInput}
                  onChange={(e) => setWaLabelInput(maskPhoneInput(e.target.value))}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#c6b1c0]">Mensagem padrão de atendimento</label>
              <textarea
                rows={3}
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-[#100814] p-3 text-xs text-[#fff7fb]"
              />
            </div>

            <button
              type="submit"
              disabled={savingWa}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-sm font-semibold text-white"
            >
              <Check className="h-4 w-4" />
              {savingWa ? 'Salvando...' : 'Atualizar WhatsApp de Suporte'}
            </button>
          </form>
        </div>
      )}
    </>
  );
};

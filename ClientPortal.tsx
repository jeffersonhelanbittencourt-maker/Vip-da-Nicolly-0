import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Heart,
  Home,
  KeyRound,
  LifeBuoy,
  Lock,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Sun,
  Tag,
  Upload,
  User,
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
import { PWAInstallButton } from './PWAInstallButton.tsx';
import type {
  CouponValidationResult,
  PaymentRecord,
  PlanKey,
  SiteConfig,
  SubscriptionSummary,
  SupportTicket,
  UserNotificationRecord,
  UserProfile,
} from './types.ts';

export type ClientTab = 'inicio' | 'planos' | 'conta' | 'suporte' | 'vip';

interface ClientPortalProps {
  user: UserProfile;
  subscription: SubscriptionSummary;
  activeTab: ClientTab;
  onChangeTab: (tab: ClientTab) => void;
  onGoAdmin: () => void;
  onOpenLegal: (page: 'termos' | 'privacidade') => void;
  onOpenPaymentTrack?: (ref: string) => void;
  onLogout: () => void;
  onRefreshSession: () => Promise<void>;
  theme?: 'dark' | 'light';
  onSetTheme?: (next: 'dark' | 'light') => void;
}

interface CheckoutModalState {
  paymentId: string;
  planName: string;
  amountCents: number;
  originalAmountCents?: number | null;
  discountCents?: number;
  couponCode?: string | null;
  externalReference: string;
  checkoutUrl: string;
  fallbackLink: string;
  mode: 'mercadopago_api' | 'external_link_manual';
  notice: string;
}

type ClientLifecycleState =
  | 'acesso_suspenso'
  | 'assinatura_ativa'
  | 'pagamento_aprovado'
  | 'assinatura_vencida'
  | 'pagamento_pendente'
  | 'sem_plano';

export const ClientPortal: React.FC<ClientPortalProps> = ({
  user,
  subscription,
  activeTab,
  onChangeTab,
  onGoAdmin,
  onOpenLegal,
  onOpenPaymentTrack,
  onLogout,
  onRefreshSession,
  theme = 'dark',
  onSetTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [userNotifications, setUserNotifications] = useState<UserNotificationRecord[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [emblemImgError, setEmblemImgError] = useState(false);
  const [loungeImgError, setLoungeImgError] = useState(false);

  // Checkout + Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    results: Partial<Record<PlanKey, CouponValidationResult>>;
  } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponFeedback, setCouponFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState<PlanKey | null>(null);
  const [checkoutModal, setCheckoutModal] = useState<CheckoutModalState | null>(null);
  const [verifyBusyId, setVerifyBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Proof upload state
  const [proofPaymentId, setProofPaymentId] = useState<string>('');
  const [proofPlanKey, setProofPlanKey] = useState<PlanKey>('mensal');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofRefHint, setProofRefHint] = useState('');
  const [proofAmountHint, setProofAmountHint] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);

  // Self-service profile, preferences & password state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user.displayName);
  const [profilePhone, setProfilePhone] = useState(user.phone);
  const [savingProfile, setSavingProfile] = useState(false);
  const [prefInApp, setPrefInApp] = useState(user.preferences?.inAppNotifications ?? true);
  const [prefEmailUpdates, setPrefEmailUpdates] = useState(user.preferences?.emailUpdates ?? false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Support ticket state
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState<'pagamento' | 'acesso_vip' | 'conta' | 'outro'>('pagamento');
  const [ticketPriority, setTicketPriority] = useState<'normal' | 'alta'>('normal');
  const [ticketMessage, setTicketMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null);

  // VIP Area backend-verified state (raw group link NEVER exposed to client)
  const [vipData, setVipData] = useState<{
    authorized: boolean;
    supportWhatsapp: string;
    supportWhatsappLabel: string;
    groupRequestStatus?: string | null;
    lastGroupRequestAt?: string | null;
    vipTitle?: string;
    vipDescription?: string;
    approvedMessage?: string;
    error?: string;
  } | null>(null);
  const [loadingVip, setLoadingVip] = useState(false);
  const [groupRequestBusy, setGroupRequestBusy] = useState(false);
  const [groupRequestWaUrl, setGroupRequestWaUrl] = useState<string | null>(null);

  useEffect(() => {
    setProfileName(user.displayName);
    setProfilePhone(user.phone);
    if (user.preferences) {
      setPrefInApp(user.preferences.inAppNotifications);
      setPrefEmailUpdates(user.preferences.emailUpdates);
    }
  }, [user.displayName, user.phone, user.preferences]);

  const loadClientData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [plansRes, payRes, notifRes, ticketRes] = await Promise.all([
        apiRequest<SiteConfig>('/api/plans'),
        apiRequest<{ payments: PaymentRecord[]; subscription: SubscriptionSummary }>('/api/payments/my'),
        apiRequest<{ notifications: UserNotificationRecord[] }>('/api/notifications/my').catch(() => ({
          notifications: [],
        })),
        apiRequest<{ tickets: SupportTicket[] }>('/api/support/tickets').catch(() => ({
          tickets: [],
        })),
      ]);
      setSiteConfig(plansRes);
      setPayments(payRes.payments);
      setUserNotifications(notifRes.notifications);
      setTickets(ticketRes.tickets);
      if (payRes.payments.length > 0 && !proofPaymentId) {
        const pending = payRes.payments.find(
          (p) => p.status === 'aguardando_pagamento' || p.status === 'recusado'
        );
        if (pending) setProofPaymentId(pending.id);
      }
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Erro ao carregar dados da conta.' });
    } finally {
      setLoadingData(false);
    }
  }, [proofPaymentId]);

  const loadVipAccess = useCallback(async () => {
    setLoadingVip(true);
    try {
      const data = await apiRequest<{
        authorized: boolean;
        supportWhatsapp: string;
        supportWhatsappLabel: string;
        groupRequestStatus?: string | null;
        lastGroupRequestAt?: string | null;
        vipTitle?: string;
        vipDescription?: string;
        approvedMessage?: string;
      }>('/api/vip/access');
      setVipData(data);
    } catch (err: any) {
      setVipData({
        authorized: false,
        supportWhatsapp: siteConfig?.whatsapp || '554192387993',
        supportWhatsappLabel: siteConfig?.whatsappLabel || '(41) 9238-7993',
        error: err.message,
      });
    } finally {
      setLoadingVip(false);
    }
  }, [siteConfig?.whatsapp, siteConfig?.whatsappLabel]);

  useEffect(() => {
    loadClientData();
  }, [loadClientData]);

  useEffect(() => {
    if (activeTab === 'vip' || subscription.hasVipAccess) {
      loadVipAccess();
    }
  }, [activeTab, subscription.hasVipAccess, loadVipAccess]);

  const pendingPayment = useMemo(
    () =>
      payments.find(
        (p) =>
          p.status === 'aguardando_pagamento' ||
          p.status === 'aguardando_analise' ||
          p.status === 'em_analise'
      ) || null,
    [payments]
  );

  const clientState: ClientLifecycleState = useMemo(() => {
    if (user.suspended) return 'acesso_suspenso';
    if (subscription.hasVipAccess) {
      const approvedRecently =
        subscription.approvedAt &&
        Date.now() - new Date(subscription.approvedAt).getTime() < 24 * 60 * 60 * 1000;
      return approvedRecently ? 'pagamento_aprovado' : 'assinatura_ativa';
    }
    if (subscription.isExpired) return 'assinatura_vencida';
    if (pendingPayment) return 'pagamento_pendente';
    return 'sem_plano';
  }, [user.suspended, subscription.hasVipAccess, subscription.approvedAt, subscription.isExpired, pendingPayment]);

  async function handleValidateCoupon(e: React.FormEvent) {
    e.preventDefault();
    const clean = couponInput.trim().toUpperCase();
    if (!clean) {
      setCouponFeedback({ type: 'err', text: 'Digite o código de um cupom promocional.' });
      return;
    }
    setCouponBusy(true);
    setCouponFeedback(null);
    try {
      const keys: PlanKey[] = ['semanal', 'mensal', 'vitalicio'];
      const results: Partial<Record<PlanKey, CouponValidationResult>> = {};
      let firstMessage = '';
      let firstError = '';
      for (const pk of keys) {
        try {
          const r = await apiRequest<CouponValidationResult>('/api/coupons/validate', {
            method: 'POST',
            body: JSON.stringify({ code: clean, planKey: pk }),
          });
          results[pk] = r;
          if (!firstMessage) firstMessage = r.message;
        } catch (err: any) {
          if (!firstError) firstError = err.message;
        }
      }
      if (Object.keys(results).length === 0) {
        setAppliedCoupon(null);
        setCouponFeedback({ type: 'err', text: firstError || 'Cupom inválido ou expirado.' });
      } else {
        setAppliedCoupon({ code: clean, results });
        setCouponFeedback({ type: 'ok', text: firstMessage || `Cupom ${clean} aplicado aos planos elegíveis!` });
      }
    } finally {
      setCouponBusy(false);
    }
  }

  async function handleStartCheckout(planKey: PlanKey) {
    if (!siteConfig) return;
    setFeedback(null);
    setCheckoutBusy(planKey);
    try {
      const useCoupon =
        appliedCoupon && appliedCoupon.results[planKey] ? appliedCoupon.code : undefined;
      const res = await apiRequest<{
        mode: 'mercadopago_api' | 'external_link_manual';
        notice: string;
        checkoutUrl: string;
        fallbackLink: string;
        payment: PaymentRecord;
      }>('/api/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ planKey, couponCode: useCoupon }),
      });

      setCheckoutModal({
        paymentId: res.payment.id,
        planName: siteConfig.plans[planKey].name,
        amountCents: res.payment.amountCents,
        originalAmountCents: res.payment.originalAmountCents,
        discountCents: res.payment.discountCents,
        couponCode: res.payment.couponCode,
        externalReference: res.payment.externalReference,
        checkoutUrl: res.checkoutUrl,
        fallbackLink: res.fallbackLink,
        mode: res.mode,
        notice: res.notice,
      });
      setProofPaymentId(res.payment.id);
      setProofPlanKey(planKey);
      await loadClientData();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Erro ao iniciar cobrança.' });
    } finally {
      setCheckoutBusy(null);
    }
  }

  async function handleVerifyMercadoPago(paymentId: string) {
    setVerifyBusyId(paymentId);
    setFeedback(null);
    try {
      const res = await apiRequest<{ verified: boolean; status: string; message: string }>(
        `/api/payments/${paymentId}/verify-mp`,
        { method: 'POST' }
      );
      setFeedback({ type: res.status === 'aprovado' ? 'ok' : 'err', text: res.message });
      await loadClientData();
      await onRefreshSession();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message });
    } finally {
      setVerifyBusyId(null);
    }
  }

  async function handleUploadProof(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!proofFile) {
      setFeedback({ type: 'err', text: 'Selecione uma imagem ou PDF do comprovante.' });
      return;
    }

    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append('file', proofFile);
      if (proofPaymentId) {
        fd.append('paymentId', proofPaymentId);
      } else {
        fd.append('planKey', proofPlanKey);
      }
      if (proofRefHint.trim()) fd.append('extractedReference', proofRefHint.trim());
      if (proofAmountHint.trim()) fd.append('extractedAmount', proofAmountHint.trim());

      const res = await apiRequest<{ message: string }>('/api/proofs', {
        method: 'POST',
        body: fd,
      });

      setProofFile(null);
      setProofRefHint('');
      setProofAmountHint('');
      setFeedback({ type: 'ok', text: res.message });
      await loadClientData();
      await onRefreshSession();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Falha no envio do comprovante.' });
    } finally {
      setUploadingProof(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setSavingProfile(true);
    try {
      await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: profileName,
          phone: profilePhone,
        }),
      });
      setEditingProfile(false);
      setFeedback({ type: 'ok', text: 'Seus dados de cadastro foram atualizados com sucesso.' });
      await onRefreshSession();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Não foi possível atualizar seu perfil.' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangeClientPassword(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (newPassword.length < 6) {
      setFeedback({ type: 'err', text: 'A nova senha deve possuir no mínimo 6 caracteres.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setFeedback({ type: 'err', text: 'A confirmação da nova senha não confere.' });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setFeedback({ type: 'ok', text: res.message || 'Senha alterada com sucesso.' });
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Não foi possível alterar sua senha.' });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRequestGroupEntry() {
    setGroupRequestBusy(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{
        ok: boolean;
        requestId: string;
        status: string;
        whatsappUrl: string;
        message: string;
      }>('/api/vip/request-group-entry', { method: 'POST' });
      setGroupRequestWaUrl(res.whatsappUrl);
      setFeedback({ type: 'ok', text: res.message });
      await loadVipAccess();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Não foi possível registrar a solicitação.' });
    } finally {
      setGroupRequestBusy(false);
    }
  }

  async function handleSavePreferences(nextTheme?: 'dark' | 'light', nextInApp?: boolean, nextEmail?: boolean) {
    const resolvedTheme = nextTheme ?? theme;
    const resolvedInApp = nextInApp ?? prefInApp;
    const resolvedEmail = nextEmail ?? prefEmailUpdates;
    setSavingPrefs(true);
    try {
      await apiRequest('/api/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          theme: resolvedTheme,
          inAppNotifications: resolvedInApp,
          emailUpdates: resolvedEmail,
        }),
      });
      if (nextTheme && onSetTheme) onSetTheme(nextTheme);
      if (nextInApp !== undefined) setPrefInApp(nextInApp);
      if (nextEmail !== undefined) setPrefEmailUpdates(nextEmail);
      setFeedback({ type: 'ok', text: 'Preferências da conta atualizadas.' });
      await onRefreshSession();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Não foi possível salvar preferências.' });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleMarkAllNotifsRead() {
    try {
      await apiRequest('/api/notifications/my/read-all', { method: 'POST' });
      await loadClientData();
    } catch {
      // ignore
    }
  }

  async function handleMarkOneNotifRead(id: string) {
    try {
      await apiRequest(`/api/notifications/my/${id}/read`, { method: 'PATCH' });
      setUserNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
    } catch {
      // ignore
    }
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setCreatingTicket(true);
    try {
      await apiRequest('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: ticketSubject,
          category: ticketCategory,
          priority: ticketPriority,
          message: ticketMessage,
        }),
      });
      setTicketSubject('');
      setTicketMessage('');
      setFeedback({ type: 'ok', text: 'Chamado enviado para nossa equipe com sucesso!' });
      await loadClientData();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Erro ao abrir chamado.' });
    } finally {
      setCreatingTicket(false);
    }
  }

  async function handleReplyTicket(ticketId: string) {
    const msg = (replyDrafts[ticketId] || '').trim();
    if (msg.length < 2) return;
    setReplyBusyId(ticketId);
    try {
      await apiRequest(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });
      setReplyDrafts((prev) => ({ ...prev, [ticketId]: '' }));
      await loadClientData();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message || 'Erro ao enviar mensagem.' });
    } finally {
      setReplyBusyId(null);
    }
  }

  const latestApprovedPayment = payments.find(
    (p) => p.status === 'aprovado' || p.status === 'expirado'
  );

  const unreadUserNotifs = userNotifications.filter((n) => !n.readAt).length;

  const whatsappHref = siteConfig?.whatsapp
    ? `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(siteConfig.mensagem)}`
    : '#';

  const vipGroupLabel = siteConfig?.appearance?.vipGroupButtonLabel || 'ACESSAR GRUPO VIP';
  const heroImageUrl =
    siteConfig?.appearance?.heroImageUrl || '/src/assets/images/vip_card_emblem_1794936334763.jpg';
  const vipBannerUrl =
    siteConfig?.appearance?.vipBannerUrl || '/src/assets/images/vip_lounge_banner_1794936334758.jpg';

  const navItems: Array<{ key: ClientTab; label: string; shortLabel: string; icon: React.ReactNode }> = [
    { key: 'inicio', label: 'Início', shortLabel: 'Início', icon: <Home className="h-4 w-4" /> },
    { key: 'planos', label: 'Planos', shortLabel: 'Planos', icon: <Sparkles className="h-4 w-4" /> },
    { key: 'conta', label: 'Minha Conta', shortLabel: 'Conta', icon: <User className="h-4 w-4" /> },
    { key: 'suporte', label: 'Suporte', shortLabel: 'Suporte', icon: <LifeBuoy className="h-4 w-4" /> },
    { key: 'vip', label: 'Área VIP', shortLabel: 'VIP', icon: <Heart className="h-4 w-4" /> },
  ];

  const statusMetaBanner = (() => {
    switch (clientState) {
      case 'acesso_suspenso':
        return {
          tone: 'border-red-400/35 bg-red-950/30 text-red-100',
          icon: <AlertTriangle className="h-5 w-5 text-red-300 shrink-0" />,
          title: 'Acesso temporariamente suspenso',
          desc: 'Entre em contato com nosso atendimento oficial para verificar a situação do seu cadastro.',
          ctaLabel: 'Falar com suporte',
          ctaHref: whatsappHref,
        };
      case 'pagamento_aprovado':
        return {
          tone: 'border-emerald-400/35 bg-emerald-950/25 text-emerald-100',
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" />,
          title: siteConfig?.appearance?.approvedMessage || 'Pagamento confirmado · Acesso VIP liberado',
          desc: `Seu plano ${subscription.planName} está ativo. Solicite sua entrada no Grupo VIP pela Área VIP.`,
          ctaLabel: vipGroupLabel,
          ctaTab: 'vip' as ClientTab,
        };
      case 'assinatura_ativa':
        return {
          tone: 'border-emerald-400/30 bg-[#151e1c] text-emerald-100',
          icon: <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0" />,
          title: `Assinatura ${subscription.planName} ativa`,
          desc:
            subscription.planKey === 'vitalicio'
              ? 'Seu acesso vitalício está confirmado e permanente na plataforma.'
              : `Vigência válida até ${formatDate(subscription.expiresAt)} (${subscription.daysRemaining} dia(s) restante(s)).`,
          ctaLabel: 'Ir para Área VIP',
          ctaTab: 'vip' as ClientTab,
        };
      case 'assinatura_vencida':
        return {
          tone: 'border-amber-400/35 bg-amber-950/25 text-amber-100',
          icon: <Clock className="h-5 w-5 text-amber-300 shrink-0" />,
          title: 'Sua assinatura venceu',
          desc:
            siteConfig?.appearance?.expiredMessage ||
            'O período contratado expirou. Renove um plano para reativar imediatamente a Área VIP.',
          ctaLabel: 'Renovar plano',
          ctaTab: 'planos' as ClientTab,
        };
      case 'pagamento_pendente':
        return {
          tone: 'border-sky-400/35 bg-sky-950/25 text-sky-100',
          icon: <Clock className="h-5 w-5 text-sky-300 shrink-0" />,
          title:
            pendingPayment?.status === 'aguardando_pagamento'
              ? 'Cobrança aguardando confirmação de pagamento'
              : 'Comprovante em fila de análise administrativa',
          desc:
            pendingPayment?.status === 'aguardando_pagamento'
              ? `Referência ${pendingPayment.externalReference}. Já pagou? Verifique pelo Mercado Pago ou envie seu comprovante.`
              : `Referência ${pendingPayment?.externalReference}. Assim que o administrador confirmar, seu acesso VIP será liberado.`,
          ctaLabel: 'Acompanhar em Minha Conta',
          ctaTab: 'conta' as ClientTab,
        };
      default:
        return {
          tone: 'border-[#f06aa9]/30 bg-[#201025] text-[#fff7fb]',
          icon: <Sparkles className="h-5 w-5 text-[#f06aa9] shrink-0" />,
          title: 'Conta verificada · Escolha seu plano VIP',
          desc: 'Contrate o plano Semanal, Mensal ou Vitalício para liberar sua entrada no Grupo VIP da Nicolly.',
          ctaLabel: 'Ver planos disponíveis',
          ctaTab: 'planos' as ClientTab,
        };
    }
  })();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Strict 3-Zone Top Bar (56px mobile / 64px desktop) */}
      <header className="sticky top-0 z-30 h-14 sm:h-16 border-b border-white/10 bg-[#0e0711]/92 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onChangeTab('inicio')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#f06aa9] to-[#c83c82] text-white shadow-sm">
              <Heart className="h-4 w-4 fill-current" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-[#fff7fb]">
              {siteConfig?.appearance?.logoText || 'VIP da Nicolly'}
            </span>
          </button>

          {/* Zone 2: Concise single-line nav links */}
          <nav aria-label="Navegação do portal" className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onChangeTab(item.key)}
                className={`whitespace-nowrap shrink-0 border-b-2 py-1 transition-colors ${
                  activeTab === item.key
                    ? 'border-[#f06aa9] text-[#fff7fb]'
                    : 'border-transparent text-[#c6b1c0] hover:text-[#fff7fb]'
                }`}
              >
                {item.label}
              </button>
            ))}
            {user.role === 'admin' && (
              <button
                type="button"
                onClick={onGoAdmin}
                className="whitespace-nowrap shrink-0 border-b-2 border-transparent py-1 text-[#f06aa9] hover:border-[#f06aa9] transition-colors"
              >
                Painel Admin
              </button>
            )}
          </nav>

          {/* Zone 3: PWA Install + Sair + Mobile Menu */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={onLogout}
              className="hidden md:inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-[#fff7fb] hover:border-[#f06aa9]/60 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="flex md:hidden h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#170d1c] text-[#fff7fb]"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-white/10 bg-[#170d1c] px-4 py-4 md:hidden shadow-xl">
            <div className="flex flex-col gap-1.5">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onChangeTab(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex min-h-[44px] items-center gap-2.5 rounded-xl px-3.5 text-left text-sm font-medium ${
                    activeTab === item.key
                      ? 'bg-[#2a1530] text-[#fff7fb]'
                      : 'text-[#c6b1c0] hover:bg-white/[0.03]'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
              {user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onGoAdmin();
                  }}
                  className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-3.5 text-left text-sm font-semibold text-[#f06aa9]"
                >
                  <Shield className="h-4 w-4" />
                  Painel Administrativo
                </button>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="mt-2 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-medium text-[#fff7fb]"
              >
                <LogOut className="h-4 w-4" />
                Sair da conta
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 pb-24 sm:px-6 md:pb-12 lg:py-10">
        {siteConfig?.appearance?.showOfferBanner && siteConfig.appearance.offerBannerText && (
          <div className="mb-6 rounded-xl border border-[#f06aa9]/40 bg-[#2a1530]/80 px-4 py-3 text-center text-xs sm:text-sm font-medium text-[#fff7fb]">
            {siteConfig.appearance.offerBannerText}
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={`mb-6 flex items-start justify-between gap-4 rounded-xl border px-4 py-3.5 text-sm ${
              feedback.type === 'ok'
                ? 'border-emerald-400/30 bg-emerald-950/35 text-emerald-200'
                : 'border-red-400/30 bg-red-950/35 text-red-200'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs opacity-75 hover:opacity-100 shrink-0"
            >
              Fechar
            </button>
          </div>
        )}

        {/* INÍCIO TAB */}
        {activeTab === 'inicio' && (
          <div className="space-y-12">
            {/* Tailored Client Lifecycle Status Banner */}
            <section
              aria-label="Situação da sua conta"
              className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${statusMetaBanner.tone}`}
            >
              <div className="flex items-start gap-3.5">
                {statusMetaBanner.icon}
                <div>
                  <h2 className="text-sm font-semibold">{statusMetaBanner.title}</h2>
                  <p className="mt-1 text-xs leading-relaxed opacity-90">{statusMetaBanner.desc}</p>
                </div>
              </div>
              {'ctaHref' in statusMetaBanner && statusMetaBanner.ctaHref ? (
                <a
                  href={statusMetaBanner.ctaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-white/25 bg-black/25 px-4 text-xs font-semibold text-white hover:bg-black/40"
                >
                  {statusMetaBanner.ctaLabel}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => onChangeTab(statusMetaBanner.ctaTab!)}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-5 text-xs font-semibold text-white hover:brightness-110"
                >
                  <span>{statusMetaBanner.ctaLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </section>

            <section className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
              <div className="flex flex-col justify-center lg:col-span-7">
                <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">
                  Olá, {user.displayName.split(' ')[0]} · Área Autenticada
                </p>
                <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-[#fff7fb] sm:text-5xl [text-wrap:balance]">
                  Um espaço <em className="italic text-[#f06aa9]">exclusivo</em> e feito para você.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-[#d9c7d4]">
                  {siteConfig?.hero ||
                    'Um espaço exclusivo, íntimo e dedicado para quem deseja acompanhar conteúdos especiais e novidades.'}
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3.5">
                  {subscription.hasVipAccess ? (
                    <button
                      type="button"
                      onClick={() => onChangeTab('vip')}
                      className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c83c82]/20 transition-all hover:brightness-110"
                    >
                      <span>{vipGroupLabel}</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onChangeTab('planos')}
                      className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c83c82]/20 transition-all hover:brightness-110"
                    >
                      <span>Escolher plano VIP</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onChangeTab('conta')}
                    className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-white/15 bg-[#170d1c]/70 px-6 py-3 text-sm font-medium text-[#fff7fb] hover:border-[#f06aa9]/60 transition-colors"
                  >
                    Minha conta e comprovantes
                  </button>
                </div>

                <div className="mt-7 flex flex-wrap items-center gap-3 text-xs text-[#c6b1c0]">
                  <span>Pagamento via Mercado Pago</span>
                  <span aria-hidden="true">·</span>
                  <span>Validação no servidor</span>
                  <span aria-hidden="true">·</span>
                  <span>Acesso privado +18</span>
                </div>
              </div>

              {/* Membership Status Card */}
              <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#170d1c] p-6 sm:p-8 lg:col-span-5 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#f06aa9]/30 bg-[#100814]">
                    {!emblemImgError ? (
                      <img
                        src={heroImageUrl}
                        alt="Emblema VIP da Nicolly"
                        referrerPolicy="no-referrer"
                        onError={() => setEmblemImgError(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#f06aa9]">
                        <Heart className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#c6b1c0]">Cartão de Membro</p>
                    <h2 className="truncate font-display text-xl font-semibold text-[#fff7fb]">
                      {user.displayName}
                    </h2>
                    <p
                      className={`text-xs font-semibold ${
                        user.suspended
                          ? 'text-red-400'
                          : subscription.hasVipAccess
                          ? 'text-emerald-400'
                          : subscription.isExpired
                          ? 'text-red-300'
                          : 'text-[#f06aa9]'
                      }`}
                    >
                      {subscription.statusLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[#c6b1c0]">Plano atual</span>
                    <span className="font-medium text-[#fff7fb]">
                      {subscription.planName || 'Nenhum plano ativo'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#c6b1c0]">Validade</span>
                    <span className="font-mono-num tabular-nums text-[#fff7fb]">
                      {subscription.planKey === 'vitalicio'
                        ? 'Sem vencimento'
                        : subscription.expiresAt
                        ? formatDate(subscription.expiresAt)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#c6b1c0]">Área VIP</span>
                    <span
                      className={`font-medium ${
                        subscription.hasVipAccess ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {subscription.hasVipAccess ? 'Liberada' : 'Bloqueada'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 border-t border-white/10 pt-5">
                  {subscription.hasVipAccess ? (
                    <button
                      type="button"
                      onClick={() => onChangeTab('vip')}
                      className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#2a1530] px-4 py-2.5 text-sm font-medium text-[#fff7fb] hover:bg-[#381c40] transition-colors"
                    >
                      Abrir Área VIP e Grupo
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onChangeTab('planos')}
                      className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#f06aa9]/40 px-4 py-2.5 text-sm font-medium text-[#f8b3d3] hover:bg-[#f06aa9]/10 transition-colors"
                    >
                      Contratar assinatura
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Quick Plans Preview inside Início */}
            <PlansGrid
              siteConfig={siteConfig}
              loadingData={loadingData}
              checkoutBusy={checkoutBusy}
              appliedCoupon={appliedCoupon}
              onSelectPlan={handleStartCheckout}
            />
          </div>
        )}

        {/* PLANOS TAB */}
        {activeTab === 'planos' && (
          <div className="space-y-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">Assinaturas</p>
              <h1 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl">
                Escolha o seu plano VIP
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#c6b1c0]">
                {siteConfig?.appearance?.paymentText ||
                  'Cada contratação gera uma referência individual vinculada à sua conta. O acesso à Área VIP é liberado somente após confirmação oficial do Mercado Pago ou aprovação do comprovante pela administração.'}
              </p>
            </div>

            {/* Promotional Coupon Bar */}
            <form
              onSubmit={handleValidateCoupon}
              className="rounded-2xl border border-white/10 bg-[#170d1c] p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#fff7fb]">
                <Tag className="h-4 w-4 text-[#f06aa9] shrink-0" />
                <span>Possui um cupom promocional?</span>
              </div>
              <div className="flex flex-1 max-w-md items-center gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="EX: VIP10"
                  className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-[#100814] px-3.5 font-mono-num text-xs sm:text-sm uppercase text-[#fff7fb]"
                />
                <button
                  type="submit"
                  disabled={couponBusy}
                  className="min-h-[44px] rounded-xl bg-[#2a1530] px-4 text-xs font-semibold text-[#fff7fb] hover:bg-[#3a1c42] disabled:opacity-60"
                >
                  {couponBusy ? 'Validando...' : 'Aplicar'}
                </button>
                {appliedCoupon && (
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponInput('');
                      setCouponFeedback(null);
                    }}
                    className="min-h-[44px] rounded-xl border border-white/15 px-3 text-xs text-[#c6b1c0]"
                  >
                    Remover
                  </button>
                )}
              </div>
            </form>

            {couponFeedback && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs ${
                  couponFeedback.type === 'ok'
                    ? 'border-emerald-400/35 bg-emerald-950/30 text-emerald-200'
                    : 'border-red-400/35 bg-red-950/30 text-red-200'
                }`}
              >
                {couponFeedback.text}
              </div>
            )}

            <PlansGrid
              siteConfig={siteConfig}
              loadingData={loadingData}
              checkoutBusy={checkoutBusy}
              appliedCoupon={appliedCoupon}
              onSelectPlan={handleStartCheckout}
            />
          </div>
        )}

        {/* MINHA CONTA TAB */}
        {activeTab === 'conta' && (
          <div className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">
                  Conta e Cobranças
                </p>
                <h1 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb]">
                  Minha Conta
                </h1>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await loadClientData();
                  await onRefreshSession();
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#170d1c] px-4 py-2 text-xs font-medium text-[#fff7fb] hover:border-[#f06aa9]/60"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar status
              </button>
            </div>

            {/* Profile + Subscription Summary */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-6 lg:col-span-5 space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 text-sm font-semibold text-[#fff7fb]">
                    <User className="h-4 w-4 text-[#f06aa9]" />
                    <h2>Dados do Assinante</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingProfile((v) => !v)}
                    className="min-h-[36px] rounded-lg border border-white/15 px-3 text-xs font-medium text-[#f8b3d3] hover:border-[#f06aa9]/60"
                  >
                    {editingProfile ? 'Cancelar' : 'Editar perfil'}
                  </button>
                </div>

                {!editingProfile ? (
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4 border-b border-white/5 pb-2.5">
                      <dt className="text-[#c6b1c0]">Nome</dt>
                      <dd className="text-right font-medium text-[#fff7fb]">{user.displayName}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-white/5 pb-2.5">
                      <dt className="text-[#c6b1c0]">E-mail</dt>
                      <dd className="text-right text-[#fff7fb]">{user.email}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-white/5 pb-2.5">
                      <dt className="text-[#c6b1c0]">Telefone</dt>
                      <dd className="text-right font-mono-num tabular-nums text-[#fff7fb]">
                        {user.phone}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-[#c6b1c0]">Nascimento</dt>
                      <dd className="text-right font-mono-num tabular-nums text-[#fff7fb]">
                        {formatDate(user.birthDate)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <form onSubmit={handleSaveProfile} className="space-y-3">
                    <div>
                      <label className="block text-xs text-[#c6b1c0]">Nome completo</label>
                      <input
                        type="text"
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c6b1c0]">WhatsApp / Telefone</label>
                      <input
                        type="tel"
                        required
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(maskPhoneInput(e.target.value))}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 font-mono-num text-sm text-[#fff7fb]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="min-h-[44px] w-full rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-4 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {savingProfile ? 'Salvando alterações...' : 'Salvar dados do perfil'}
                    </button>
                  </form>
                )}

                {/* Self-service Password Change */}
                <form
                  onSubmit={handleChangeClientPassword}
                  className="border-t border-white/10 pt-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#e8d9e4]">
                    <KeyRound className="h-3.5 w-3.5 text-[#f06aa9]" />
                    <span>Alterar Senha de Acesso</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Senha atual"
                      autoComplete="current-password"
                      className="sm:col-span-2 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                    />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nova senha (mín. 6)"
                      autoComplete="new-password"
                      className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                    />
                    <input
                      type="password"
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirmar nova senha"
                      autoComplete="new-password"
                      className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="min-h-[42px] w-full rounded-xl border border-white/15 bg-[#2a1530] px-4 text-xs font-semibold text-[#fff7fb] hover:bg-[#3a1c42] disabled:opacity-60"
                  >
                    {savingPassword ? 'Atualizando senha...' : 'Atualizar minha senha'}
                  </button>
                </form>
              </section>

              <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-6 lg:col-span-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 text-sm font-semibold text-[#fff7fb]">
                      <Calendar className="h-4 w-4 text-[#f06aa9]" />
                      <h2>Situação da Assinatura</h2>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        subscription.hasVipAccess
                          ? 'text-emerald-400'
                          : subscription.isExpired || user.suspended
                          ? 'text-red-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {subscription.statusLabel}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-xl border border-white/5 bg-[#100814] p-3.5">
                      <p className="text-[11px] text-[#c6b1c0]">Plano</p>
                      <p className="mt-1 text-sm font-semibold text-[#fff7fb]">
                        {subscription.planName || '—'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-[#100814] p-3.5">
                      <p className="text-[11px] text-[#c6b1c0]">Data do pagamento</p>
                      <p className="mt-1 font-mono-num tabular-nums text-sm text-[#fff7fb]">
                        {latestApprovedPayment ? formatDate(latestApprovedPayment.createdAt) : '—'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-[#100814] p-3.5">
                      <p className="text-[11px] text-[#c6b1c0]">Início vigência</p>
                      <p className="mt-1 font-mono-num tabular-nums text-sm text-[#fff7fb]">
                        {formatDate(subscription.approvedAt)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-[#100814] p-3.5">
                      <p className="text-[11px] text-[#c6b1c0]">Vencimento</p>
                      <p className="mt-1 font-mono-num tabular-nums text-sm text-[#fff7fb]">
                        {subscription.planKey === 'vitalicio'
                          ? 'Vitalício'
                          : formatDate(subscription.expiresAt)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* VIP Group Access Button: Enabled ONLY when authorized */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
                  <div className="text-xs text-[#c6b1c0]">
                    {subscription.hasVipAccess ? (
                      subscription.daysRemaining !== null ? (
                        <span>
                          Acesso válido · Restam{' '}
                          <strong className="font-mono-num tabular-nums text-[#fff7fb]">
                            {subscription.daysRemaining} dia(s)
                          </strong>
                        </span>
                      ) : (
                        <span>Acesso vitalício ativo na plataforma.</span>
                      )
                    ) : (
                      <span>
                        O acesso ao grupo VIP é liberado somente com assinatura aprovada e vigente.
                      </span>
                    )}
                  </div>

                  {subscription.hasVipAccess ? (
                    <button
                      type="button"
                      onClick={() => onChangeTab('vip')}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-5 py-2.5 text-xs font-semibold text-white hover:brightness-110"
                    >
                      <span>{vipGroupLabel}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onChangeTab('planos')}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#f06aa9]/40 px-4 py-2 text-xs font-semibold text-[#f8b3d3]"
                    >
                      Contratar plano
                    </button>
                  )}
                </div>
              </section>
            </div>

            {/* Upload Payment Proof Section */}
            <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#fff7fb]">
                    <Upload className="h-4 w-4 text-[#f06aa9]" />
                    <h2>Enviar Comprovante de Pagamento</h2>
                  </div>
                  <p className="mt-1 text-xs text-[#c6b1c0]">
                    Aceita imagens (JPG, PNG, WebP) ou PDF até 10 MB. Armazenamento privado protegido.
                  </p>
                </div>
                {siteConfig?.whatsapp && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-[#fff7fb] hover:border-[#f06aa9]/60"
                  >
                    <MessageCircle className="h-4 w-4 text-[#f06aa9]" />
                    Atendimento WhatsApp {siteConfig.whatsappLabel}
                  </a>
                )}
              </div>

              <form onSubmit={handleUploadProof} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <label className="block text-xs font-medium text-[#e8d9e4]">
                    Vincular à cobrança ou plano
                  </label>
                  <select
                    value={proofPaymentId ? `pay:${proofPaymentId}` : `plan:${proofPlanKey}`}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.startsWith('pay:')) {
                        setProofPaymentId(v.slice(4));
                      } else {
                        setProofPaymentId('');
                        setProofPlanKey(v.slice(5) as PlanKey);
                      }
                    }}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                  >
                    <optgroup label="Nova solicitação via link externo">
                      <option value="plan:semanal">Novo comprovante — Plano Semanal (R$ 25,00)</option>
                      <option value="plan:mensal">Novo comprovante — Plano Mensal (R$ 50,00)</option>
                      <option value="plan:vitalicio">Novo comprovante — Plano Vitalício (R$ 200,00)</option>
                    </optgroup>
                    {payments.length > 0 && (
                      <optgroup label="Cobranças existentes">
                        {payments.map((p) => (
                          <option key={p.id} value={`pay:${p.id}`}>
                            {p.planKey.toUpperCase()} · {formatBrl(p.amountCents)} ·{' '}
                            {PAYMENT_STATUS_META[p.status]?.label || p.status}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-xs font-medium text-[#e8d9e4]">
                    Arquivo (JPG, PNG, WebP ou PDF)
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                    className="mt-1.5 block min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 py-2 text-xs text-[#e8d9e4] file:mr-3 file:rounded-lg file:border-0 file:bg-[#2a1530] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#fff7fb]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#e8d9e4]">
                    ID / Referência (opcional)
                  </label>
                  <input
                    type="text"
                    value={proofRefHint}
                    onChange={(e) => setProofRefHint(e.target.value)}
                    placeholder="Ex: E2E / Pix"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[#e8d9e4]">
                    Valor pago (opcional)
                  </label>
                  <input
                    type="text"
                    value={proofAmountHint}
                    onChange={(e) => setProofAmountHint(e.target.value)}
                    placeholder="50,00"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                  />
                </div>

                <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-4 pt-1">
                  <p className="text-xs text-[#c6b1c0]">
                    A liberação ocorre somente após verificação oficial ou conferência do administrador.
                  </p>
                  <button
                    type="submit"
                    disabled={uploadingProof}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{uploadingProof ? 'Enviando...' : 'Enviar comprovante'}</span>
                  </button>
                </div>
              </form>
            </section>

            {/* Payment History Table */}
            <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-6">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#fff7fb]">
                <CreditCard className="h-4 w-4 text-[#f06aa9]" />
                <h2>Histórico de Pagamentos e Comprovantes</h2>
              </div>

              {payments.length === 0 ? (
                <div className="mt-6 rounded-xl border border-white/10 bg-[#100814] p-8 text-center">
                  <p className="text-sm text-[#c6b1c0]">
                    Você ainda não possui pagamentos ou cobranças registradas.
                  </p>
                  <button
                    type="button"
                    onClick={() => onChangeTab('planos')}
                    className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#2a1530] px-5 py-2 text-xs font-semibold text-[#fff7fb]"
                  >
                    Conhecer planos disponíveis
                  </button>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-xs text-[#c6b1c0]">
                        <th className="py-3 pr-4 font-medium">Data</th>
                        <th className="py-3 pr-4 font-medium">Plano</th>
                        <th className="py-3 pr-4 font-medium">Valor</th>
                        <th className="py-3 pr-4 font-medium">Referência</th>
                        <th className="py-3 pr-4 font-medium">Situação</th>
                        <th className="py-3 pr-4 font-medium">Comprovantes</th>
                        <th className="py-3 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {payments.map((pay) => {
                        const meta = PAYMENT_STATUS_META[pay.status];
                        return (
                          <tr key={pay.id} className="hover:bg-white/[0.02]">
                            <td className="py-3.5 pr-4 font-mono-num tabular-nums text-xs text-[#d9c7d4]">
                              {formatDateTime(pay.createdAt)}
                            </td>
                            <td className="py-3.5 pr-4 font-medium capitalize text-[#fff7fb]">
                              {pay.planKey}
                            </td>
                            <td className="py-3.5 pr-4 font-mono-num tabular-nums text-[#fff7fb]">
                              {formatBrl(pay.amountCents)}
                            </td>
                            <td className="py-3.5 pr-4 font-mono-num text-xs text-[#c6b1c0]">
                              {pay.externalReference}
                            </td>
                            <td className={`py-3.5 pr-4 text-xs font-semibold ${meta.toneClass}`}>
                              {meta.label}
                              {pay.rejectionReason && (
                                <span className="block font-normal text-red-300/80">
                                  {pay.rejectionReason}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 pr-4 text-xs">
                              {pay.proofs && pay.proofs.length > 0 ? (
                                <div className="space-y-1">
                                  {pay.proofs.map((pr) => (
                                    <a
                                      key={pr.id}
                                      href={`/api/proofs/${pr.id}/file`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-[#f06aa9] hover:underline"
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                      <span className="max-w-[140px] truncate">{pr.originalFilename}</span>
                                      <span className="text-[#c6b1c0]">
                                        ({formatFileSize(pr.sizeBytes)})
                                      </span>
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[#8f7889]">Nenhum anexo</span>
                              )}
                            </td>
                            <td className="py-3.5 text-right">
                              <div className="inline-flex items-center gap-2">
                                {pay.checkoutUrl && pay.status === 'aguardando_pagamento' && (
                                  <a
                                    href={pay.checkoutUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-white/15 px-3 text-xs text-[#fff7fb] hover:border-[#f06aa9]"
                                  >
                                    Pagar
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                                {pay.status !== 'aprovado' &&
                                  pay.status !== 'expirado' &&
                                  pay.status !== 'cancelado' &&
                                  pay.status !== 'reembolsado' && (
                                    <button
                                      type="button"
                                      disabled={verifyBusyId === pay.id}
                                      onClick={() => handleVerifyMercadoPago(pay.id)}
                                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-[#f06aa9]/40 px-3 text-xs text-[#f8b3d3] hover:bg-[#f06aa9]/10 disabled:opacity-50"
                                    >
                                      {verifyBusyId === pay.id ? 'Consultando...' : 'Verificar MP'}
                                    </button>
                                  )}
                                {onOpenPaymentTrack && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenPaymentTrack(pay.externalReference)}
                                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-white/15 px-3 text-xs text-[#e8d9e4] hover:border-[#f06aa9]/60"
                                  >
                                    Acompanhar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* In-App Notifications + Theme & Communication Preferences */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-6 lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#fff7fb]">
                    <Bell className="h-4 w-4 text-[#f06aa9]" />
                    <h2>Central de Notificações</h2>
                    {unreadUserNotifs > 0 && (
                      <span className="rounded-md bg-[#f06aa9] px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-[#0e0711]">
                        {unreadUserNotifs}
                      </span>
                    )}
                  </div>
                  {unreadUserNotifs > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllNotifsRead}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-[#e8d9e4]"
                    >
                      <CheckCheck className="h-3.5 w-3.5 text-[#f06aa9]" />
                      Marcar todas
                    </button>
                  )}
                </div>

                {userNotifications.length === 0 ? (
                  <p className="rounded-xl border border-white/10 bg-[#100814] p-5 text-center text-xs text-[#c6b1c0]">
                    Nenhuma notificação registrada até o momento.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {userNotifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => !n.readAt && handleMarkOneNotifRead(n.id)}
                        className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                          n.readAt
                            ? 'border-white/10 bg-[#100814] text-[#c6b1c0]'
                            : 'border-[#f06aa9]/45 bg-[#221029] text-[#fff7fb]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold">{n.title}</span>
                          <span className="shrink-0 font-mono-num text-[11px] text-[#8f7889]">
                            {formatDateTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed opacity-90">{n.message}</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-6 lg:col-span-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#fff7fb]">
                  {theme === 'light' ? (
                    <Sun className="h-4 w-4 text-[#f06aa9]" />
                  ) : (
                    <Moon className="h-4 w-4 text-[#f06aa9]" />
                  )}
                  <h2>Tema e Preferências</h2>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-[#c6b1c0]">Aparência da interface</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={savingPrefs}
                      onClick={() => handleSavePreferences('dark')}
                      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-xs font-semibold ${
                        theme === 'dark'
                          ? 'border-[#f06aa9] bg-[#2a1530] text-white'
                          : 'border-white/15 bg-[#100814] text-[#c6b1c0]'
                      }`}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      Modo Escuro
                    </button>
                    <button
                      type="button"
                      disabled={savingPrefs}
                      onClick={() => handleSavePreferences('light')}
                      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-xs font-semibold ${
                        theme === 'light'
                          ? 'border-[#f06aa9] bg-[#2a1530] text-[#fff7fb]'
                          : 'border-white/15 bg-[#100814] text-[#c6b1c0]'
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      Modo Claro
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 border-t border-white/10 pt-4 text-xs">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#100814] p-3">
                    <span className="text-[#e8d9e4]">Avisos na central da conta</span>
                    <input
                      type="checkbox"
                      checked={prefInApp}
                      disabled={savingPrefs}
                      onChange={(e) => handleSavePreferences(undefined, e.target.checked, undefined)}
                      className="h-4 w-4 accent-[#f06aa9]"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#100814] p-3">
                    <span className="text-[#e8d9e4]">Receber avisos de renovação por e-mail</span>
                    <input
                      type="checkbox"
                      checked={prefEmailUpdates}
                      disabled={savingPrefs}
                      onChange={(e) => handleSavePreferences(undefined, undefined, e.target.checked)}
                      className="h-4 w-4 accent-[#f06aa9]"
                    />
                  </label>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* SUPORTE & CHAMADOS TAB */}
        {activeTab === 'suporte' && (
          <div className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">Atendimento</p>
                <h1 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb]">
                  Suporte e Chamados
                </h1>
                <p className="mt-2 text-sm text-[#c6b1c0]">
                  {siteConfig?.appearance?.supportHours ||
                    'Atendimento diário das 09h às 22h (horário de Brasília)'}
                </p>
              </div>
              {siteConfig?.whatsapp && (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#170d1c] px-4 text-xs font-semibold text-[#fff7fb] hover:border-[#f06aa9]/60"
                >
                  <MessageCircle className="h-4 w-4 text-[#f06aa9]" />
                  WhatsApp {siteConfig.whatsappLabel}
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <form
                onSubmit={handleCreateTicket}
                className="rounded-2xl border border-white/10 bg-[#170d1c] p-6 lg:col-span-5 space-y-4 self-start"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-[#fff7fb]">
                  <LifeBuoy className="h-4 w-4 text-[#f06aa9]" />
                  <h2>Abrir Novo Chamado</h2>
                </div>

                <div>
                  <label className="block text-xs text-[#c6b1c0]">Assunto</label>
                  <input
                    type="text"
                    required
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="Ex: Dúvida sobre confirmação do Pix"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-sm text-[#fff7fb]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#c6b1c0]">Categoria</label>
                    <select
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value as any)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                    >
                      <option value="pagamento">Pagamento / Comprovante</option>
                      <option value="acesso_vip">Grupo & Acesso VIP</option>
                      <option value="conta">Minha Conta</option>
                      <option value="outro">Outros assuntos</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#c6b1c0]">Prioridade</label>
                    <select
                      value={ticketPriority}
                      onChange={(e) => setTicketPriority(e.target.value as any)}
                      className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3 text-xs text-[#fff7fb]"
                    >
                      <option value="normal">Normal</option>
                      <option value="alta">Urgente</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#c6b1c0]">Mensagem</label>
                  <textarea
                    rows={4}
                    required
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    placeholder="Descreva sua solicitação ou informe a referência do pedido..."
                    className="mt-1 w-full rounded-xl border border-white/15 bg-[#100814] p-3 text-xs text-[#fff7fb]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={creatingTicket}
                  className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {creatingTicket ? 'Enviando chamado...' : 'Enviar Chamado'}
                </button>
              </form>

              <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-6 lg:col-span-7 space-y-4">
                <h2 className="font-display text-xl font-semibold text-[#fff7fb]">
                  Meus Chamados ({tickets.length})
                </h2>

                {tickets.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-[#100814] p-8 text-center text-xs text-[#c6b1c0]">
                    Você ainda não abriu nenhum chamado de atendimento.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {tickets.map((tk) => {
                      const st = SUPPORT_STATUS_META[tk.status];
                      return (
                        <article
                          key={tk.id}
                          className="rounded-xl border border-white/10 bg-[#100814] p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 pb-2.5">
                            <div>
                              <h3 className="text-sm font-semibold text-[#fff7fb]">{tk.subject}</h3>
                              <p className="text-[11px] text-[#c6b1c0]">
                                Categoria: <span className="capitalize">{tk.category.replace('_', ' ')}</span> ·{' '}
                                {formatDateTime(tk.updatedAt)}
                              </p>
                            </div>
                            <span className={`text-xs font-semibold ${st.toneClass}`}>{st.label}</span>
                          </div>

                          <div className="space-y-2 max-h-56 overflow-y-auto">
                            {tk.messages.map((m) => (
                              <div
                                key={m.id}
                                className={`rounded-xl p-3 text-xs ${
                                  m.senderRole === 'admin'
                                    ? 'border border-[#f06aa9]/35 bg-[#221029] text-[#fff7fb]'
                                    : 'border border-white/10 bg-[#170d1c] text-[#e8d9e4]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px] opacity-80">
                                  <span className="font-semibold">
                                    {m.senderName} {m.senderRole === 'admin' ? '(Equipe VIP)' : ''}
                                  </span>
                                  <span className="font-mono-num">{formatDateTime(m.createdAt)}</span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{m.message}</p>
                              </div>
                            ))}
                          </div>

                          {tk.status !== 'encerrado' && (
                            <div className="flex gap-2 pt-1">
                              <input
                                type="text"
                                value={replyDrafts[tk.id] || ''}
                                onChange={(e) =>
                                  setReplyDrafts((prev) => ({ ...prev, [tk.id]: e.target.value }))
                                }
                                placeholder="Escrever resposta neste chamado..."
                                className="min-h-[42px] flex-1 rounded-xl border border-white/15 bg-[#170d1c] px-3 text-xs text-[#fff7fb]"
                              />
                              <button
                                type="button"
                                disabled={replyBusyId === tk.id}
                                onClick={() => handleReplyTicket(tk.id)}
                                className="min-h-[42px] rounded-xl bg-[#2a1530] px-4 text-xs font-semibold text-[#fff7fb]"
                              >
                                {replyBusyId === tk.id ? '...' : 'Enviar'}
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ÁREA VIP TAB (Strictly backend-verified) */}
        {activeTab === 'vip' && (
          <div className="space-y-8">
            {loadingVip ? (
              <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-12 text-center text-sm text-[#c6b1c0]">
                Verificando validade da sua assinatura no servidor...
              </div>
            ) : vipData?.authorized && subscription.hasVipAccess ? (
              <div className="space-y-8">
                {/* Exclusive VIP Banner */}
                <div className="relative overflow-hidden rounded-2xl border border-[#f06aa9]/30 bg-[#170d1c] shadow-2xl">
                  <div className="relative aspect-[21/9] w-full max-h-[340px] bg-[#100814]">
                    {!loungeImgError ? (
                      <img
                        src={vipBannerUrl}
                        alt="Área VIP da Nicolly"
                        referrerPolicy="no-referrer"
                        onError={() => setLoungeImgError(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-r from-[#2c1230] to-[#120816]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#170d1c] via-[#0e0711]/55 to-transparent" />
                  </div>

                  <div className="relative p-6 sm:p-10">
                    <p className="text-xs font-semibold tracking-widest text-emerald-400">
                      {vipData.approvedMessage || 'Assinatura Confirmada · Acesso Autorizado'}
                    </p>
                    <h1 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl">
                      {vipData.vipTitle || 'Bem-vindo à Área VIP da Nicolly'}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#d9c7d4]">
                      {vipData.vipDescription ||
                        `Sua assinatura do plano ${subscription.planName} está ativa e verificada pelo servidor. Solicite sua entrada no grupo VIP abaixo com atendimento direto.`}
                    </p>

                    {vipData.groupRequestStatus && (
                      <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2 text-xs text-[#e8d9e4]">
                        <span>Status da entrada no Grupo VIP:</span>
                        <strong
                          className={
                            vipData.groupRequestStatus === 'aceito_no_grupo'
                              ? 'text-emerald-400'
                              : vipData.groupRequestStatus === 'recusado_no_grupo'
                              ? 'text-red-400'
                              : 'text-amber-300'
                          }
                        >
                          {vipData.groupRequestStatus === 'aceito_no_grupo'
                            ? 'Aceito no grupo pela Nicolly'
                            : vipData.groupRequestStatus === 'recusado_no_grupo'
                            ? 'Solicitação recusada — contate o suporte'
                            : 'Solicitação enviada via WhatsApp'}
                        </strong>
                      </div>
                    )}

                    <div className="mt-6 flex flex-wrap items-center gap-3.5">
                      <button
                        type="button"
                        disabled={groupRequestBusy}
                        onClick={handleRequestGroupEntry}
                        className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>
                          {groupRequestBusy ? 'Registrando solicitação...' : vipGroupLabel}
                        </span>
                      </button>

                      {groupRequestWaUrl && (
                        <a
                          href={groupRequestWaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-950/30 px-5 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-950/50"
                        >
                          <span>Enviar solicitação no WhatsApp da Nicolly</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}

                      {vipData.supportWhatsapp && (
                        <a
                          href={`https://wa.me/${vipData.supportWhatsapp}?text=${encodeURIComponent(
                            'Olá! Sou assinante VIP ativo e gostaria de falar com o suporte.'
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-medium text-[#fff7fb] hover:border-[#f06aa9]/60"
                        >
                          <MessageCircle className="h-4 w-4 text-[#f06aa9]" />
                          Suporte VIP ({vipData.supportWhatsappLabel})
                        </a>
                      )}
                    </div>

                    <p className="mt-4 text-xs text-[#c6b1c0]">
                      Por segurança e controle dos membros, o ingresso no Grupo VIP é liberado
                      diretamente pela Nicolly via WhatsApp após verificação da sua assinatura ativa.
                    </p>
                  </div>
                </div>

                {/* Active Membership Details */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-6">
                    <p className="text-xs text-[#c6b1c0]">Plano vigente</p>
                    <p className="mt-2 font-display text-2xl font-semibold text-[#fff7fb]">
                      {subscription.planName}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-6">
                    <p className="text-xs text-[#c6b1c0]">Início da liberação</p>
                    <p className="mt-2 font-mono-num tabular-nums text-xl font-medium text-[#fff7fb]">
                      {formatDate(subscription.approvedAt)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-6">
                    <p className="text-xs text-[#c6b1c0]">Validade</p>
                    <p className="mt-2 font-mono-num tabular-nums text-xl font-medium text-[#fff7fb]">
                      {subscription.planKey === 'vitalicio'
                        ? 'Vitalício (sem vencimento)'
                        : `${formatDate(subscription.expiresAt)} (${subscription.daysRemaining}d)`}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Strictly Blocked State when unsubscribed, suspended or expired */
              <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center sm:p-10 shadow-xl">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-[#f06aa9]/30 bg-[#f06aa9]/10 text-[#f06aa9]">
                  <Lock className="h-6 w-6" />
                </div>
                <h1 className="mt-5 font-display text-3xl font-semibold text-[#fff7fb]">
                  {user.suspended
                    ? 'Conta suspensa'
                    : subscription.isExpired
                    ? 'Sua assinatura venceu'
                    : 'Área VIP Bloqueada'}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-[#c6b1c0]">
                  {vipData?.error ||
                    'O acesso aos conteúdos e ao grupo VIP é liberado somente após confirmação real do pagamento e enquanto a assinatura estiver dentro do prazo de validade.'}
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={() => onChangeTab('planos')}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Ver planos disponíveis
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeTab('conta')}
                    className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-medium text-[#fff7fb]"
                  >
                    Enviar comprovante
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Fixed Thumb-Zone Bottom Bar (56px, Android optimized) */}
      <nav
        aria-label="Menu rápido do assinante"
        className="fixed bottom-0 left-0 right-0 z-30 grid h-14 grid-cols-5 border-t border-white/15 bg-[#120816]/95 backdrop-blur-md md:hidden"
      >
        {navItems.map((item) => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChangeTab(item.key)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-[#f06aa9]' : 'text-[#c6b1c0]'
              }`}
            >
              {item.icon}
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Checkout Modal */}
      {checkoutModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-white/15 bg-[#170d1c] p-6 sm:p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#f06aa9]">Checkout Individual</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-[#fff7fb]">
                  Plano {checkoutModal.planName} · {formatBrl(checkoutModal.amountCents)}
                </h2>
                {checkoutModal.couponCode && (checkoutModal.discountCents || 0) > 0 && (
                  <p className="mt-1 text-xs font-medium text-emerald-400">
                    Cupom {checkoutModal.couponCode}: de {formatBrl(checkoutModal.originalAmountCents || checkoutModal.amountCents)} por{' '}
                    {formatBrl(checkoutModal.amountCents)} (-{formatBrl(checkoutModal.discountCents || 0)})
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCheckoutModal(null)}
                aria-label="Fechar janela de pagamento"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#c6b1c0] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-[#100814] p-4 text-xs leading-relaxed text-[#d9c7d4]">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                <span className="text-[#c6b1c0]">Referência única:</span>
                <span className="font-mono-num font-medium text-[#fff7fb]">
                  {checkoutModal.externalReference}
                </span>
              </div>
              <p className="mt-2.5">{checkoutModal.notice}</p>
            </div>

            <div className="mt-6 space-y-3">
              <a
                href={checkoutModal.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white hover:brightness-110"
              >
                <span>Ir para pagamento no Mercado Pago</span>
                <ExternalLink className="h-4 w-4" />
              </a>

              {checkoutModal.checkoutUrl !== checkoutModal.fallbackLink && (
                <a
                  href={checkoutModal.fallbackLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-[#d9c7d4] hover:border-[#f06aa9]/60"
                >
                  Link alternativo do plano ({checkoutModal.fallbackLink})
                </a>
              )}

              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleVerifyMercadoPago(checkoutModal.paymentId)}
                  disabled={verifyBusyId === checkoutModal.paymentId}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-[#fff7fb] hover:border-[#f06aa9]"
                >
                  <Shield className="h-3.5 w-3.5 text-[#f06aa9]" />
                  {verifyBusyId === checkoutModal.paymentId
                    ? 'Verificando...'
                    : 'Já paguei · Verificar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutModal(null);
                    onChangeTab('conta');
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-medium text-[#fff7fb] hover:border-[#f06aa9]"
                >
                  <Upload className="h-3.5 w-3.5 text-[#f06aa9]" />
                  Enviar comprovante
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Footer */}
      <footer className="hidden md:block border-t border-white/10 px-4 py-6 text-xs text-[#c6b1c0] sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span>
            {siteConfig?.appearance?.footerText ||
              '© 2026 VIP da Nicolly · Exclusivo para maiores de 18 anos'}
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onOpenLegal('termos')}
              className="hover:text-[#f06aa9] transition-colors"
            >
              Termos de Uso
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onOpenLegal('privacidade')}
              className="hover:text-[#f06aa9] transition-colors"
            >
              Política de Privacidade
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

interface PlansGridProps {
  siteConfig: SiteConfig | null;
  loadingData: boolean;
  checkoutBusy: PlanKey | null;
  appliedCoupon: {
    code: string;
    results: Partial<Record<PlanKey, CouponValidationResult>>;
  } | null;
  onSelectPlan: (key: PlanKey) => void;
}

const PlansGrid: React.FC<PlansGridProps> = ({
  siteConfig,
  loadingData,
  checkoutBusy,
  appliedCoupon,
  onSelectPlan,
}) => {
  if (loadingData && !siteConfig) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((idx) => (
          <div key={idx} className="h-80 rounded-2xl border border-white/10 bg-[#170d1c]" />
        ))}
      </div>
    );
  }

  if (!siteConfig) return null;

  const order: Array<{
    key: PlanKey;
    kicker: string;
    cadence: string;
    desc: string;
    featured?: boolean;
    features: string[];
  }> = [
    {
      key: 'semanal',
      kicker: 'Experiência inicial',
      cadence: 'por 7 dias',
      desc: 'Ideal para conhecer o espaço VIP por uma semana completa.',
      features: [
        'Acesso completo à Área VIP por 7 dias',
        'Convite para o grupo VIP após confirmação',
        'Suporte direto com atendimento dedicado',
      ],
    },
    {
      key: 'mensal',
      kicker: 'Mais escolhido',
      cadence: 'por 30 dias',
      desc: 'Acesso contínuo durante 30 dias com renovação sob controle.',
      featured: true,
      features: [
        'Acesso completo à Área VIP por 30 dias',
        'Prioridade na conferência de comprovantes',
        'Convite exclusivo para o grupo VIP',
      ],
    },
    {
      key: 'vitalicio',
      kicker: 'Acesso definitivo',
      cadence: 'pagamento único',
      desc: 'Pague uma única vez e mantenha o acesso VIP sem vencimento.',
      features: [
        'Acesso vitalício sem data de expiração',
        'Todas as atualizações futuras incluídas',
        'Convite permanente ao grupo VIP',
      ],
    },
  ];

  return (
    <section aria-label="Planos disponíveis" className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {order
        .filter((item) => siteConfig.plans[item.key]?.active !== false)
        .map((item) => {
          const plan = siteConfig.plans[item.key];
          const kickerText = plan.offerBadge || item.kicker;
          const descText = plan.description || item.desc;
          const discountInfo = appliedCoupon?.results[item.key];
          return (
            <article
              key={item.key}
              className={`flex flex-col justify-between rounded-2xl border p-7 transition-colors ${
                item.featured
                  ? 'border-[#f06aa9]/70 bg-[#211228] shadow-xl shadow-[#f06aa9]/10'
                  : 'border-white/10 bg-[#170d1c]'
              }`}
            >
              <div>
                <p className="text-xs font-semibold tracking-wider text-[#f06aa9]">{kickerText}</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-[#fff7fb]">
                  Plano {plan.name}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#c6b1c0]">{descText}</p>

                <div className="my-6">
                  {discountInfo ? (
                    <div className="space-y-1">
                      <span className="font-mono-num text-xs line-through text-[#8f7889]">
                        R$ {plan.preco}
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-display font-mono-num tabular-nums text-4xl font-semibold text-emerald-400">
                          {formatBrl(discountInfo.finalAmountCents)}
                        </span>
                        <span className="text-xs text-[#c6b1c0]">{item.cadence}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-emerald-400">
                        Cupom {discountInfo.code} (-{formatBrl(discountInfo.discountCents)})
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="font-display font-mono-num tabular-nums text-4xl font-semibold text-[#fff7fb]">
                        R$ {plan.preco}
                      </span>
                      <span className="text-xs text-[#c6b1c0]">{item.cadence}</span>
                    </div>
                  )}
                </div>

                <ul className="space-y-2.5 border-t border-white/10 pt-5 text-sm text-[#e8d9e4]">
                  {item.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#f06aa9]" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 space-y-2.5">
                <button
                  type="button"
                  disabled={checkoutBusy === item.key}
                  onClick={() => onSelectPlan(item.key)}
                  className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                    item.featured
                      ? 'bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-white hover:brightness-110'
                      : 'bg-[#2a1530] text-[#fff7fb] hover:bg-[#381c40]'
                  } disabled:opacity-60`}
                >
                  <span>
                    {checkoutBusy === item.key
                      ? 'Gerando cobrança...'
                      : `Contratar Plano ${plan.name}`}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <a
                  href={plan.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 text-xs text-[#c6b1c0] hover:text-[#f06aa9] transition-colors"
                >
                  <span>Link direto Mercado Pago</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </article>
          );
        })}
    </section>
  );
};

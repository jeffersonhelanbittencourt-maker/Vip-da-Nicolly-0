import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  Heart,
  KeyRound,
  Lock,
  Menu,
  MessageCircle,
  Moon,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { apiRequest, maskPhoneInput } from './api.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import type {
  PublicPlanSummary,
  SiteAppearanceConfig,
  SubscriptionSummary,
  UserProfile,
} from './types.ts';

type AuthMode = 'login' | 'register' | 'forgot';

interface AuthGateProps {
  onAuthenticated: (user: UserProfile, subscription: SubscriptionSummary) => void;
  onOpenLegal: (page: 'termos' | 'privacidade') => void;
  onOpenAdminLogin: () => void;
  appearance?: SiteAppearanceConfig | null;
  planSummaries?: PublicPlanSummary[];
  supportWhatsapp?: string;
  supportWhatsappLabel?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  registrationEnabled?: boolean;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

const FAQ_ITEMS = [
  {
    q: 'Como funciona a assinatura e quando o acesso VIP é liberado?',
    a: 'Primeiro você cria sua conta gratuita ou faz login. Após escolher um plano dentro da área autenticada e concluir o pagamento no Mercado Pago, a liberação ocorre pela confirmação oficial do gateway ou após a conferência do comprovante pela administração.',
  },
  {
    q: 'Como entro no Grupo VIP após ter o pagamento aprovado?',
    a: 'Com sua assinatura ativa no servidor, acesse a aba Área VIP e toque no botão ACESSAR GRUPO VIP. Sua solicitação é registrada e você é direcionado diretamente para o WhatsApp oficial da Nicolly para confirmação e ingresso.',
  },
  {
    q: 'O envio de comprovante libera a Área VIP na hora?',
    a: 'Não. Por segurança contra fraudes, nenhum comprovante é aprovado automaticamente no momento do envio. Todo arquivo enviado fica armazenado em repositório privado e passa por conferência humana antes da liberação.',
  },
  {
    q: 'Posso usar pelo celular Android como aplicativo?',
    a: 'Sim. O VIP da Nicolly é um aplicativo web progressivo (PWA). Você pode tocar em Instalar App no topo da página ou adicionar à tela inicial pelo Chrome ou Samsung Internet para abrir em tela cheia.',
  },
  {
    q: 'O que acontece quando o plano Semanal ou Mensal vence?',
    a: 'Ao término dos 7 dias (Semanal) ou 30 dias (Mensal), o servidor bloqueia o acesso à Área VIP automaticamente até que você realize uma nova contratação. O plano Vitalício não possui data de expiração.',
  },
];

export const AuthGate: React.FC<AuthGateProps> = ({
  onAuthenticated,
  onOpenLegal,
  onOpenAdminLogin,
  appearance,
  planSummaries = [],
  supportWhatsapp = '554192387993',
  supportWhatsappLabel = '(41) 9238-7993',
  maintenanceMode = false,
  maintenanceMessage = '',
  registrationEnabled = true,
  theme = 'dark',
  onToggleTheme,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [heroImgError, setHeroImgError] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  // Register state
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);
  const [confirm18Plus, setConfirm18Plus] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState('');

  // Shared feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function switchMode(next: AuthMode) {
    setMode(next);
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  function handleSelectPublicPlan() {
    switchMode(registrationEnabled ? 'register' : 'login');
    const el = document.getElementById('acesso');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function calculateAgeClient(dobStr: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobStr);
    if (!match) return null;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const now = new Date();
    let age = now.getFullYear() - y;
    const md = now.getMonth() + 1 - m;
    if (md < 0 || (md === 0 && now.getDate() < d)) age -= 1;
    return age;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!identifier.trim() || !loginPassword) {
      setErrorMsg('Preencha seu e-mail (ou usuário) e sua senha.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{
        authenticated: boolean;
        user: UserProfile;
        subscription: SubscriptionSummary;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), password: loginPassword }),
      });
      onAuthenticated(res.user, res.subscription);
    } catch (err: any) {
      setErrorMsg(err.message || 'Não foi possível entrar na conta.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!registrationEnabled) {
      setErrorMsg('Novos cadastros estão temporariamente pausados pela administração.');
      return;
    }

    if (displayName.trim().length < 3) {
      setErrorMsg('Informe seu nome completo (mínimo 3 caracteres).');
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setErrorMsg('Informe um número de telefone válido com DDD.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Informe um endereço de e-mail válido.');
      return;
    }
    const age = calculateAgeClient(birthDate);
    if (age === null || age < 18) {
      setErrorMsg('Cadastro permitido apenas para maiores de 18 anos.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('A confirmação de senha não confere.');
      return;
    }
    if (!confirm18Plus) {
      setErrorMsg('Confirme que você possui 18 anos ou mais.');
      return;
    }
    if (!acceptTerms || !acceptPrivacy) {
      setErrorMsg('Aceite os Termos de Uso e a Política de Privacidade para continuar.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{
        authenticated: boolean;
        user: UserProfile;
        subscription: SubscriptionSummary;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          displayName: displayName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          birthDate,
          password,
          confirmPassword,
          confirm18Plus,
          acceptTerms,
          acceptPrivacy,
        }),
      });
      onAuthenticated(res.user, res.subscription);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao finalizar seu cadastro.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) {
      setErrorMsg('Informe um e-mail válido.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      setSuccessMsg(res.message);
    } catch (err: any) {
      setErrorMsg(err.message || 'Não foi possível solicitar a recuperação de senha.');
    } finally {
      setLoading(false);
    }
  }

  const brandName = appearance?.logoText || 'VIP da Nicolly';
  const heroTitle = appearance?.heroTitle || 'Acesso reservado exclusivamente a membros autenticados.';
  const heroSubtitle =
    appearance?.heroSubtitle ||
    'Entre na sua conta ou realize seu cadastro para conhecer os planos disponíveis, acompanhar pagamentos e acessar a Área VIP com segurança.';
  const heroImageUrl =
    appearance?.heroImageUrl || '/src/assets/images/vip_hero_editorial_1794936333061.jpg';
  const loginLabel = appearance?.loginButtonLabel || 'Entrar na minha conta';
  const registerLabel = appearance?.registerButtonLabel || 'Criar minha conta';

  const visiblePlans: PublicPlanSummary[] =
    planSummaries.length > 0
      ? planSummaries.filter((p) => p.active !== false)
      : [
          {
            key: 'semanal',
            name: 'Semanal',
            preco: '25,00',
            duracao: 7,
            active: true,
            offerBadge: 'Experiência inicial',
            description: 'Ideal para conhecer o espaço VIP por uma semana completa.',
          },
          {
            key: 'mensal',
            name: 'Mensal',
            preco: '50,00',
            duracao: 30,
            active: true,
            offerBadge: 'Mais escolhido',
            description: 'Acesso contínuo durante 30 dias com renovação sob controle.',
          },
          {
            key: 'vitalicio',
            name: 'Vitalício',
            preco: '200,00',
            duracao: 0,
            active: true,
            offerBadge: 'Acesso definitivo',
            description: 'Pague uma única vez e mantenha o acesso VIP sem vencimento.',
          },
        ];

  const navLinks = [
    { href: '#apresentacao', label: 'Apresentação' },
    { href: '#nicolly', label: 'Sobre a Nicolly' },
    { href: '#beneficios', label: 'Benefícios' },
    { href: '#planos', label: 'Planos' },
    { href: '#duvidas', label: 'Dúvidas' },
    { href: '#atendimento', label: 'Contato' },
  ];

  const supportWaHref = `https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(
    'Olá! Gostaria de tirar uma dúvida sobre a assinatura do VIP da Nicolly.'
  )}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* 1. CABEÇALHO (Strict 3-Zone Contract, single-line links, discrete ACESSO ADM) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0e0711]/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Zone 1: Brand */}
          <a href="#apresentacao" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#f06aa9] to-[#c83c82] text-white shadow-md shadow-[#c83c82]/25">
              <Heart className="h-4 w-4 fill-current" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-[#fff7fb]">
              {brandName}
            </span>
          </a>

          {/* Zone 2: Section Nav Links (Desktop) */}
          <nav aria-label="Navegação principal" className="hidden lg:flex items-center gap-6 text-xs font-medium text-[#d9c7d4]">
            {navLinks.map((lnk) => (
              <a
                key={lnk.href}
                href={lnk.href}
                className="whitespace-nowrap shrink-0 py-1 hover:text-[#f06aa9] transition-colors"
              >
                {lnk.label}
              </a>
            ))}
          </nav>

          {/* Zone 3: PWA Install + ACESSO ADM + Mobile Menu */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <PWAInstallButton compact />
            </div>
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#f06aa9]/45 bg-[#241028] px-3.5 py-2 text-xs font-semibold tracking-wide text-[#f8b3d3] hover:bg-[#341639] transition-colors whitespace-nowrap shrink-0"
            >
              <Shield className="h-3.5 w-3.5 text-[#f06aa9]" />
              <span>ACESSO ADM</span>
            </button>
            <button
              type="button"
              aria-label={mobileNavOpen ? 'Fechar navegação' : 'Abrir navegação'}
              onClick={() => setMobileNavOpen((v) => !v)}
              className="flex lg:hidden h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-[#170d1c] text-[#fff7fb]"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="border-t border-white/10 bg-[#170d1c] px-4 py-4 lg:hidden">
            <nav className="flex flex-col gap-1">
              {navLinks.map((lnk) => (
                <a
                  key={lnk.href}
                  href={lnk.href}
                  onClick={() => setMobileNavOpen(false)}
                  className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-medium text-[#e8d9e4] hover:bg-[#2a1530]"
                >
                  {lnk.label}
                </a>
              ))}
            </nav>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              <PWAInstallButton compact />
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  onOpenAdminLogin();
                }}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#f06aa9]/45 bg-[#241028] px-3.5 text-xs font-semibold text-[#f8b3d3]"
              >
                <Shield className="h-3.5 w-3.5 text-[#f06aa9]" />
                <span>ACESSO ADM</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* Top Banners (Maintenance / Custom Offer) */}
        {(maintenanceMode || (appearance?.showOfferBanner && appearance.offerBannerText)) && (
          <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 space-y-3">
            {maintenanceMode && (
              <div
                role="alert"
                className="rounded-xl border border-amber-400/40 bg-amber-950/35 px-4 py-3 text-xs sm:text-sm text-amber-200"
              >
                <strong>Aviso de Manutenção:</strong>{' '}
                {maintenanceMessage ||
                  'Plataforma em manutenção programada. Administradores podem acessar normalmente via ACESSO ADM.'}
              </div>
            )}
            {appearance?.showOfferBanner && appearance.offerBannerText && (
              <div className="rounded-xl border border-[#f06aa9]/40 bg-[#2a1530]/85 px-4 py-2.5 text-center text-xs sm:text-sm font-medium text-[#fff7fb]">
                {appearance.offerBannerText}
              </div>
            )}
          </div>
        )}

        {/* 2. APRESENTAÇÃO VIP + PORTAL DE AUTENTICAÇÃO OBRIGATÓRIO */}
        <section id="apresentacao" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
          <div className="grid w-full grid-cols-1 items-stretch overflow-hidden rounded-2xl border border-white/10 bg-[#170d1c]/95 shadow-2xl lg:grid-cols-12">
            {/* Editorial Presentation */}
            <div className="relative flex flex-col justify-between border-b border-white/10 p-6 sm:p-10 lg:col-span-6 lg:border-b-0 lg:border-r">
              <div>
                <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">
                  Espaço Exclusivo +18
                </p>
                <h1 className="mt-3 max-w-md font-display text-3xl font-semibold leading-tight text-[#fff7fb] sm:text-4xl [text-wrap:balance]">
                  {heroTitle}
                </h1>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-[#d9c7d4] sm:text-base">
                  {heroSubtitle}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href="#planos"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-[#100814] px-4 py-2 text-xs font-semibold text-[#fff7fb] hover:border-[#f06aa9]/60 transition-colors"
                  >
                    <span>Ver planos disponíveis</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#f06aa9]" />
                  </a>
                  {onToggleTheme && (
                    <button
                      type="button"
                      onClick={onToggleTheme}
                      aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2 text-xs font-medium text-[#e8d9e4] hover:border-[#f06aa9]/60 transition-colors"
                    >
                      {theme === 'dark' ? (
                        <Sun className="h-3.5 w-3.5 text-[#f06aa9]" />
                      ) : (
                        <Moon className="h-3.5 w-3.5 text-[#f06aa9]" />
                      )}
                      <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
                    </button>
                  )}
                  <div className="sm:hidden">
                    <PWAInstallButton compact />
                  </div>
                </div>
              </div>

              {/* 16:9 Editorial Image Frame */}
              <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-[#120816]">
                {!heroImgError ? (
                  <img
                    src={heroImageUrl}
                    alt="Ambiente editorial exclusivo VIP da Nicolly"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#2d132f] to-[#120816] p-6 text-center">
                    <Heart className="h-8 w-8 text-[#f06aa9]" />
                    <span className="mt-2 font-display text-lg text-[#fff7fb]">{brandName}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0711]/90 via-[#0e0711]/25 to-transparent" />
                <div className="vip-hero-overlay absolute bottom-3.5 left-4 right-4 flex flex-wrap items-center gap-2 text-xs text-[#f5dce9]">
                  <Lock className="h-3.5 w-3.5 text-[#f06aa9]" />
                  <span>Acesso autenticado</span>
                  <span aria-hidden="true">·</span>
                  <span>Mercado Pago</span>
                  <span aria-hidden="true">·</span>
                  <span>Privacidade LGPD</span>
                </div>
              </div>
            </div>

            {/* Auth Form Portal */}
            <div id="acesso" className="flex flex-col justify-center p-6 sm:p-10 lg:col-span-6">
              <div className="mb-6 space-y-2.5">
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#100814] p-1">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className={`min-h-[44px] rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                      mode === 'login'
                        ? 'bg-[#2a1530] text-[#fff7fb]'
                        : 'text-[#c6b1c0] hover:text-[#fff7fb]'
                    }`}
                  >
                    {loginLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className={`min-h-[44px] rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                      mode === 'register'
                        ? 'bg-[#2a1530] text-[#fff7fb]'
                        : 'text-[#c6b1c0] hover:text-[#fff7fb]'
                    }`}
                  >
                    {registerLabel}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onOpenAdminLogin}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#f06aa9]/35 bg-[#1a0b1f] px-4 text-xs font-semibold tracking-wider text-[#f8b3d3] hover:border-[#f06aa9] hover:bg-[#2a1530] transition-colors"
                >
                  <Shield className="h-3.5 w-3.5 text-[#f06aa9]" />
                  <span>ACESSO ADM</span>
                </button>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="mb-5 rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-sm text-red-200"
                >
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div
                  role="status"
                  className="mb-5 rounded-xl border border-emerald-400/35 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200"
                >
                  {successMsg}
                </div>
              )}

              {/* LOGIN */}
              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4" noValidate>
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-[#fff7fb]">
                      Bem-vindo de volta
                    </h2>
                    <p className="mt-1 text-sm text-[#c6b1c0]">
                      Informe seu e-mail cadastrado para acessar seus planos e a Área VIP.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="login-id" className="block text-xs font-medium text-[#e8d9e4]">
                      E-mail ou usuário
                    </label>
                    <input
                      id="login-id"
                      type="text"
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="seu@email.com"
                      className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2.5 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="login-pass" className="block text-xs font-medium text-[#e8d9e4]">
                        Senha
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs font-medium text-[#f06aa9] hover:text-[#f89ec8] transition-colors"
                      >
                        Esqueci minha senha
                      </button>
                    </div>
                    <div className="relative mt-1.5">
                      <input
                        id="login-pass"
                        type={showLoginPass ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Digite sua senha"
                        className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2.5 pr-11 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPass((v) => !v)}
                        aria-label={showLoginPass ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-0 top-0 flex h-[44px] w-[44px] items-center justify-center text-[#c6b1c0] hover:text-[#fff7fb]"
                      >
                        {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c83c82]/25 transition-all hover:brightness-110 disabled:opacity-60"
                  >
                    <span>{loading ? 'Verificando acesso...' : loginLabel}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div className="border-t border-white/10 pt-4 text-xs text-[#c6b1c0]">
                    Ainda não tem cadastro?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('register')}
                      className="font-semibold text-[#f06aa9] hover:underline"
                    >
                      Criar uma conta gratuita
                    </button>
                  </div>
                </form>
              )}

              {/* REGISTER */}
              {mode === 'register' && (
                <form onSubmit={handleRegister} className="space-y-4" noValidate>
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-[#fff7fb]">
                      Criar conta VIP
                    </h2>
                    <p className="mt-1 text-sm text-[#c6b1c0]">
                      Preencha seus dados reais (+18 anos) para habilitar a contratação de planos.
                    </p>
                  </div>

                  {!registrationEnabled && (
                    <div className="rounded-xl border border-amber-400/35 bg-amber-950/35 px-4 py-3 text-xs text-amber-200">
                      Novos cadastros estão temporariamente pausados pela administração.
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="reg-name" className="block text-xs font-medium text-[#e8d9e4]">
                        Nome completo
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        autoComplete="name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Seu nome completo"
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-phone" className="block text-xs font-medium text-[#e8d9e4]">
                        Telefone (WhatsApp)
                      </label>
                      <input
                        id="reg-phone"
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
                        placeholder="(41) 99999-9999"
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-birth" className="block text-xs font-medium text-[#e8d9e4]">
                        Nascimento (+18)
                      </label>
                      <input
                        id="reg-birth"
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2 text-sm text-[#fff7fb] focus:border-[#f06aa9] focus:outline-none"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="reg-email" className="block text-xs font-medium text-[#e8d9e4]">
                        E-mail
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="reg-pass" className="block text-xs font-medium text-[#e8d9e4]">
                        Senha (mín. 6)
                      </label>
                      <div className="relative mt-1">
                        <input
                          id="reg-pass"
                          type={showRegPass ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Crie uma senha"
                          className="min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2 pr-10 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPass((v) => !v)}
                          aria-label={showRegPass ? 'Ocultar senha' : 'Mostrar senha'}
                          className="absolute right-0 top-0 flex h-[44px] w-[40px] items-center justify-center text-[#c6b1c0] hover:text-[#fff7fb]"
                        >
                          {showRegPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reg-confirm" className="block text-xs font-medium text-[#e8d9e4]">
                        Confirmar senha
                      </label>
                      <input
                        id="reg-confirm"
                        type={showRegPass ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1 text-xs text-[#d9c7d4]">
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={confirm18Plus}
                        onChange={(e) => setConfirm18Plus(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#f06aa9]"
                      />
                      <span>Confirmo ter 18 anos de idade ou mais.</span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#f06aa9]"
                      />
                      <span>
                        Li e aceito os{' '}
                        <button
                          type="button"
                          onClick={() => onOpenLegal('termos')}
                          className="font-medium text-[#f06aa9] underline hover:text-[#f89ec8]"
                        >
                          Termos de Uso
                        </button>
                        .
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={acceptPrivacy}
                        onChange={(e) => setAcceptPrivacy(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-[#f06aa9]"
                      />
                      <span>
                        Li e concordo com a{' '}
                        <button
                          type="button"
                          onClick={() => onOpenLegal('privacidade')}
                          className="font-medium text-[#f06aa9] underline hover:text-[#f89ec8]"
                        >
                          Política de Privacidade (LGPD)
                        </button>
                        .
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c83c82]/25 transition-all hover:brightness-110 disabled:opacity-60"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>{loading ? 'Criando conta...' : `${registerLabel} e continuar`}</span>
                  </button>
                </form>
              )}

              {/* FORGOT PASSWORD */}
              {mode === 'forgot' && (
                <form onSubmit={handleForgot} className="space-y-5" noValidate>
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-[#fff7fb]">
                      Recuperar senha
                    </h2>
                    <p className="mt-1 text-sm text-[#c6b1c0]">
                      Informe o e-mail da sua conta para solicitar a redefinição de senha.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="forgot-email" className="block text-xs font-medium text-[#e8d9e4]">
                      E-mail cadastrado
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="mt-1.5 min-h-[44px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 py-2.5 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
                  >
                    <KeyRound className="h-4 w-4" />
                    <span>{loading ? 'Enviando solicitação...' : 'Solicitar recuperação'}</span>
                  </button>

                  <div className="border-t border-white/10 pt-4 text-xs text-[#c6b1c0]">
                    Lembrou a senha?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-semibold text-[#f06aa9] hover:underline"
                    >
                      Voltar para o login
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* APRESENTAÇÃO DA NICOLLY */}
        <section id="nicolly" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <div className="grid grid-cols-1 gap-6 overflow-hidden rounded-2xl border border-white/10 bg-[#170d1c]/90 p-6 sm:p-10 lg:grid-cols-12 items-center">
            <div className="lg:col-span-7 space-y-4">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest text-[#f06aa9]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Curadoria VIP</span>
              </p>
              <h2 className="font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl [text-wrap:balance]">
                Sobre a Nicolly e a Comunidade Privada
              </h2>
              <p className="text-sm leading-relaxed text-[#d9c7d4] sm:text-base">
                {appearance?.welcomeMessage ||
                  'O VIP da Nicolly nasceu para reunir assinantes em um ambiente acolhedor, reservado e organizado — com entrada assistida, controle transparente de vigência e atendimento direto sem intermediários.'}
              </p>
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-[#100814] p-3.5">
                  <p className="font-semibold text-[#fff7fb]">Ingresso Verificado</p>
                  <p className="mt-1 text-[#c6b1c0]">Entrada no grupo confirmada diretamente pela Nicolly.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#100814] p-3.5">
                  <p className="font-semibold text-[#fff7fb]">Vigência Clara</p>
                  <p className="mt-1 text-[#c6b1c0]">Acompanhe dias restantes, recibos e renovações na conta.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#100814] p-3.5">
                  <p className="font-semibold text-[#fff7fb]">Canal de Suporte</p>
                  <p className="mt-1 text-[#c6b1c0]">Chamados internos e WhatsApp oficial sempre acessíveis.</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[#f06aa9]/25 bg-[#100814]">
                <img
                  src={
                    appearance?.vipBannerUrl ||
                    '/src/assets/images/vip_lounge_banner_1794936334758.jpg'
                  }
                  alt="Espaço VIP da Nicolly"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0711]/85 via-transparent to-transparent" />
                <div className="vip-hero-overlay absolute bottom-4 left-4 right-4 text-xs">
                  <p className="font-display text-lg font-semibold text-[#fff7fb]">
                    {appearance?.vipTitle || 'Ambiente Privado +18'}
                  </p>
                  <p className="text-[#e8d9e4]">Acesso exclusivo para assinantes autenticados.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. BENEFÍCIOS */}
        <section id="beneficios" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">Benefícios Reais</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl [text-wrap:balance]">
              Estrutura privada pensada para sua segurança e comodidade.
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <UserCheck className="h-5 w-5 text-[#f06aa9]" />,
                title: 'Conta Exclusiva +18',
                desc: 'Cada assinatura é vinculada ao seu perfil autenticado com proteção de sessão HttpOnly.',
              },
              {
                icon: <CreditCard className="h-5 w-5 text-[#f06aa9]" />,
                title: 'Checkout Mercado Pago',
                desc: 'Referência individual por contratação e consulta direta ao status oficial de pagamento.',
              },
              {
                icon: <FileCheck2 className="h-5 w-5 text-[#f06aa9]" />,
                title: 'Comprovantes Protegidos',
                desc: 'Envie imagem ou PDF em armazenamento privado para conferência segura da equipe.',
              },
              {
                icon: <MessageCircle className="h-5 w-5 text-[#f06aa9]" />,
                title: 'Ingresso VIP com a Nicolly',
                desc: 'Solicitação registrada no sistema com atendimento direto pelo WhatsApp oficial.',
              },
            ].map((item) => (
              <article
                key={item.title}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#170d1c]/85 p-6"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#f06aa9]/25 bg-[#241028]">
                  {item.icon}
                </div>
                <div className="mt-5">
                  <h3 className="font-display text-lg font-semibold text-[#fff7fb]">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#c6b1c0]">{item.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 4. PLANOS (RESUMO PÚBLICO TRANSPARENTE — CHECKOUT PROTEGIDO APÓS LOGIN) */}
        <section id="planos" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">Planos VIP</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl">
                Escolha o período ideal para você
              </h2>
              <p className="mt-2 text-sm text-[#c6b1c0]">
                Os links de pagamento individuais são liberados com segurança logo após você entrar na sua conta.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {visiblePlans.map((p) => {
              const featured = p.key === 'mensal';
              const cadence =
                p.key === 'vitalicio' || p.duracao === 0
                  ? 'pagamento único'
                  : `por ${p.duracao} dias`;
              return (
                <article
                  key={p.key}
                  className={`flex flex-col justify-between rounded-2xl border p-7 ${
                    featured
                      ? 'border-[#f06aa9]/65 bg-[#211228]'
                      : 'border-white/10 bg-[#170d1c]/90'
                  }`}
                >
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-[#f06aa9]">
                      {p.offerBadge || (featured ? 'Mais escolhido' : 'Plano VIP')}
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-semibold text-[#fff7fb]">
                      Plano {p.name}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#c6b1c0]">
                      {p.description || 'Acesso autenticado à Área VIP e ingresso assistido.'}
                    </p>

                    <div className="my-6 flex items-baseline gap-2">
                      <span className="font-display font-mono-num text-4xl font-semibold text-[#fff7fb]">
                        R$ {p.preco}
                      </span>
                      <span className="text-xs text-[#c6b1c0]">{cadence}</span>
                    </div>

                    <ul className="space-y-2 border-t border-white/10 pt-5 text-xs text-[#e8d9e4]">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-[#f06aa9]" />
                        <span>
                          {p.key === 'vitalicio'
                            ? 'Acesso vitalício sem expiração'
                            : `Validade automática de ${p.duracao} dias`}
                        </span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-[#f06aa9]" />
                        <span>Conferência de pagamento pelo servidor</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-[#f06aa9]" />
                        <span>Acesso ao Grupo VIP via WhatsApp</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectPublicPlan}
                    className={`mt-7 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all ${
                      featured
                        ? 'bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-white shadow-lg shadow-[#c83c82]/25 hover:brightness-110'
                        : 'bg-[#2a1530] text-[#fff7fb] hover:bg-[#381c40]'
                    }`}
                  >
                    <span>Criar conta para contratar</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {/* 5. COMO FUNCIONA */}
        <section id="como-funciona" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">Passo a Passo</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl">
              Como funciona do cadastro ao Grupo VIP
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                num: '01.',
                title: 'Cadastre-se (+18)',
                desc: 'Crie sua conta com e-mail, WhatsApp e confirmação de maioridade em menos de 1 minuto.',
              },
              {
                num: '02.',
                title: 'Escolha o plano',
                desc: 'Dentro do portal autenticado, gere seu checkout individual no plano Semanal, Mensal ou Vitalício.',
              },
              {
                num: '03.',
                title: 'Pagamento verificado',
                desc: 'Conclua via Mercado Pago ou envie o comprovante na área Minha Conta para conferência segura.',
              },
              {
                num: '04.',
                title: 'Entre no Grupo VIP',
                desc: 'Com o acesso liberado, toque em ACESSAR GRUPO VIP para falar direto com a Nicolly no WhatsApp.',
              },
            ].map((step) => (
              <div
                key={step.num}
                className="rounded-2xl border border-white/10 bg-[#170d1c]/80 p-6"
              >
                <span className="font-mono-num text-xl font-bold text-[#f06aa9]">{step.num}</span>
                <h3 className="mt-3 font-display text-lg font-semibold text-[#fff7fb]">
                  {step.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#c6b1c0]">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 6. PAGAMENTO SEGURO */}
        <section id="pagamento-seguro" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="rounded-2xl border border-[#f06aa9]/25 bg-[#1a0d20] p-6 sm:p-10">
            <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 space-y-3">
                <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">
                  Transparência & Proteção
                </p>
                <h2 className="font-display text-2xl font-semibold text-[#fff7fb] sm:text-3xl">
                  Pagamento Seguro com Referência Única
                </h2>
                <p className="text-sm leading-relaxed text-[#d9c7d4]">
                  {appearance?.paymentText ||
                    'Cada contratação gera uma referência individual vinculada à sua conta. O acesso à Área VIP é liberado somente após confirmação oficial do Mercado Pago ou aprovação do comprovante pela administração.'}
                </p>
              </div>
              <div className="lg:col-span-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#100814] p-5 text-xs text-[#e8d9e4]">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>Validação no servidor sem falsas confirmações</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Lock className="h-4 w-4 shrink-0 text-[#f06aa9]" />
                  <span>Comprovantes salvos em storage privado</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-[#f06aa9]" />
                  <span>Vigência automática (7d, 30d ou Vitalício)</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. DÚVIDAS FREQUENTES */}
        <section id="duvidas" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">Dúvidas Frequentes</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl">
              Perguntas sobre acesso e assinatura
            </h2>
          </div>

          <div className="mt-8 space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={item.q}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-[#170d1c]"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-[#fff7fb] hover:bg-white/[0.02]"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#f06aa9] transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-white/5 px-5 py-4 text-xs sm:text-sm leading-relaxed text-[#c6b1c0]">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 8. ATENDIMENTO OFICIAL */}
        <section id="atendimento" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-white/10 bg-[#170d1c] p-6 sm:flex-row sm:items-center sm:p-10">
            <div className="max-w-xl space-y-2">
              <p className="text-xs font-semibold tracking-widest text-[#f06aa9]">
                Canal Verificado
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#fff7fb] sm:text-3xl">
                {appearance?.supportTitle || 'Atendimento Oficial VIP'}
              </h2>
              <p className="text-sm leading-relaxed text-[#d9c7d4]">
                {appearance?.supportDescription ||
                  'Dúvidas sobre planos, validação de comprovantes ou entrada no Grupo VIP? Fale diretamente com nossa equipe pelo WhatsApp oficial.'}
              </p>
              <p className="text-xs text-[#c6b1c0]">
                {appearance?.supportHours ||
                  'Atendimento diário das 09h às 22h (horário de Brasília)'}
              </p>
            </div>

            <a
              href={supportWaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c83c82]/25 hover:brightness-110"
            >
              <MessageCircle className="h-4 w-4" />
              <span>WhatsApp {supportWhatsappLabel}</span>
            </a>
          </div>
        </section>
      </main>

      {/* 9 & 10. RODAPÉ, TERMOS DE USO E PRIVACIDADE */}
      <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-[#c6b1c0]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span>
            {appearance?.footerText ||
              '© 2026 VIP da Nicolly · Conteúdo exclusivo para maiores de 18 anos'}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-4">
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
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="font-medium text-[#f06aa9] hover:underline transition-colors"
            >
              Área Administrativa
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

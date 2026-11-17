/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { AuthGate } from './AuthGate.tsx';
import { AdminAuthGate } from './AdminAuthGate.tsx';
import { ClientPortal, type ClientTab } from './ClientPortal.tsx';
import { AdminDashboard } from './AdminDashboard.tsx';
import { NotFoundPage, PrivacyPage, TermsPage, UnauthorizedPage } from './LegalPages.tsx';
import { PaymentResultPage } from './PaymentResultPage.tsx';
import { OfflineBanner } from './PWAInstallButton.tsx';
import { apiRequest, applyDocumentTheme, getSavedTheme } from './api.ts';
import type {
  PublicPlanSummary,
  SiteAppearanceConfig,
  SubscriptionSummary,
  UserProfile,
} from './types.ts';

function normalizePath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/index.html') return '/';
  if (clean === '/admin.html') return '/admin';
  if (clean === '/termos.html') return '/termos';
  if (clean === '/privacidade.html') return '/privacidade';
  return clean;
}

const KNOWN_AUTH_PATHS = new Set(['/', '/inicio', '/planos', '/conta', '/suporte', '/vip', '/admin']);

function parsePaymentRoute(
  pathname: string,
  search: string
): { kind: 'tracking' | 'aprovado' | 'pendente' | 'recusado'; refOrId: string | null } | null {
  const params = new URLSearchParams(search);
  const queryRef = params.get('ref') || params.get('external_reference');
  if (pathname === '/pagamento/aprovado') {
    return { kind: 'aprovado', refOrId: queryRef };
  }
  if (pathname === '/pagamento/pendente') {
    return { kind: 'pendente', refOrId: queryRef };
  }
  if (pathname === '/pagamento/recusado') {
    return { kind: 'recusado', refOrId: queryRef };
  }
  if (pathname === '/pagamento') {
    return { kind: 'tracking', refOrId: queryRef };
  }
  if (pathname.startsWith('/pagamento/')) {
    const seg = pathname.slice('/pagamento/'.length).split('/')[0];
    return { kind: 'tracking', refOrId: queryRef || seg || null };
  }
  return null;
}

function applyDynamicFaviconAndTheme(appearance: SiteAppearanceConfig, currentTheme: 'dark' | 'light') {
  const root = document.documentElement;
  if (currentTheme === 'dark') {
    if (appearance.primaryColor) root.style.setProperty('--vip-pink', appearance.primaryColor);
    if (appearance.secondaryColor) root.style.setProperty('--vip-pink-deep', appearance.secondaryColor);
    if (appearance.backgroundColor) root.style.setProperty('--vip-bg', appearance.backgroundColor);
  } else {
    root.style.removeProperty('--vip-pink');
    root.style.removeProperty('--vip-pink-deep');
    root.style.removeProperty('--vip-bg');
  }

  if (appearance.siteName) {
    document.title = `${appearance.siteName} — Área Exclusiva de Membros`;
  }

  const favColor = appearance.faviconColor || appearance.primaryColor || '#f06aa9';
  const bg = appearance.backgroundColor || '#0e0711';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${bg}"/><path d="M32 49s-15.5-9.8-19.6-19.2C9.5 23.1 13.6 16 21 16c4.3 0 8.2 2.3 11 5.9C34.8 18.3 38.7 16 43 16c7.4 0 11.5 7.1 8.6 13.8C47.5 39.2 32 49 32 49z" fill="${favColor}"/></svg>`;
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = dataUri;
}

export default function App() {
  const [path, setPath] = useState<string>(() => normalizePath(window.location.pathname));
  const [search, setSearch] = useState<string>(() => window.location.search);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => getSavedTheme());
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);

  const [appearance, setAppearance] = useState<SiteAppearanceConfig | null>(null);
  const [planSummaries, setPlanSummaries] = useState<PublicPlanSummary[]>([]);
  const [supportWhatsapp, setSupportWhatsapp] = useState('554192387993');
  const [supportWhatsappLabel, setSupportWhatsappLabel] = useState('(41) 9238-7993');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  const navigate = useCallback((nextPath: string) => {
    const [rawPath, rawQuery] = nextPath.split('?');
    const normalized = normalizePath(rawPath || '/');
    const fullTarget = rawQuery ? `${normalized}?${rawQuery}` : normalized;
    if (`${window.location.pathname}${window.location.search}` !== fullTarget) {
      window.history.pushState({}, '', fullTarget);
    }
    setPath(normalized);
    setSearch(rawQuery ? `?${rawQuery}` : '');
  }, []);

  const handleSetTheme = useCallback(
    (next: 'dark' | 'light') => {
      setTheme(next);
      applyDocumentTheme(next);
      if (appearance) applyDynamicFaviconAndTheme(appearance, next);
    },
    [appearance]
  );

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  const refreshAppearance = useCallback(async () => {
    try {
      const pub = await apiRequest<{
        appearance: SiteAppearanceConfig;
        maintenanceMode: boolean;
        maintenanceMessage: string;
        registrationEnabled: boolean;
        whatsapp?: string;
        whatsappLabel?: string;
        planSummaries?: PublicPlanSummary[];
      }>('/api/public/appearance');
      setAppearance(pub.appearance);
      setMaintenanceMode(pub.maintenanceMode);
      setMaintenanceMessage(pub.maintenanceMessage);
      setRegistrationEnabled(pub.registrationEnabled);
      if (pub.whatsapp) setSupportWhatsapp(pub.whatsapp);
      if (pub.whatsappLabel) setSupportWhatsappLabel(pub.whatsappLabel);
      if (Array.isArray(pub.planSummaries)) setPlanSummaries(pub.planSummaries);

      if (pub.appearance) {
        applyDynamicFaviconAndTheme(pub.appearance, theme);
      }
    } catch {
      // Fallback to CSS defaults if public endpoint fails
    }
  }, [theme]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiRequest<{
        authenticated: boolean;
        user?: UserProfile;
        subscription?: SubscriptionSummary;
        maintenanceMode?: boolean;
        maintenanceMessage?: string;
      }>('/api/auth/me');

      if (typeof res.maintenanceMode === 'boolean') {
        setMaintenanceMode(res.maintenanceMode);
        setMaintenanceMessage(res.maintenanceMessage || '');
      }

      if (res.authenticated && res.user && res.subscription) {
        setUser(res.user);
        setSubscription(res.subscription);
        if (res.user.preferences?.theme) {
          setTheme(res.user.preferences.theme);
          applyDocumentTheme(res.user.preferences.theme);
        }
      } else {
        setUser(null);
        setSubscription(null);
      }
    } catch {
      setUser(null);
      setSubscription(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    refreshAppearance();
    refreshSession();
  }, [refreshAppearance, refreshSession]);

  useEffect(() => {
    const onPop = () => {
      setPath(normalizePath(window.location.pathname));
      setSearch(window.location.search);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network error on logout
    }
    setUser(null);
    setSubscription(null);
    navigate('/');
  }

  // Legal pages & 403 unauthorized route
  if (path === '/termos') {
    return (
      <>
        <OfflineBanner />
        <TermsPage onBack={() => navigate('/')} customText={appearance?.termsText} />
      </>
    );
  }
  if (path === '/privacidade') {
    return (
      <>
        <OfflineBanner />
        <PrivacyPage onBack={() => navigate('/')} customText={appearance?.privacyText} />
      </>
    );
  }
  if (path === '/nao-autorizado') {
    return (
      <>
        <OfflineBanner />
        <UnauthorizedPage onBack={() => navigate(user ? '/inicio' : '/')} />
      </>
    );
  }

  // Loading state while verifying backend session
  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0e0711] text-sm text-[#c6b1c0]">
        Verificando autenticação...
      </div>
    );
  }

  const paymentRoute = parsePaymentRoute(path, search);

  // MANDATORY AUTH GATE: Dedicated Admin Auth on /admin, Client Auth + Landing on /
  if (!user || !subscription) {
    if (path === '/admin') {
      return (
        <>
          <OfflineBanner />
          <AdminAuthGate
            onAuthenticated={(loggedUser, loggedSub) => {
              setUser(loggedUser);
              setSubscription(loggedSub);
              navigate('/admin');
            }}
            onBackToClientAuth={() => navigate('/')}
          />
        </>
      );
    }

    if (path !== '/' && !KNOWN_AUTH_PATHS.has(path) && !paymentRoute) {
      return (
        <>
          <OfflineBanner />
          <NotFoundPage onBack={() => navigate('/')} />
        </>
      );
    }

    return (
      <>
        <OfflineBanner />
        <AuthGate
          onAuthenticated={(loggedUser, loggedSub) => {
            setUser(loggedUser);
            setSubscription(loggedSub);
            if (loggedUser.preferences?.theme) {
              handleSetTheme(loggedUser.preferences.theme);
            }
            if (paymentRoute) {
              // Preserve /pagamento/* destination after authentication
              setBooting(false);
            } else if (loggedUser.role === 'admin') {
              navigate('/admin');
            } else {
              navigate('/inicio');
            }
          }}
          onOpenLegal={(legal) => navigate(`/${legal}`)}
          onOpenAdminLogin={() => navigate('/admin')}
          appearance={appearance}
          planSummaries={planSummaries}
          supportWhatsapp={supportWhatsapp}
          supportWhatsappLabel={supportWhatsappLabel}
          maintenanceMode={maintenanceMode}
          maintenanceMessage={maintenanceMessage}
          registrationEnabled={registrationEnabled}
          theme={theme}
          onToggleTheme={() => handleSetTheme(theme === 'dark' ? 'light' : 'dark')}
        />
      </>
    );
  }

  // Payment Tracking / Mercado Pago return pages (Strict server-truth lookup)
  if (paymentRoute) {
    return (
      <>
        <OfflineBanner />
        <PaymentResultPage
          routeKind={paymentRoute.kind}
          refOrId={paymentRoute.refOrId}
          onGoPortal={(tab) => navigate(`/${tab}`)}
          onRefreshSession={refreshSession}
        />
      </>
    );
  }

  // Unknown route when authenticated
  if (!KNOWN_AUTH_PATHS.has(path)) {
    return (
      <>
        <OfflineBanner />
        <NotFoundPage onBack={() => navigate(user.role === 'admin' ? '/admin' : '/inicio')} />
      </>
    );
  }

  // Maintenance gate for non-admin users while logged in
  if (maintenanceMode && user.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <OfflineBanner />
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-950/30 text-amber-300">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-[#fff7fb]">
            Manutenção Programada
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#c6b1c0]">
            {maintenanceMessage || 'A plataforma está passando por atualização e retornará em breve.'}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] w-full rounded-xl border border-white/15 px-5 text-xs font-medium text-[#d9c7d4] hover:border-[#f06aa9]/50"
            >
              Voltar para tela inicial
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Admin Console (Strictly role === 'admin')
  if (path === '/admin') {
    if (user.role !== 'admin') {
      return (
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
          <OfflineBanner />
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#170d1c] p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-red-400/30 bg-red-950/30 text-red-300">
              <Lock className="h-5 w-5" />
            </div>
            <h1 className="font-display text-2xl font-semibold text-[#fff7fb]">
              Acesso Administrativo Restrito
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#c6b1c0]">
              Esta área é exclusiva para administradores autorizados (Jefferson e Nicolly). Sua
              conta atual possui perfil de cliente.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => navigate('/conta')}
                className="min-h-[44px] w-full rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-5 text-sm font-semibold text-white"
              >
                Ir para Minha Conta
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] w-full rounded-xl border border-white/15 px-5 text-xs font-medium text-[#d9c7d4]"
              >
                Sair e entrar com conta administrativa
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        <OfflineBanner />
        <AdminDashboard
          currentUser={user}
          onExitToClient={() => navigate('/inicio')}
          onLogout={handleLogout}
          onAppearancePublished={refreshAppearance}
          theme={theme}
          onToggleTheme={() => handleSetTheme(theme === 'dark' ? 'light' : 'dark')}
        />
      </>
    );
  }

  // Authenticated Client Portal
  const activeTab: ClientTab =
    path === '/planos'
      ? 'planos'
      : path === '/conta'
      ? 'conta'
      : path === '/suporte'
      ? 'suporte'
      : path === '/vip'
      ? 'vip'
      : 'inicio';

  return (
    <>
      <OfflineBanner />
      <ClientPortal
        user={user}
        subscription={subscription}
        activeTab={activeTab}
        onChangeTab={(nextTab) => navigate(`/${nextTab}`)}
        onGoAdmin={() => navigate('/admin')}
        onOpenLegal={(legal) => navigate(`/${legal}`)}
        onOpenPaymentTrack={(ref) => navigate(`/pagamento/${encodeURIComponent(ref)}`)}
        onLogout={handleLogout}
        onRefreshSession={refreshSession}
        theme={theme}
        onSetTheme={handleSetTheme}
      />
    </>
  );
}

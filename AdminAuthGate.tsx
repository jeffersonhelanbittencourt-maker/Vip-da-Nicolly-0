import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Heart, Lock, ShieldCheck } from 'lucide-react';
import { apiRequest } from './api.ts';
import type { SubscriptionSummary, UserProfile } from './types.ts';

interface AdminAuthGateProps {
  onAuthenticated: (user: UserProfile, subscription: SubscriptionSummary) => void;
  onBackToClientAuth: () => void;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  onAuthenticated,
  onBackToClientAuth,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!identifier.trim() || !password) {
      setErrorMsg('Informe o usuário administrativo e a senha.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{
        authenticated: boolean;
        user: UserProfile;
        subscription: SubscriptionSummary;
      }>('/api/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      onAuthenticated(res.user, res.subscription);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha na autenticação administrativa.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-between px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <button
          type="button"
          onClick={onBackToClientAuth}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-xs font-medium text-[#c6b1c0] hover:text-[#f06aa9] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para acesso de clientes
        </button>
      </div>

      <main className="mx-auto my-8 w-full max-w-md rounded-2xl border border-white/10 bg-[#170d1c]/95 p-6 shadow-2xl sm:p-9">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f06aa9] to-[#c83c82] text-white shadow-lg shadow-[#c83c82]/25">
            <Heart className="h-5 w-5 fill-current" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-[#f06aa9]">
              Central Administrativa Mobile
            </p>
            <h1 className="font-display text-2xl font-semibold text-[#fff7fb]">
              Acesso Administrativo
            </h1>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-[#c6b1c0]">
          Área exclusiva para administradores autorizados do VIP da Nicolly. Todas as aprovações,
          suspensões e edições ficam registradas no histórico de auditoria.
        </p>

        {errorMsg && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-xs text-red-200"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="adm-user" className="block text-xs font-medium text-[#e8d9e4]">
              Usuário administrativo
            </label>
            <input
              id="adm-user"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Jefferson ou Nicolly"
              className="mt-1.5 min-h-[46px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="adm-pass" className="block text-xs font-medium text-[#e8d9e4]">
              Senha administrativa
            </label>
            <div className="relative mt-1.5">
              <input
                id="adm-pass"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="min-h-[46px] w-full rounded-xl border border-white/15 bg-[#100814] px-3.5 pr-12 text-sm text-[#fff7fb] placeholder-[#8f7889] focus:border-[#f06aa9] focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-0 top-0 flex h-[46px] w-[46px] items-center justify-center text-[#c6b1c0] hover:text-white"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#c83c82]/25 transition-all hover:brightness-110 disabled:opacity-60"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{loading ? 'Autenticando...' : 'Entrar no Painel Administrativo'}</span>
          </button>
        </form>

        <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-4 text-[11px] text-[#c6b1c0]">
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#f06aa9]" />
          <span>Autenticação verificada pelo servidor · Sessão HttpOnly protegida</span>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md text-center text-xs text-[#c6b1c0]">
        © 2026 VIP da Nicolly · Central Administrativa
      </footer>
    </div>
  );
};

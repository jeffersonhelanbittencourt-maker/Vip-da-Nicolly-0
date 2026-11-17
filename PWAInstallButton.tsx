import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from './usePWAInstall.ts';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[40px] items-center gap-2 border border-[#f06aa9]/45 bg-[#2a1530] px-3.5 py-2 text-xs font-semibold text-[#fff7fb] hover:bg-[#381c40] transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5 text-[#f06aa9]" />
        <span>{compact ? 'Instalar App' : 'Instalar VIP no Android'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex min-h-[40px] items-center gap-2 border border-white/15 px-3.5 py-2 text-xs font-medium text-[#d9c7d4] hover:border-[#f06aa9]/50 transition-colors whitespace-nowrap shrink-0"
      >
        <Smartphone className="h-3.5 w-3.5 text-[#f06aa9]" />
        <span>{compact ? 'App' : 'Adicionar à tela inicial'}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md border border-white/15 bg-[#170d1c] p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-semibold text-[#f06aa9]">Aplicativo Mobile (PWA)</p>
                <h2 className="mt-1 font-display text-xl font-semibold text-[#fff7fb]">
                  Instalar VIP da Nicolly
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="flex h-10 w-10 items-center justify-center border border-white/15 text-[#c6b1c0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-[#e8d9e4]">
                <li>1. Toque no botão <strong>Compartilhar</strong> na barra do Safari.</li>
                <li>2. Role até <strong>Adicionar à Tela de Início</strong>.</li>
                <li>3. Confirme em <strong>Adicionar</strong> para abrir como aplicativo.</li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-[#e8d9e4]">
                <li>1. No Chrome do seu Android (Samsung), toque no menu <strong>⋮</strong> no canto superior.</li>
                <li>2. Toque em <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                <li>3. Confirme para criar o ícone <strong>VIP DA NICOLLY</strong> na sua tela inicial.</li>
              </ol>
            )}

            <p className="mt-4 border border-white/10 bg-[#100814] p-3 text-xs text-[#c6b1c0]">
              Observação: operações de login, pagamentos, comprovantes e administração exigem conexão
              ativa com a internet e o servidor.
            </p>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 min-h-[46px] w-full bg-gradient-to-r from-[#f06aa9] to-[#c83c82] text-sm font-semibold text-white"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-20 left-3 right-3 z-50 flex items-center gap-2.5 border border-amber-400/40 bg-[#2a1510] px-4 py-2.5 text-xs text-amber-200 shadow-lg sm:left-auto sm:right-6 sm:max-w-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-300" />
      <span>
        Sem conexão com a internet. Ações no servidor, pagamentos e aprovações requerem rede ativa.
      </span>
    </div>
  );
};

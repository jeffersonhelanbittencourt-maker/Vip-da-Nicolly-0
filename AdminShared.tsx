import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  CreditCard,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  Palette,
  Plug,
  Repeat,
  Settings,
  Shield,
  Sliders,
  Tag,
  Users,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
} from 'lucide-react';

export type AdminModuleKey =
  | 'overview'
  | 'customers'
  | 'payments'
  | 'proofs'
  | 'subscriptions'
  | 'vip-group'
  | 'plans'
  | 'coupons'
  | 'finance'
  | 'reports'
  | 'notifications'
  | 'site-settings'
  | 'appearance'
  | 'media'
  | 'admins'
  | 'security'
  | 'audit'
  | 'integrations'
  | 'diagnostics'
  | 'support'
  | 'tools';

export interface AdminModuleDef {
  key: AdminModuleKey;
  label: string;
  shortLabel: string;
  group: 'Gestão Diária' | 'Comercial & Acesso' | 'Personalização' | 'Sistema & Segurança';
  description: string;
  icon: React.ReactNode;
}

export const ADMIN_MODULES: AdminModuleDef[] = [
  {
    key: 'overview',
    label: 'Dashboard',
    shortLabel: 'Início',
    group: 'Gestão Diária',
    description: 'Indicadores, receita e alertas em tempo real',
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    key: 'customers',
    label: 'Clientes',
    shortLabel: 'Clientes',
    group: 'Gestão Diária',
    description: 'Cadastro, busca, observações e bloqueio',
    icon: <Users className="h-4 w-4" />,
  },
  {
    key: 'payments',
    label: 'Pagamentos',
    shortLabel: 'Pagamentos',
    group: 'Gestão Diária',
    description: 'Cobranças, Mercado Pago e lançamentos manuais',
    icon: <CreditCard className="h-4 w-4" />,
  },
  {
    key: 'proofs',
    label: 'Comprovantes',
    shortLabel: 'Provas',
    group: 'Gestão Diária',
    description: 'Fila de conferência com zoom na tela',
    icon: <FileCheck2 className="h-4 w-4" />,
  },
  {
    key: 'subscriptions',
    label: 'Assinaturas',
    shortLabel: 'Assinaturas',
    group: 'Comercial & Acesso',
    description: 'Vigência, vencimentos e extensão de dias',
    icon: <Repeat className="h-4 w-4" />,
  },
  {
    key: 'vip-group',
    label: 'Grupo VIP',
    shortLabel: 'Grupo VIP',
    group: 'Comercial & Acesso',
    description: 'Solicitações via WhatsApp para a Nicolly',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  {
    key: 'plans',
    label: 'Planos',
    shortLabel: 'Planos',
    group: 'Comercial & Acesso',
    description: 'Valores, links, ofertas e histórico de edições',
    icon: <Sliders className="h-4 w-4" />,
  },
  {
    key: 'coupons',
    label: 'Cupons & Promoções',
    shortLabel: 'Cupons',
    group: 'Comercial & Acesso',
    description: 'Códigos de desconto, limites de uso e validade',
    icon: <Tag className="h-4 w-4" />,
  },
  {
    key: 'finance',
    label: 'Financeiro',
    shortLabel: 'Financeiro',
    group: 'Comercial & Acesso',
    description: 'Receita confirmada, ticket médio e comparativos',
    icon: <BarChart3 className="h-4 w-4" />,
  },
  {
    key: 'reports',
    label: 'Relatórios',
    shortLabel: 'Relatórios',
    group: 'Comercial & Acesso',
    description: 'Exportações CSV para celular e planilhas',
    icon: <FileSpreadsheet className="h-4 w-4" />,
  },
  {
    key: 'notifications',
    label: 'Notificações',
    shortLabel: 'Alertas',
    group: 'Gestão Diária',
    description: 'Central de eventos e régua automática',
    icon: <Bell className="h-4 w-4" />,
  },
  {
    key: 'site-settings',
    label: 'Configurações',
    shortLabel: 'Config.',
    group: 'Personalização',
    description: 'Dados do site e convite privado do grupo',
    icon: <Settings className="h-4 w-4" />,
  },
  {
    key: 'appearance',
    label: 'Aparência do Site',
    shortLabel: 'Aparência',
    group: 'Personalização',
    description: 'Cores, textos, banners, termos e prévia',
    icon: <Palette className="h-4 w-4" />,
  },
  {
    key: 'media',
    label: 'Biblioteca de Mídia',
    shortLabel: 'Mídia',
    group: 'Personalização',
    description: 'Imagens do site, hero e banner VIP ao vivo',
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    key: 'support',
    label: 'Central de Suporte',
    shortLabel: 'Suporte',
    group: 'Personalização',
    description: 'Chamados de clientes e WhatsApp oficial',
    icon: <MessageCircle className="h-4 w-4" />,
  },
  {
    key: 'admins',
    label: 'Administradores',
    shortLabel: 'Admins',
    group: 'Sistema & Segurança',
    description: 'Contas Jefferson, Nicolly e permissões',
    icon: <Shield className="h-4 w-4" />,
  },
  {
    key: 'security',
    label: 'Segurança',
    shortLabel: 'Segurança',
    group: 'Sistema & Segurança',
    description: 'Senhas, sessões ativas, cadastros e manutenção',
    icon: <KeyRound className="h-4 w-4" />,
  },
  {
    key: 'audit',
    label: 'Auditoria',
    shortLabel: 'Auditoria',
    group: 'Sistema & Segurança',
    description: 'Histórico detalhado de ações administrativas',
    icon: <Activity className="h-4 w-4" />,
  },
  {
    key: 'integrations',
    label: 'Integrações',
    shortLabel: 'Integrações',
    group: 'Sistema & Segurança',
    description: 'Mercado Pago, Supabase, webhooks e testes',
    icon: <Plug className="h-4 w-4" />,
  },
  {
    key: 'diagnostics',
    label: 'Diagnóstico',
    shortLabel: 'Diagnóstico',
    group: 'Sistema & Segurança',
    description: 'Saúde do servidor, banco, storage e PWA',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  {
    key: 'tools',
    label: 'Ferramentas',
    shortLabel: 'Ferramentas',
    group: 'Sistema & Segurança',
    description: 'Varredura, limpeza de sessões e backup JSON',
    icon: <Wrench className="h-4 w-4" />,
  },
];

export const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  highlight?: 'pink' | 'emerald' | 'amber' | 'neutral';
}> = ({ label, value, sub, highlight = 'neutral' }) => {
  const accentText =
    highlight === 'pink'
      ? 'text-[#f06aa9]'
      : highlight === 'emerald'
      ? 'text-emerald-300'
      : highlight === 'amber'
      ? 'text-amber-300'
      : 'text-[#fff7fb]';
  return (
    <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-4 sm:p-5 shadow-md">
      <p className="text-xs font-medium text-[#c6b1c0]">{label}</p>
      <p className={`mt-1.5 font-mono-num text-xl sm:text-2xl font-semibold tabular-nums ${accentText}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11px] leading-relaxed text-[#c6b1c0]">{sub}</p>}
    </div>
  );
};

export const MiniMetric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-[#170d1c] px-3.5 py-3">
    <p className="text-[11px] text-[#c6b1c0]">{label}</p>
    <p className="mt-1 font-mono-num text-base sm:text-lg font-semibold text-[#fff7fb] tabular-nums">
      {value}
    </p>
  </div>
);

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-white/15 bg-[#170d1c] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              danger
                ? 'border-red-400/40 bg-red-950/40 text-red-300'
                : 'border-[#f06aa9]/40 bg-[#f06aa9]/10 text-[#f06aa9]'
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-[#fff7fb]">{title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#d9c7d4]">{message}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[46px] rounded-xl border border-white/15 px-4 text-xs font-medium text-[#e8d9e4]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-[46px] rounded-xl px-4 text-xs font-semibold text-white disabled:opacity-60 ${
              danger
                ? 'bg-red-700 hover:bg-red-600'
                : 'bg-gradient-to-r from-[#f06aa9] to-[#c83c82]'
            }`}
          >
            {busy ? 'Executando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ProofZoomLightbox: React.FC<{
  proof: {
    id: string;
    originalFilename: string;
    mimeType: string;
  } | null;
  onClose: () => void;
}> = ({ proof, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);

  if (!proof) return null;
  const fileUrl = `/api/proofs/${proof.id}/file`;
  const isPdf = proof.mimeType === 'application/pdf';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-[#fff7fb]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/15 bg-[#140a18] px-4 py-3">
        <p className="truncate text-xs font-medium text-[#e8d9e4]">{proof.originalFilename}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isPdf && (
            <>
              <button
                type="button"
                aria-label="Diminuir zoom"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#fff7fb]"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="px-1.5 font-mono-num text-xs text-[#c6b1c0]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Aumentar zoom"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#fff7fb]"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Girar imagem"
                onClick={() => setRotate((r) => (r + 90) % 360)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#fff7fb]"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </>
          )}
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir em nova aba"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#f06aa9]"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={fileUrl}
            download={proof.originalFilename}
            aria-label="Baixar comprovante"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-[#f06aa9]"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            aria-label="Fechar visualizador"
            onClick={() => {
              setZoom(1);
              setRotate(0);
              onClose();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-[#2a1530] text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
        {isPdf ? (
          <iframe
            src={fileUrl}
            title={proof.originalFilename}
            className="h-full w-full max-w-4xl rounded-xl border border-white/15 bg-white"
          />
        ) : (
          <img
            src={fileUrl}
            alt={proof.originalFilename}
            style={{
              transform: `scale(${zoom}) rotate(${rotate}deg)`,
              transformOrigin: 'center center',
            }}
            className="max-h-full max-w-full object-contain transition-transform"
          />
        )}
      </div>
    </div>
  );
};

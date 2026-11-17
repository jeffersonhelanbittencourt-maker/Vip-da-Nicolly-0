import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { apiRequest, formatBrl, formatDate, formatDateTime, PAYMENT_STATUS_META } from './api.ts';
import type { PaymentRecord } from './types.ts';

interface PaymentResultPageProps {
  routeKind: 'tracking' | 'aprovado' | 'pendente' | 'recusado';
  refOrId: string | null;
  onGoPortal: (tab: 'inicio' | 'planos' | 'conta' | 'vip') => void;
  onRefreshSession: () => Promise<void>;
}

export const PaymentResultPage: React.FC<PaymentResultPageProps> = ({
  routeKind,
  refOrId,
  onGoPortal,
  onRefreshSession,
}) => {
  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    if (!refOrId) {
      setLoading(false);
      setError('Nenhuma referência de pedido foi informada na URL.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ payment: PaymentRecord }>(
        `/api/payments/by-ref/${encodeURIComponent(refOrId)}`
      );
      setPayment(res.payment);
    } catch (err: any) {
      setError(err.message || 'Não foi possível localizar os dados deste pedido.');
    } finally {
      setLoading(false);
    }
  }, [refOrId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  async function handleVerifyMercadoPago() {
    if (!payment) return;
    setVerifying(true);
    setNotice(null);
    setError(null);
    try {
      const res = await apiRequest<{ verified: boolean; status: string; message: string }>(
        `/api/payments/${payment.id}/verify-mp`,
        { method: 'POST' }
      );
      setNotice(res.message);
      await loadOrder();
      await onRefreshSession();
    } catch (err: any) {
      setError(err.message || 'Erro ao consultar Mercado Pago.');
    } finally {
      setVerifying(false);
    }
  }

  // Visual presentation is derived STRICTLY from server payment.status (never URL hint!)
  const serverStatus = payment?.status;

  const heroMeta = (() => {
    if (serverStatus === 'aprovado') {
      return {
        icon: <CheckCircle2 className="h-7 w-7 text-emerald-400" />,
        ring: 'border-emerald-400/35 bg-emerald-950/35',
        kicker: 'Confirmado no Servidor',
        title: 'Pagamento Aprovado · Acesso VIP Liberado',
        subtitle:
          'A confirmação oficial foi registrada no servidor. Você já pode acessar a Área VIP e solicitar seu ingresso.',
      };
    }
    if (serverStatus === 'recusado' || serverStatus === 'cancelado' || serverStatus === 'reembolsado') {
      return {
        icon: <XCircle className="h-7 w-7 text-red-400" />,
        ring: 'border-red-400/35 bg-red-950/35',
        kicker: PAYMENT_STATUS_META[serverStatus]?.label || 'Não concluído',
        title:
          serverStatus === 'reembolsado'
            ? 'Pagamento Reembolsado'
            : serverStatus === 'cancelado'
            ? 'Pedido Cancelado'
            : 'Pagamento Não Aprovado',
        subtitle:
          payment?.rejectionReason ||
          'O pagamento não foi confirmado para este pedido. Você pode gerar uma nova cobrança ou enviar comprovante para análise.',
      };
    }
    if (serverStatus === 'expirado') {
      return {
        icon: <AlertTriangle className="h-7 w-7 text-neutral-400" />,
        ring: 'border-white/15 bg-white/5',
        kicker: 'Ciclo Encerrado',
        title: 'Assinatura Expirada',
        subtitle: 'O período contratado deste pedido já foi concluído. Contrate um novo plano para reativar.',
      };
    }
    return {
      icon: <Clock className="h-7 w-7 text-amber-300" />,
      ring: 'border-amber-400/35 bg-amber-950/30',
      kicker:
        routeKind === 'aprovado'
          ? 'Aguardando Confirmação Oficial'
          : serverStatus
          ? PAYMENT_STATUS_META[serverStatus]?.label
          : 'Acompanhamento de Pedido',
      title:
        routeKind === 'aprovado'
          ? 'Validando retorno no servidor'
          : 'Pagamento Pendente ou em Análise',
      subtitle:
        'A liberação do VIP ocorre exclusivamente após confirmação oficial via Mercado Pago ou aprovação administrativa do comprovante.',
    };
  })();

  const stepSubmitted = Boolean(payment);
  const stepProofOrGateway =
    payment?.status === 'aguardando_analise' ||
    payment?.status === 'em_analise' ||
    payment?.status === 'aprovado' ||
    Boolean(payment?.proofs && payment.proofs.length > 0);
  const stepApproved = payment?.status === 'aprovado';

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onGoPortal('conta')}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[#f06aa9] hover:text-[#f89ec8]"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para Minha Conta
          </button>

          {refOrId && (
            <button
              type="button"
              onClick={loadOrder}
              disabled={loading}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#170d1c] px-3.5 text-xs font-medium text-[#fff7fb]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#170d1c] p-10 text-center text-sm text-[#c6b1c0]">
            Consultando status real do pedido no servidor...
          </div>
        ) : error && !payment ? (
          <div className="rounded-2xl border border-red-400/30 bg-[#170d1c] p-8 text-center space-y-4">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
            <h1 className="font-display text-2xl font-semibold text-[#fff7fb]">
              Pedido indisponível
            </h1>
            <p className="text-sm text-[#c6b1c0]">{error}</p>
            <button
              type="button"
              onClick={() => onGoPortal('conta')}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 text-xs font-semibold text-white"
            >
              Ver meus pagamentos em Minha Conta
            </button>
          </div>
        ) : (
          payment && (
            <div className="space-y-6">
              {/* Server-truth Banner */}
              <section className="rounded-2xl border border-white/10 bg-[#170d1c] p-6 sm:p-8 shadow-2xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${heroMeta.ring}`}
                  >
                    {heroMeta.icon}
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-[#f06aa9]">
                      {heroMeta.kicker}
                    </p>
                    <h1 className="mt-1 font-display text-2xl font-semibold text-[#fff7fb] sm:text-3xl">
                      {heroMeta.title}
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-[#c6b1c0]">
                      {heroMeta.subtitle}
                    </p>
                  </div>
                </div>

                {notice && (
                  <div className="mt-5 rounded-xl border border-sky-400/35 bg-sky-950/30 px-4 py-3 text-xs text-sky-200">
                    {notice}
                  </div>
                )}

                {error && (
                  <div className="mt-5 rounded-xl border border-red-400/35 bg-red-950/30 px-4 py-3 text-xs text-red-200">
                    {error}
                  </div>
                )}

                {/* Order Details Grid */}
                <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-3 text-xs">
                  <div className="rounded-xl border border-white/10 bg-[#100814] p-3">
                    <span className="text-[#c6b1c0]">Referência</span>
                    <p className="mt-1 truncate font-mono-num font-semibold text-[#fff7fb]">
                      {payment.externalReference}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#100814] p-3">
                    <span className="text-[#c6b1c0]">Plano contratado</span>
                    <p className="mt-1 font-semibold capitalize text-[#fff7fb]">
                      {payment.planKey}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-[#100814] p-3">
                    <span className="text-[#c6b1c0]">Valor final</span>
                    <p className="mt-1 font-mono-num font-semibold text-[#fff7fb]">
                      {formatBrl(payment.amountCents)}
                    </p>
                  </div>

                  {payment.couponCode && (
                    <div className="rounded-xl border border-white/10 bg-[#100814] p-3">
                      <span className="text-[#c6b1c0]">Cupom aplicado</span>
                      <p className="mt-1 font-mono-num font-semibold text-emerald-400">
                        {payment.couponCode} (-{formatBrl(payment.discountCents || 0)})
                      </p>
                    </div>
                  )}

                  <div className="rounded-xl border border-white/10 bg-[#100814] p-3">
                    <span className="text-[#c6b1c0]">Criado em</span>
                    <p className="mt-1 font-mono-num text-[#fff7fb]">
                      {formatDateTime(payment.createdAt)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#100814] p-3">
                    <span className="text-[#c6b1c0]">Validade VIP</span>
                    <p className="mt-1 font-mono-num text-[#fff7fb]">
                      {payment.status !== 'aprovado'
                        ? 'Aguardando aprovação'
                        : payment.planKey === 'vitalicio'
                        ? 'Vitalício'
                        : formatDate(payment.expiresAt)}
                    </p>
                  </div>
                </div>

                {/* Timeline */}
                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-xs font-semibold text-[#e8d9e4]">Etapas de confirmação</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-[#100814] p-3">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="text-[#fff7fb]">1. Pedido registrado</span>
                    </div>
                    <div
                      className={`flex items-center gap-2 rounded-xl border p-3 ${
                        stepProofOrGateway
                          ? 'border-emerald-400/30 bg-[#100814]'
                          : 'border-white/10 bg-[#100814] opacity-75'
                      }`}
                    >
                      {stepProofOrGateway ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Clock className="h-4 w-4 shrink-0 text-amber-300" />
                      )}
                      <span className="text-[#fff7fb]">2. Pagamento / Análise</span>
                    </div>
                    <div
                      className={`flex items-center gap-2 rounded-xl border p-3 ${
                        stepApproved
                          ? 'border-emerald-400/40 bg-emerald-950/25'
                          : 'border-white/10 bg-[#100814] opacity-75'
                      }`}
                    >
                      {stepApproved ? (
                        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Clock className="h-4 w-4 shrink-0 text-[#c6b1c0]" />
                      )}
                      <span className="text-[#fff7fb]">3. VIP Liberado</span>
                    </div>
                  </div>
                </div>

                {/* Attached proofs */}
                {payment.proofs && payment.proofs.length > 0 && (
                  <div className="mt-5 border-t border-white/10 pt-4 space-y-2">
                    <p className="text-xs font-semibold text-[#c6b1c0]">Comprovantes anexados</p>
                    {payment.proofs.map((pr) => (
                      <a
                        key={pr.id}
                        href={`/api/proofs/${pr.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-[42px] items-center justify-between rounded-xl border border-white/10 bg-[#100814] px-3 text-xs text-[#f06aa9] hover:border-[#f06aa9]/50"
                      >
                        <span className="inline-flex items-center gap-2 truncate">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{pr.originalFilename}</span>
                        </span>
                        <span className="shrink-0 font-semibold">
                          {PAYMENT_STATUS_META[pr.status]?.label || pr.status}
                        </span>
                      </a>
                    ))}
                  </div>
                )}

                {/* Contextual CTAs */}
                <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-5">
                  {payment.status === 'aprovado' ? (
                    <button
                      type="button"
                      onClick={() => onGoPortal('vip')}
                      className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-5 text-sm font-semibold text-white"
                    >
                      <span>Abrir Área VIP</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <>
                      {payment.checkoutUrl && payment.status === 'aguardando_pagamento' && (
                        <a
                          href={payment.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-5 text-sm font-semibold text-white"
                        >
                          <span>Concluir pagamento</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {payment.status !== 'cancelado' &&
                        payment.status !== 'reembolsado' &&
                        payment.status !== 'expirado' && (
                          <button
                            type="button"
                            disabled={verifying}
                            onClick={handleVerifyMercadoPago}
                            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#f06aa9]/45 bg-[#2a1530] px-5 text-xs font-semibold text-[#fff7fb]"
                          >
                            <RefreshCw className={`h-4 w-4 ${verifying ? 'animate-spin' : ''}`} />
                            {verifying ? 'Consultando Mercado Pago...' : 'Verificar no Mercado Pago'}
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() => onGoPortal('conta')}
                        className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-medium text-[#fff7fb]"
                      >
                        <Upload className="h-4 w-4 text-[#f06aa9]" />
                        Enviar comprovante em Minha Conta
                      </button>
                    </>
                  )}
                </div>
              </section>
            </div>
          )
        )}
      </div>
    </div>
  );
};

import React from 'react';
import { ArrowLeft, ShieldCheck, FileText, AlertTriangle } from 'lucide-react';

interface LegalPageProps {
  onBack: () => void;
  customText?: string;
}

export const TermsPage: React.FC<LegalPageProps> = ({ onBack, customText }) => {
  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[#f06aa9] hover:text-[#f89ec8] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <article className="rounded-2xl border border-white/10 bg-[#170d1c]/90 p-6 sm:p-10 shadow-xl">
          <div className="mb-6 flex items-center gap-3 text-xs tracking-wider text-[#f06aa9]">
            <FileText className="h-4 w-4" />
            <span>Documento Legal · VIP da Nicolly</span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl">
            Termos de Uso
          </h1>
          <p className="mt-2 text-sm text-[#c6b1c0]">Última atualização: Novembro de 2026</p>

          {customText && customText.trim() ? (
            <div className="mt-8 whitespace-pre-wrap text-sm leading-7 text-[#e8d9e4]">
              {customText}
            </div>
          ) : (
            <div className="mt-8 space-y-6 text-sm leading-7 text-[#e8d9e4]">
              <section>
                <h2 className="font-display text-xl font-medium text-[#fff7fb]">
                  1. Elegibilidade e Restrição de Idade (+18)
                </h2>
                <p className="mt-2">
                  O acesso à plataforma VIP da Nicolly, aos planos de assinatura e a todos os conteúdos
                  disponibilizados na Área VIP é destinado exclusivamente a pessoas maiores de 18 anos
                  com plena capacidade civil. O cadastro com data de nascimento incompatível é
                  automaticamente bloqueado pelo servidor.
                </p>
              </section>

            <section>
              <h2 className="font-display text-xl font-medium text-[#fff7fb]">
                2. Conta Pessoal e Intransferível
              </h2>
              <p className="mt-2">
                Cada assinatura é individual, pessoal e intransferível. É estritamente proibido
                compartilhar credenciais de acesso, copiar, gravar, redistribuir ou comercializar
                quaisquer conteúdos, links de grupo VIP ou materiais exclusivos sem autorização
                expressa da titular.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-medium text-[#fff7fb]">
                3. Pagamentos, Vigência e Cancelamento
              </h2>
              <p className="mt-2">
                Os pagamentos são processados via Mercado Pago (Semanal — R$ 25,00 por 7 dias; Mensal
                — R$ 50,00 por 30 dias; Vitalício — R$ 200,00 em pagamento único). A vigência tem
                início somente após a confirmação oficial do pagamento pelo gateway ou conferência
                administrativa de comprovante. Ao término da validade dos planos Semanal ou Mensal,
                o acesso à Área VIP é bloqueado automaticamente até nova contratação.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-medium text-[#fff7fb]">
                4. Suspensão por Descumprimento
              </h2>
              <p className="mt-2">
                A administração reserva-se o direito de suspender ou encerrar contas que tentem
                fraudar comprovantes, violar a propriedade intelectual dos conteúdos ou burlar regras
                de segurança da plataforma.
              </p>
            </section>
          </div>
          )}
        </article>
      </div>
    </div>
  );
};

export const PrivacyPage: React.FC<LegalPageProps> = ({ onBack, customText }) => {
  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[#f06aa9] hover:text-[#f89ec8] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <article className="rounded-2xl border border-white/10 bg-[#170d1c]/90 p-6 sm:p-10 shadow-xl">
          <div className="mb-6 flex items-center gap-3 text-xs tracking-wider text-[#f06aa9]">
            <ShieldCheck className="h-4 w-4" />
            <span>Privacidade e LGPD · VIP da Nicolly</span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-[#fff7fb] sm:text-4xl">
            Política de Privacidade
          </h1>
          <p className="mt-2 text-sm text-[#c6b1c0]">
            Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)
          </p>

          {customText && customText.trim() ? (
            <div className="mt-8 whitespace-pre-wrap text-sm leading-7 text-[#e8d9e4]">
              {customText}
            </div>
          ) : (
            <div className="mt-8 space-y-6 text-sm leading-7 text-[#e8d9e4]">
              <section>
                <h2 className="font-display text-xl font-medium text-[#fff7fb]">
                  1. Dados Coletados e Finalidade
                </h2>
                <p className="mt-2">
                  Coletamos nome completo, e-mail, telefone e data de nascimento exclusivamente para
                  autenticação segura da conta, verificação de maioridade (+18), gestão de assinaturas
                  e atendimento ao assinante.
                </p>
              </section>

            <section>
              <h2 className="font-display text-xl font-medium text-[#fff7fb]">
                2. Armazenamento Privado de Comprovantes
              </h2>
              <p className="mt-2">
                Comprovantes de pagamento (imagens ou PDFs) enviados pelo cliente são armazenados em
                repositório privado com controle rigoroso de acesso (Row Level Security e buckets
                privados). Somente o titular da conta e administradores autorizados podem visualizar
                os arquivos enviados para conferência.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-medium text-[#fff7fb]">
                3. Processamento de Pagamentos
              </h2>
              <p className="mt-2">
                Dados financeiros inseridos durante o checkout são tratados diretamente pelo ambiente
                seguro do Mercado Pago. Não armazenamos números de cartão de crédito ou credenciais
                bancárias em nossos servidores.
              </p>
            </section>

            <section>
              <h2 className="font-display text-xl font-medium text-[#fff7fb]">
                4. Direitos do Titular (LGPD)
              </h2>
              <p className="mt-2">
                Você pode solicitar acesso, correção ou exclusão de seus dados pessoais a qualquer
                momento através do canal oficial de atendimento disponível na Área do Cliente.
              </p>
            </section>
          </div>
          )}
        </article>
      </div>
    </div>
  );
};

export const NotFoundPage: React.FC<LegalPageProps> = ({ onBack }) => {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#170d1c]/95 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[#f06aa9]/30 bg-[#f06aa9]/10 text-[#f06aa9]">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="font-mono-num text-xs tracking-widest text-[#f06aa9]">ERRO 404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb]">
          Página não encontrada
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#c6b1c0]">
          O endereço solicitado não existe ou exige autenticação prévia para visualização.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:brightness-110"
        >
          Ir para a tela de acesso
        </button>
      </div>
    </div>
  );
};

export const UnauthorizedPage: React.FC<LegalPageProps> = ({ onBack, customText }) => {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#170d1c]/95 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-red-400/35 bg-red-950/35 text-red-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="font-mono-num text-xs tracking-widest text-red-400">ACESSO NEGADO · 403</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[#fff7fb]">
          Área Restrita
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#c6b1c0]">
          {customText ||
            'Você não possui autorização para acessar este recurso administrativo ou pedido. Todo acesso indevido é registrado em auditoria.'}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f06aa9] to-[#c83c82] px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:brightness-110"
        >
          Voltar com segurança
        </button>
      </div>
    </div>
  );
};


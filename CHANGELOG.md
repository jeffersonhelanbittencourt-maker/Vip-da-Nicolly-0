# Changelog

Todas as mudanças relevantes da plataforma **VIP da Nicolly** são documentadas neste arquivo.

## [2.0.0] — Plataforma Completa Ultra Master Supreme

### Adicionado
- **Pagamentos & Rastreamento**: Rotas `/pagamento`, `/pagamento/:id`, `/pagamento/aprovado`, `/pagamento/pendente` e `/pagamento/recusado` consultando exclusivamente o estado real do servidor.
- **Cupons Promocionais**: Gestão administrativa completa com descontos percentuais ou fixos, validade, limite de usos e aplicação validada no backend durante o checkout.
- **Suporte Integrado**: Central de chamados na Área do Cliente (`/suporte`) com fila inbox e respostas no Painel Admin.
- **Régua Automática & Notificações**: Notificações internas para clientes com sino de alertas no portal, 7 modelos editáveis pelo admin e histórico de disparos.
- **Biblioteca de Mídia Privada**: Upload administrativo em `/api/admin/media` e entrega em `/api/media/:id` com aplicação direta no visual do site.
- **Tema Escuro & Claro**: Alternador global sincronizado com preferências autenticadas (`PATCH /api/auth/preferences`).
- **CRM & Financeiro Expandidos**: Ficha do cliente 360 em 5 abas, 10 segmentos de filtro, indicadores financeiros do dia/ano, filtros por status e 7 exportações CSV.
- **Personalização do Dashboard**: Visibilidade e ordenação customizáveis dos blocos do resumo administrativo.
- **Prontidão de Produção & CI**: Pipeline GitHub Actions (`lint`, `build`, `test`), testes automatizados em `tests/platform.test.ts` e guias operacionais.

### Segurança
- Proteção Same-Origin CSRF em mutações HTTP com registro automático em logs de auditoria.
- Neutralização de CSV formula injection nas exportações administrativas.
- Proteção estrita contra ativação de VIP por parâmetros da URL ou envio isolado de comprovante.

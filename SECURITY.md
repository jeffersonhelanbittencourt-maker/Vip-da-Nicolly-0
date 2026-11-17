# Política de Segurança — VIP da Nicolly

## Controles Implementados na Plataforma

- **Autenticação & Senhas**: Senhas são processadas exclusivamente no backend com `crypto.scryptSync` (salt aleatório de 16 bytes + 64 bytes derivados) e comparadas com `crypto.timingSafeEqual`. Sessões usam cookies `HttpOnly` e assinatura HMAC-SHA256.
- **RBAC Administrativo**: Todas as rotas `/api/admin/*` exigem sessão autenticada, `role === 'admin'`, verificação de suspensão e checagem granular de permissões (`canManageClients`, `canManageFinance`, `canManageSettings`, `canManageAdmins`). Tentativas não autorizadas são registradas em `audit_logs`.
- **Proteção de Pagamentos & Acesso VIP**:
  - Parâmetros de query ou rotas de retorno (`/pagamento/aprovado`) **nunca** ativam uma assinatura VIP no cliente ou no servidor.
  - A liberação ocorre somente após aprovação administrativa explícita ou confirmação oficial do pagamento na API / Webhook assinado do Mercado Pago.
  - O link privado do grupo (`vipGroupInvite`) permanece protegido no servidor e nunca é exposto em rotas públicas ou antes da validação ativa.
- **Proteção CSRF & Limite de Taxa**: Requisições mutáveis verificam cabeçalho `Origin` contra o host esperado (exceção controlada apenas ao webhook externo do Mercado Pago) e possuem rate limiting em endpoints sensíveis.
- **Armazenamento de Arquivos**: Comprovantes enviados ficam fora da pasta pública (`private_storage/proofs`) e são acessíveis somente por administradores autenticados ou pelo respectivo titular autorizado.
- **Prevenção de CSV Formula Injection**: Exportações CSV escapam células iniciadas por caracteres interpretáveis como fórmulas (`=`, `+`, `-`, `@`).

## Boas Práticas em Produção

1. Defina `SESSION_SECRET` forte (mínimo 32 bytes aleatórios) nas variáveis de ambiente.
2. Nunca versione arquivos `.env`, bancos `.db` ou a pasta `private_storage/` no Git.
3. Altere as credenciais iniciais administrativas diretamente pelo painel após o primeiro acesso.
4. Configure `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` reais antes de aceitar cobranças automáticas.

## Relato de Vulnerabilidades

Caso identifique alguma falha de segurança, entre em contato diretamente com a equipe administradora do projeto antes de divulgar detalhes publicamente.

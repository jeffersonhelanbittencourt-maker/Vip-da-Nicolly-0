# Guia de Publicação em Produção — VIP da Nicolly

Este guia descreve como publicar a plataforma completa (Frontend SPA + Backend Express) com banco Supabase e pagamentos oficiais do Mercado Pago.

## 1. Preparando Variáveis de Ambiente

Baseie-se no arquivo `.env.example` e configure no seu provedor de hospedagem:

| Variável | Descrição | Obrigatória |
| --- | --- | --- |
| `PORT` | Porta HTTP do servidor Express (padrão `3000`) | Sim |
| `APP_URL` | URL pública HTTPS (ex: `https://vipdanicolly.com.br`) | Sim |
| `SESSION_SECRET` | Chave secreta aleatória longa para assinatura dos cookies | Sim (Prod) |
| `SUPABASE_URL` | URL do projeto Supabase | Opcional (Recomendado) |
| `SUPABASE_ANON_KEY` | Chave anônima do projeto Supabase | Opcional (Recomendado) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key (usar apenas no backend) | Opcional (Recomendado) |
| `MERCADOPAGO_ACCESS_TOKEN` | Token de produção do Mercado Pago | Para checkout/API |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta dos webhooks no Mercado Pago | Para webhooks |

## 2. Configurando o Supabase (PostgreSQL + Storage)

1. Acesse o SQL Editor do seu projeto Supabase e execute integralmente o conteúdo de `supabase_schema.sql`.
2. Crie um bucket privado no Supabase Storage chamado `comprovantes` para guardar comprovantes em nuvem quando conectado.
3. Confirme que o RLS (Row Level Security) está habilitado nas tabelas criadas pelo script.

## 3. Configurando o Mercado Pago

1. No painel de desenvolvedores do Mercado Pago, gere o `Access Token` de produção e insira em `MERCADOPAGO_ACCESS_TOKEN`.
2. Configure a URL de Webhooks apontando para:
   ```
   https://SUA-URL-PUBLICA/webhooks/mercadopago
   ```
3. Copie a assinatura secreta do webhook para `MERCADOPAGO_WEBHOOK_SECRET`.
4. As URLs de retorno após o checkout apontam para `/pagamento/aprovado`, `/pagamento/pendente` e `/pagamento/recusado` com o `external_reference`, que consulta o backend para confirmação real.

## 4. Opções de Hospedagem Recomendadas (Full-Stack Node.js)

Como o sistema utiliza backend Express para sessões seguras, uploads privados, webhooks e SQLite/Supabase, utilize um provedor compatível com processos Node.js contínuos (ex: **Render**, **Railway**, **Fly.io** ou **VPS com PM2/Docker**):

```bash
npm ci
npm run build
npm start
```

> **Nota sobre Vercel (`vercel.json`)**: O arquivo `vercel.json` na raiz oferece fallback de rotas SPA caso o frontend estático seja publicado separadamente; contudo, o funcionamento completo das rotas `/api/*` e webhooks exige apontar o proxy ou publicar em servidor Node.js.

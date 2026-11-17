# 💎 VIP da Nicolly — Plataforma Exclusiva de Assinaturas

![CI](https://img.shields.io/badge/CI-Lint%20%7C%20Build%20%7C%20Test-brightgreen)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8)

Plataforma web full-stack mobile-first (PWA) para gestão de assinaturas VIP, pagamentos integrados com **Mercado Pago** (Checkout Pro e Webhooks), análise de comprovantes, régua de comunicação automatizada e **Super Painel Administrativo** com 21 módulos.

---

## ✨ Funcionalidades Principais

### 👤 Portal Público & Área do Assinante
- **Landing Page Editorial**: Apresentação exclusiva, planos dinâmicos (`Semanal`, `Mensal` e `Vitalício`), FAQ interativo e páginas legais (`/termos` e `/privacidade`).
- **Autenticação Segura**: Cadastro com validação rigorosa de maioridade (**18+**), aceite de termos, hash de senha com `scrypt` e comparação segura (`timingSafeEqual`).
- **Checkout & Cupons**: Pedidos rastreáveis via `/pagamento/:ref`, validação server-side de cupons (`percent` e `fixed_cents`) e confirmação automática via **Mercado Pago (Checkout Pro + Webhooks)** ou envio de comprovante.
- **Área VIP & PWA**: Acompanhamento de dias restantes, histórico de pedidos, tickets de suporte, notificações in-app, tema Escuro/Claro e botão de acesso direto ao Grupo VIP liberado apenas com assinatura ativa no servidor.

### 🛡️ Super Painel Administrativo (21 Módulos)
- **Gestão Diária**: Dashboard personalizável, Notificações & Régua de Comunicação (7 templates), Clientes (10 segmentos + Ficha 360°), Pagamentos e Visualizador de Comprovantes com zoom.
- **Comercial & Financeiro**: Controle de Assinaturas, Fila de Grupo VIP via WhatsApp, Editor de Planos, Cupons Promocionais, Dashboard Financeiro e 7 Relatórios CSV protegidos contra *Formula Injection*.
- **Personalização & Sistema**: Editor de Aparência em tempo real (rascunho/publicação), Biblioteca de Mídia, Inbox de Suporte, Controle de Permissões de Admins, Logs de Auditoria, Diagnóstico e Backup JSON.

---

## 🛠️ Stack Tecnológica

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, `vite-plugin-pwa`
- **Backend**: Node.js, Express, Multer, Cookie-Parser
- **Banco de Dados**: SQLite (`better-sqlite3`) com espelhamento opcional em tempo real para **Supabase** (PostgreSQL + Storage + RLS)
- **Pagamentos**: Mercado Pago API & Webhooks

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js 20+** (recomendado Node 22)
- **npm**

### Passo a Passo

```bash
# 1. Clone o repositório
git clone https://github.com/SEU-USUARIO/vip-da-nicolly.git
cd vip-da-nicolly

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env

# 4. Inicie o servidor full-stack (Frontend + API na porta 3000)
npm run dev
```

Acesse no navegador: `http://localhost:3000` (Painel Admin em `http://localhost:3000/admin`).

---

## 📜 Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o backend Express + Vite em modo desenvolvimento |
| `npm run build` | Gera o bundle de produção do frontend em `dist/` |
| `npm start` | Inicia o servidor em modo produção (`NODE_ENV=production`) |
| `npm run lint` | Executa a verificação de tipos TypeScript (`tsc --noEmit`) |
| `npm test` | Executa a suíte de testes automatizados (`tests/platform.test.ts`) |

---

## ☁️ Deploy em Produção (Hospedagem Gratuita)

Consulte o arquivo [`DEPLOYMENT.md`](./DEPLOYMENT.md) para instruções detalhadas sobre:
1. Configuração do banco e bucket privado no **Supabase** (`supabase_schema.sql`).
2. Configuração de credenciais e Webhooks no **Mercado Pago**.
3. Publicação em servidores Node.js gratuitos (**Render**, **Koyeb**, **Railway** ou **VPS**).

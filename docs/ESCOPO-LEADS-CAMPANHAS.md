# Escopo atual — Controle de Leads + Flows de Campanhas

**Produto:** Prospectra+  
**Módulos ativos:** Leads, Campanhas, Fila do dia  
**Módulos excluídos por enquanto:** WhatsApp, Voice Studio, Inteligência comercial, CRM existente

## O que já existe (implementado e testado)

### Leads (`/leads`)
- Listagem com busca, filtro por etapa e tag
- Adição manual de lead
- Importação via CSV ou colagem de URLs
- Busca com IA (filtros gerados a partir de descrição em linguagem natural)
- Mudança de etapa (new → invited → connected → replied → meeting → won → lost → do_not_contact)
- Inscrição em campanhas (vários leads de uma vez)
- Exclusão de leads

### Campanhas (`/campanhas`)
- Listagem com métricas (leads inscritos, aceites, respostas, convites)
- Criação e edição de campanhas
- Editor de fluxo (cadência): tipos reação, convite, mensagem, comentário
- Delay em dias entre passos
- Condição: "sempre" ou "só depois que aceitar o convite"
- Personalização com IA por lead (quando configurada)
- Variáveis: {nome}, {nome_completo}, {cargo}, {empresa}, {cidade}
- Atribuição de responsável

### Fila do dia (`/fila`)
- Scheduler executa ao abrir a página (rodarScheduler)
- Ações pendentes por data de vencimento
- Limites diários serializados (convites e mensagens por usuário)
- Leads aguardando aceite e leads conectados
- Marcar como feito (modo assistido: texto vem pronto, usuário cola no LinkedIn)

## O que NÃO está neste escopo (excluído por ora)

- WhatsApp AKG (conexão, QR, envio de mensagens)
- Voice Studio (perfil de voz, geração de áudio, envio Ogg/Opus)
- Inteligência comercial (análise de leads, scoring, rascunhos de IA)
- CRM existente (crm.argusprime.com.br) — não tocar
- Deploy no Vercel — removido do escopo

## Requisitos para deploy na VPS (VPS-905340)

| Item | Valor |
|------|-------|
| SO | Ubuntu 22.04 LTS |
| Node.js | 22 |
| pnpm | 10.25.0 |
| PM2 | global |
| Banco | Neon Postgres (endpoint -pooler) |
| App URL | https://crm.argusprime.com.br |
| Porta app | 3000 (localhost, via nginx) |
| Cron | `/api/cron` diário via crontab |

## Variáveis de ambiente (`.env` na VPS)

```bash
DATABASE_URL=postgresql://...neon.tech/prospectra_plus?sslmode=require
AUTH_SECRET=<já-existe>
PUBLIC_APP_URL=https://crm.argusprime.com.br
MASTER_USER_EMAIL=atintilio@argusprime.com.br
OFFICE365_TENANT_ID=
OFFICE365_CLIENT_ID=
OFFICE365_CLIENT_SECRET=
OFFICE365_SENDER_EMAIL=
OPENROUTER_API_KEY=
AI_MODEL=qwen/qwen3-30b-a3b:free
LEGACY_AUTH_FILE=/etc/prospectra/auth.json
DRY_RUN=true
TZ=America/Sao_Paulo
ACTION_WINDOW_START=08:00
ACTION_WINDOW_END=18:00
CRON_SECRET=<openssl rand -hex 32>
```

**Não configurar:** WA_AKG_BASE_URL, WA_AKG_API_KEY, VOICESTUDIO_*, VOICE_AUTOMATION_ENABLED (excluídos deste escopo).

## Procedimento de deploy (quando houver acesso SSH)

```sh
# Na VPS
mkdir -p /opt/prospectra-plus
cd /opt/prospectra-plus

# Upload do código (scp de outro terminal)
# scp -r /caminho/do/pacote/app/* root@vps:/opt/prospectra-plus/

pnpm install
pnpm run typecheck
pnpm run build

# PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd

# Crontab diário (substitui Vercel Cron)
# 0 10 * * * curl -sf -H "Authorization: Bearer <CRON_SECRET>" https://crm.argusprime.com.br/api/cron

# Verificar
pm2 list
curl https://crm.argusprime.com.br/api/health
```

## Bloqueio atual

Sem acesso SSH à VPS-905340 (proxy IPv4 inativo, sem IPv4 alocado, IPv6 sem rota). Ticket #578 aberto no suporte VPS1Euro aguardando resposta.

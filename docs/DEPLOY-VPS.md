# Deploy na VPS da França — Prospectra+ (sem Vercel)

Este documento substitui o `vercel.json`. Toda a aplicação roda na VPS VPS-905340 (Ubuntu 22.04 LTS, apenas IPv6 + proxy SSH IPv4). O Neon Postgres permanece como banco de estado.

## Pré-requisitos na VPS

- Node.js 22 instalado (`nvm` ou pacote oficial)
- `pnpm` 10.25.0 instalado globalmente
- PM2 instalado (`npm install -g pm2`)
- Acesso root via SSH (ou proxy SSH IPv4 quando ativo)
- Domínio `crm.argusprime.com.br` já apontando para a VPS (via WebGate 80/443)
- WA-AKG já instalado nativamente (systemd + MariaDB), escutando em localhost
- Banco Neon já provisionado (`DATABASE_URL` com endpoint -pooler)

## 1. Enviar o código para a VPS

```sh
# Na VPS, como root:
mkdir -p /opt/prospectra-plus
cd /opt/prospectra-plus
# Enviar o código (via scp, rsync ou git clone do GitHub)
# Exemplo via scp do Mac:
scp -r /caminho/do/pacote/app/* root@<ipv6-da-vps>:/opt/prospectra-plus/
```

> Não enviar `node_modules`, `.env`, `.next`, `.dist`, `pnpm-lock.yaml` (recriar na VPS).

## 2. Variáveis de ambiente (`/opt/prospectra-plus/.env`)

Criar com `chmod 600`, somente root. Valores vêm dos arquivos privados da VPS (`/etc/prospectra-wa-akg/integration.env` e `/etc/prospectra-voice/integration.env`):

```bash
# Banco (Neon — endpoint -pooler, sslmode=require)
DATABASE_URL=postgresql://...neon.tech/prospectra_plus?sslmode=require

# Segredo de sessão (já existente — não sobrescrever)
AUTH_SECRET=<já-existe>

# URL pública do app
PUBLIC_APP_URL=https://crm.argusprime.com.br

# Primeiro administrador master
MASTER_USER_EMAIL=atintilio@argusprime.com.br

# Office 365 (Microsoft Graph, Mail.Send)
OFFICE365_TENANT_ID=
OFFICE365_CLIENT_ID=
OFFICE365_CLIENT_SECRET=
OFFICE365_SENDER_EMAIL=

# IA (OpenRouter) — opcional
OPENROUTER_API_KEY=
AI_MODEL=qwen/qwen3-30b-a3b:free

# WhatsApp WA-AKG (servidor, sem /api final)
WA_AKG_BASE_URL=https://crm.argusprime.com.br/prospectra-whatsapp
WA_AKG_API_KEY=<de /etc/prospectra-wa-akg/integration.env>

# Voice Studio privado (servidor)
VOICESTUDIO_BASE_URL=http://127.0.0.1:<porta-local-do-voice-studio>
VOICESTUDIO_API_KEY=<de /etc/prospectra-voice/integration.env>
VOICESTUDIO_ENGINE=<motor-validado, ex: MOSS-TTS-Nano>

# Arquivo de usuários legados (opcional, para migração v1)
LEGACY_AUTH_FILE=/etc/prospectra/auth.json

# Sistema
DRY_RUN=true
TZ=America/Sao_Paulo
ACTION_WINDOW_START=08:00
ACTION_WINDOW_END=18:00

# Voice automation — DESABILITADO até validação real de envio
VOICE_AUTOMATION_ENABLED=false

# Cron secreto para /api/cron (gerar: openssl rand -hex 32)
CRON_SECRET=<gerar-novo>
```

**Não substituir nem apagar variáveis existentes** ao adicionar as novas.

## 3. Arquivo de usuários legados (`/etc/prospectra/auth.json`)

Se existir um backup do `auth.json` do v1 (Vercel Blob), copiar para `/etc/prospectra/auth.json` com `chmod 600`. Isso permite a migração silenciosa de senhas do v1 no primeiro login. Se não existir, o sistema segue normalmente sem erro.

## 4. Instalar dependências e build

```sh
cd /opt/prospectra-plus
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build          # executa migrações no Neon + build Next.js
pnpm run build:voice-worker   # gera .dist/voice-worker.cjs
```

## 5. Rodar a aplicação com PM2

Criar `/opt/prospectra-plus/ecosystem.config.js`:

```js
module.exports = {
  apps: [{
    name: 'prospectra',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/opt/prospectra-plus',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
  }],
};
```

```sh
cd /opt/prospectra-plus
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd
```

A aplicação escuta na porta 3000 (localhost). O nginx da VPS já faz proxy reverso para `crm.argusprime.com.br`.

## 6. Cron diário (substitui o Vercel Cron)

O endpoint `/api/cron` roda o scheduler de cadência + deletion reports. Configurar crontab do root:

```sh
crontab -e
```

Adicionar:

```cron
# Diário às 10h (horário da VPS, Europe/Paris) — equivalente ao cron do Vercel
0 10 * * * curl -sf -H "Authorization: Bearer <CRON_SECRET>" https://crm.argusprime.com.br/api/cron > /var/log/prospectra-cron.log 2>&1
```

Ajustar o fuso se quiser rodar no horário de São Paulo (08:00–18h janela de ação já é tratada pela aplicação).

## 7. Executor de voz (Voice Studio Worker)

O executor roda **na VPS**, nunca em função serverless:

```sh
cd /opt/prospectra-plus
pnpm run build:voice-worker
```

Criar `/etc/systemd/system/prospectra-voice-worker.service`:

```ini
[Unit]
Description=Prospectra+ Voice Worker
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/prospectra-plus
EnvironmentFile=/etc/prospectra-voice/integration.env
EnvironmentFile=/etc/prospectra-wa-akg/integration.env
Environment=DATABASE_URL=<neon-pooler-url>
Environment=VOICE_AUTOMATION_ENABLED=false
ExecStart=/usr/bin/node .dist/voice-worker.cjs
Restart=always
RestartSec=10
# Limites de recursos para preservar WhatsApp e CRM
MemoryMax=2G
CPUQuota=50%

[Install]
WantedBy=multi-user.target
```

```sh
systemctl daemon-reload
systemctl enable prospectra-voice-worker
# NÃO iniciar ainda: só após validar geração e envio real autorizado
# systemctl start prospectra-voice-worker
```

**`VOICE_AUTOMATION_ENABLED=false` por padrão.** Ativar somente após comprovar motor instalado, criação de perfil, geração em português e envio real autorizado pelo WhatsApp.

## 8. Verificações pós-deploy

```sh
# Aplicação respondendo
curl -sf https://crm.argusprime.com.br/api/health

# Status do PM2
pm2 list

# Logs
pm2 logs prospectra
tail -f /var/log/prospectra-cron.log
```

## 9. O que NÃO fazer

- Não executar `pnpm run dev` em produção (usa `next dev`, não `next start`)
- Não colocar `@vercel/blob` nem `BLOB_READ_WRITE_TOKEN` no `.env`
- Não iniciar `prospectra-voice-worker` antes de validação real de envio
- Não ativar `VOICE_AUTOMATION_ENABLED=true` antes da validação
- Não usar Twilio, Unipile ou APIs pagas obrigatórias

## Rollback

Se algo der errado, o banco Neon é preservado (migrações são aditivas). Basta reimplantar a versão anterior do código e rodar `pm2 restart prospectra`.

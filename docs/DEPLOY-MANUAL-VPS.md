# Deploy Manual — Prospectra+ na VPS (Leads + Campanhas + Fila)

Este guia é para você executar na VPS francesa (VPS-905340). Tudo já está validado localmente.

## Duas formas de fazer o deploy

| Opção | Quando usar |
|-------|-------------|
| **A. Script automatizado** | Se você tem acesso SSH à VPS e quer tudo em um comando |
| **B. Passo a passo manual** | Se quer executar cada etapa individualmente |

Ambas incluem a configuração do Cloudflare Tunnel (se você tiver credenciais).

---

## Pré-requisitos na VPS

- Acesso root (senha: `3Xiuy4oK`)
- Node.js 22, pnpm 10.25.0, PM2
- Neon Postgres já provisionado (`DATABASE_URL`)
- nginx já configurado para `crm.argusprime.com.br`
- Conta Cloudflare com API Token (permissão para editar DNS)

---

## Opção A — Script automatizado (recomendado)

```bash
# Na VPS, como root:
cd /opt/prospectra-plus

# 1. Transferir o código primeiro (scp, tar.gz, etc.)
# 2. Executar o script:
bash scripts/deploy-prospectra-cf.sh
```

O script vai:
1. Instalar Node.js 22, pnpm, PM2, cloudflared
2. Instalar dependências do projeto e fazer build
3. Iniciar Next.js com PM2
4. Autenticar o Cloudflare Tunnel (`cloudflared tunnel login`)
5. Criar o túnel e configurar o DNS no seu subdomínio
6. Instalar o cloudflared como serviço systemd
7. Configurar crontab diário para `/api/cron`

**Você precisará informar durante a execução:**
- O subdomínio completo (ex: `prospectra.crm.argusprime.com.br`)
- Autorizar o túnel no navegador (URL que o cloudflared abre)

---

## Opção B — Passo a passo manual

### Passo 1: Transferir o código

Na VPS:
```bash
mkdir -p /opt/prospectra-plus
cd /opt/prospectra-plus
# Extrair o código aqui (via scp, tar.gz, etc.)
ls -la
# Deve mostrar: src/, package.json, pnpm-lock.yaml, etc.
```

### Passo 2: Criar .env

```bash
cat > /opt/prospectra-plus/.env << 'EOF'
DATABASE_URL=postgresql://SEU_USUARIO:SUA_SENHA@SEU_ENDPOINT.neon.tech/prospectra_plus?sslmode=require
AUTH_SECRET=SUA_CHAVE_SECRETA_AQUI
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
CRON_SECRET=SUA_CHAVE_CRON_AQUI
EOF
chmod 600 /opt/prospectra-plus/.env
```

**Substitua:** `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET` pelos valores reais.

### Passo 3: Instalar dependências e build

```bash
cd /opt/prospectra-plus
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

### Passo 4: Iniciar com PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd
```

Verifique:
```bash
pm2 list
```

### Passo 5: Cloudflare Tunnel

```bash
# Instalar cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared-linux-amd64.deb
rm -f cloudflared-linux-amd64.deb

# Autenticar (abre URL no navegador)
cloudflared tunnel login

# Criar túnel
cloudflared tunnel create prospectra

# Configurar DNS (substitua pelo seu subdomínio)
cloudflared tunnel route dns prospectra prospectra.crm.argusprime.com.br

# Obter o ID do túnel
cloudflared tunnel list
```

### Passo 6: Configurar arquivo do túnel

Crie `/etc/cloudflared/config.yml`:

```yaml
tunnel: <ID-DO-TUNNEL>
credentials-file: /root/.cloudflared/<ID-DO-TUNNEL>.json

ingress:
  - hostname: prospectra.crm.argusprime.com.br
    service: http://localhost:3000
  - service: http_status:404
```

### Passo 7: Iniciar o túnel como serviço

```bash
cloudflared service install prospectra
systemctl enable cloudflared
systemctl start cloudflared
```

### Passo 8: Crontab diário

```bash
crontab -e
```

Adicione:
```cron
0 10 * * * curl -sf -H "Authorization: Bearer SUA_CHAVE_CRON" https://prospectra.crm.argusprime.com.br/api/cron >> /var/log/prospectra-cron.log 2>&1
```

### Passo 9: Verificar

```bash
curl https://prospectra.crm.argusprime.com.br/api/health
pm2 list
systemctl status cloudflared
```

---

## O que NÃO fazer (este escopo)

- Não configurar `WA_AKG_*`, `VOICESTUDIO_*`, `VOICE_AUTOMATION_ENABLED` (excluídos)
- Não iniciar o voice-worker
- Não tocar no CRM existente

---

## Arquivos no pacote

| Arquivo | Descrição |
|---------|-----------|
| `scripts/deploy-prospectra-cf.sh` | Script automatizado com Cloudflare |
| `docs/DEPLOY-MANUAL-VPS.md` | Este guia |
| `docs/ESCOPO-LEADS-CAMPANHAS.md` | Escopo focado |
| `docs/PLANO-EXECUCAO.md` | Plano de execução |
| `ecosystem.config.js` | Configuração PM2 |

---

## Quando tiver acesso à VPS

1. Transfira o código para `/opt/prospectra-plus/`
2. Edite o `.env` com seus valores
3. Execute o script ou siga os passos acima
4. Me avise quando estiver online para validar

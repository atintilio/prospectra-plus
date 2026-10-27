# Deploy Manual — Prospectra+ na VPS (Leads + Campanhas + Fila)

Este guia é para você executar na VPS francesa (VPS-905340). Tudo já está validado localmente.

## Pré-requisitos na VPS

- Acesso root (senha: `3Xiuy4oK`)
- Node.js 22 instalado
- pnpm 10.25.0 instalado (`npm install -g pnpm@10.25.0`)
- PM2 instalado (`npm install -g pm2`)
- Neon Postgres já provisionado (`DATABASE_URL` disponível)
- nginx já configurado para `crm.argusprime.com.br`

---

## Passo 1: Conectar na VPS

Como não sei exatamente como você acessa (sem IPv4, proxy SSH inativo), use o meio que você tiver disponível. Quando estiver conectado como root:

```bash
whoami
# deve retornar: root
```

---

## Passo 2: Transferir o código para a VPS

Escolha uma das opções abaixo:

### Opção A — Via scp (se você tiver um terminal no Mac com acesso à VPS)

```bash
# No seu Mac (outro terminal):
scp /tmp/prospectra-deploy.tar.gz root@<seu-meio-de-acesso>:/root/
```

### Opção B — Via curl/wget (se você conseguir hospedar o arquivo em algum lugar)

```bash
# Na VPS:
curl -o /root/prospectra-deploy.tar.gz <URL-do-arquivo>
```

### Opção C — Copiar e colar arquivos individualmente

Se não conseguir transferir o tar.gz, você pode criar os arquivos na VPS copiando o conteúdo de cada um.

---

## Passo 3: Preparar o diretório e extrair

Na VPS, como root:

```bash
mkdir -p /opt/prospectra-plus
cd /opt/prospectra-plus
tar -xzf /root/prospectra-deploy.tar.gz
rm /root/prospectra-deploy.tar.gz
ls -la
```

Você deve ver: `src/`, `tests/`, `docs/`, `drizzle/`, `scripts/`, `package.json`, `pnpm-lock.yaml`, `ecosystem.config.js`, etc.

---

## Passo 4: Criar o arquivo de variáveis de ambiente

Crie `/opt/prospectra-plus/.env` com `chmod 600`:

```bash
cat > /opt/prospectra-plus/.env << 'EOF'
# Banco (Neon — endpoint -pooler, sslmode=require)
DATABASE_URL=postgresql://SEU_USUARIO:SEU_SENHA@SEU_ENDPOINT.neon.tech/prospectra_plus?sslmode=require

# Segredo de sessão (gere: openssl rand -hex 32)
AUTH_SECRET=SUA_CHAVE_SECRETA_AQUI

# URL pública do app
PUBLIC_APP_URL=https://crm.argusprime.com.br

# Primeiro administrador master
MASTER_USER_EMAIL=atintilio@argusprime.com.br

# Office 365 (Microsoft Graph, Mail.Send)
OFFICE365_TENANT_ID=
OFFICE365_CLIENT_ID=
OFFICE365_CLIENT_SECRET=
OFFICE365_SENDER_EMAIL=

# IA (OpenRouter) — opcional para busca com IA
OPENROUTER_API_KEY=
AI_MODEL=qwen/qwen3-30b-a3b:free

# Arquivo de usuários legados (opcional)
LEGACY_AUTH_FILE=/etc/prospectra/auth.json

# Sistema
DRY_RUN=true
TZ=America/Sao_Paulo
ACTION_WINDOW_START=08:00
ACTION_WINDOW_END=18:00

# Cron secreto para /api/cron (gere: openssl rand -hex 32)
CRON_SECRET=SUA_CHAVE_CRON_AQUI
EOF

chmod 600 /opt/prospectra-plus/.env
```

**Importante:** Substitua `DATABASE_URL`, `AUTH_SECRET` e `CRON_SECRET` pelos valores reais. As variáveis do WhatsApp (`WA_AKG_*`) e Voice Studio (`VOICESTUDIO_*`) **não** são necessárias neste escopo — não as adicione.

---

## Passo 5: Arquivo de usuários legados (opcional)

Se você tem um backup do `auth.json` do v1 (do Vercel Blob), coloque em `/etc/prospectra/auth.json` com `chmod 600`. Isso permite migração silenciosa de senhas do v1. Se não tiver, pule esta etapa — o sistema funciona normalmente sem ele.

```bash
mkdir -p /etc/prospectra
# copiar auth.json para cá se existir
chmod 600 /etc/prospectra/auth.json
```

---

## Passo 6: Instalar dependências e build

```bash
cd /opt/prospectra-plus

# Instalar dependências
pnpm install --frozen-lockfile

# Verificar tipos
pnpm run typecheck

# Build de produção (executa migrações no Neon + build Next.js)
pnpm run build
```

Se o build pedir `DATABASE_URL` e não encontrar, certifique-se de que o `.env` está correto.

---

## Passo 7: Iniciar com PM2

```bash
cd /opt/prospectra-plus

# Iniciar a aplicação
pm2 start ecosystem.config.js

# Salvar a lista de processos
pm2 save

# Configurar reinício automático no boot
pm2 startup systemd
```

Verifique se está rodando:

```bash
pm2 list
```

Você deve ver o processo `prospectra` online.

---

## Passo 8: Configurar crontab diário (substitui o Vercel Cron)

O endpoint `/api/cron` roda o scheduler de cadência diariamente. Configure no crontab do root:

```bash
crontab -e
```

Adicione esta linha:

```cron
0 10 * * * curl -sf -H "Authorization: Bearer SUA_CHAVE_CRON_AQUI" https://crm.argusprime.com.br/api/cron >> /var/log/prospectra-cron.log 2>&1
```

Substitua `SUA_CHAVE_CRON_AQUI` pelo valor de `CRON_SECRET` que você definiu no `.env`.

Opcional — health check a cada 5 minutos:

```cron
*/5 * * * * curl -sf https://crm.argusprime.com.br/api/health > /dev/null 2>&1
```

---

## Passo 9: Configurar nginx (se ainda não estiver)

O Next.js roda na porta 3000 (localhost). O nginx da VPS já deve estar fazendo proxy reverso para `crm.argusprime.com.br`. Verifique:

```bash
nginx -t
systemctl status nginx
```

Se precisar adicionar o proxy para a porta 3000, adicione ao seu site no nginx:

```
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

Depois:

```bash
systemctl reload nginx
```

---

## Passo 10: Verificar se tudo está funcionando

```bash
# Health check
curl https://crm.argusprime.com.br/api/health

# Deve retornar algo como:
# {"status":"ok","version":"2.0.0","database":"ok","office365":"missing","ai":"missing"}

# Ver processos PM2
pm2 list

# Ver logs da aplicação
pm2 logs prospectra --lines 20
```

---

## Acessar a aplicação

Abra no navegador: `https://crm.argusprime.com.br`

Faça login com o e-mail do `MASTER_USER_EMAIL` (atintilio@argusprime.com.br) usando "Esqueci minha senha" ou crie o primeiro usuário diretamente no banco se necessário.

---

## Comandos úteis para gerenciamento

```bash
# Ver logs
pm2 logs prospectra

# Reiniciar a aplicação
pm2 restart prospectra

# Parar a aplicação
pm2 stop prospectra

# Ver status
pm2 status

# Ver logs do cron
tail -f /var/log/prospectra-cron.log
```

---

## O que NÃO fazer (este escopo)

- Não configurar `WA_AKG_BASE_URL`, `WA_AKG_API_KEY` (WhatsApp excluído)
- Não configurar `VOICESTUDIO_*`, `VOICE_AUTOMATION_ENABLED` (voz excluída)
- Não iniciar o voice-worker
- Não tocar no CRM existente (crm.argusprime.com.br já tem Next.js rodando)

---

## Se algo der errado

```bash
# Ver logs detalhados
pm2 logs prospectra --err --lines 50

# Verificar se a porta 3000 está ouvindo
ss -tlnp | grep 3000

# Rebuild se necessário
cd /opt/prospectra-plus
pnpm run build
pm2 restart prospectra
```

---

## Estrutura de arquivos na VPS

```
/opt/prospectra-plus/
├── .env                    (chmod 600 — segredos)
├── ecosystem.config.js     (PM2 config)
├── package.json
├── pnpm-lock.yaml
├── src/                    (código da aplicação)
├── drizzle/                (migrações do banco)
├── scripts/                (migração, voice-worker)
├── tests/                  (testes)
├── docs/                   (documentação)
└── .next/                  (build gerado)
```

---

Após o deploy, me avise e eu posso ajudar com qualquer ajuste fino ou próxima etapa.

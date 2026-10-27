#!/bin/bash
# Deploy Prospectra+ com Cloudflare Tunnel — Leads + Campanhas + Fila
# Execute na VPS como root: bash deploy-prospectra-cf.sh

set -euo pipefail

echo "=============================================="
echo "  Deploy Prospectra+ com Cloudflare Tunnel"
echo "=============================================="

# -------------------------------------------------
# 0. Verificar root
# -------------------------------------------------
if [ "$EUID" -ne 0 ]; then
  echo "ERRO: Execute como root."
  exit 1
fi

APP_DIR="/opt/prospectra-plus"
ENV_FILE="$APP_DIR/.env"

# -------------------------------------------------
# 1. Verificar código
# -------------------------------------------------
echo ""
echo "[1/9] Verificando código em $APP_DIR ..."
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "ERRO: package.json não encontrado. Transfira o código primeiro."
  exit 1
fi
cd "$APP_DIR"

# -------------------------------------------------
# 2. Variáveis de ambiente
# -------------------------------------------------
echo ""
echo "[2/9] Verificando .env ..."
if [ ! -f "$ENV_FILE" ]; then
  echo "Criando .env de exemplo. EDITE com seus valores antes de continuar."
  cat > "$ENV_FILE" << 'EOF'
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
  chmod 600 "$ENV_FILE"
  echo "⚠️  Edite $ENV_FILE agora com DATABASE_URL, AUTH_SECRET e CRON_SECRET reais."
  read -p "Pressione Enter após editar..."
fi

if grep -q "SEU_USUARIO\|SUA_CHAVE_SECRETA_AQUI\|SUA_CHAVE_CRON_AQUI" "$ENV_FILE" 2>/dev/null; then
  echo "ERRO: Preencha o .env completamente antes de continuar."
  exit 1
fi

# -------------------------------------------------
# 3. Dependências do sistema
# -------------------------------------------------
echo ""
echo "[3/9] Instalando Node.js 22, pnpm, PM2 ..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pnpm &> /dev/null; then
  npm install -g pnpm@10.25.0
fi
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
fi

# -------------------------------------------------
# 4. Instalar cloudflared
# -------------------------------------------------
echo ""
echo "[4/9] Instalando cloudflared ..."
if ! command -v cloudflared &> /dev/null; then
  arch=$(uname -m)
  if [ "$arch" = "x86_64" ]; then
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i cloudflared-linux-amd64.deb
    rm -f cloudflared-linux-amd64.deb
  else
    echo "ERRO: Arquitetura $arch não suportada automaticamente. Instale cloudflared manualmente."
    exit 1
  fi
fi
cloudflared --version

# -------------------------------------------------
# 5. Dependências do projeto + build
# -------------------------------------------------
echo ""
echo "[5/9] Instalando dependências e fazendo build ..."
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build

# -------------------------------------------------
# 6. Iniciar Next.js com PM2
# -------------------------------------------------
echo ""
echo "[6/9] Iniciando Next.js com PM2 ..."
if pm2 list | grep -q "prospectra"; then
  pm2 restart prospectra || pm2 start ecosystem.config.js
else
  pm2 start ecosystem.config.js
fi
pm2 save
pm2 startup systemd 2>/dev/null || true

sleep 3

# -------------------------------------------------
# 7. Cloudflare Tunnel Login
# -------------------------------------------------
echo ""
echo "[7/9] Autenticando Cloudflare Tunnel ..."
echo ""
echo "⚠️  IMPORTANTE: O comando abaixo vai abrir uma URL para você autorizar"
echo "   o túnel na sua conta Cloudflare no navegador."
echo ""
echo "Credenciais necessárias:"
echo "  - Email da conta Cloudflare"
echo "  - API Token com permissão para editar DNS (Zone DNS:Edit)"
echo ""

read -p "Pressione Enter para continuar com cloudflared tunnel login..."

cloudflared tunnel login

# -------------------------------------------------
# 8. Criar túnel e configurar DNS
# -------------------------------------------------
echo ""
echo "[8/9] Criando túnel e DNS ..."

read -p "Digite o subdomínio completo (ex: prospectra.crm.argusprime.com.br): " CF_HOSTNAME

if [ -z "$CF_HOSTNAME" ]; then
  echo "ERRO: Hostname é obrigatório."
  exit 1
fi

TUNNEL_NAME="prospectra"

# Verificar se o túnel já existe
if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  echo "Túnel '$TUNNEL_NAME' já existe."
else
  cloudflared tunnel create "$TUNNEL_NAME"
fi

# Obter o ID do túnel
TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
echo "Tunnel ID: $TUNNEL_ID"

# Configurar rota DNS
cloudflared tunnel route dns "$TUNNEL_NAME" "$CF_HOSTNAME"

# -------------------------------------------------
# 9. Configurar arquivo do túnel e iniciar serviço
# -------------------------------------------------
echo ""
echo "[9/9] Configurando túnel e iniciando serviço ..."

CREDENTIALS_FILE="/root/.cloudflared/${TUNNEL_ID}.json"

cat > /etc/cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: $CREDENTIALS_FILE

ingress:
  - hostname: $CF_HOSTNAME
    service: http://localhost:3000
  - service: http_status:404
EOF

# Instalar como serviço systemd
cloudflared service install "$TUNNEL_NAME"
systemctl enable cloudflared
systemctl start cloudflared

sleep 3

# -------------------------------------------------
# 10. Crontab diário
# -------------------------------------------------
CRON_SECRET=$(grep '^CRON_SECRET=' "$ENV_FILE" | cut -d'=' -f2)
(crontab -l 2>/dev/null | grep -v "prospectra-cron" || true) | crontab -
(crontab -l 2>/dev/null; echo "0 10 * * * curl -sf -H \"Authorization: Bearer $CRON_SECRET\" https://${CF_HOSTNAME}/api/cron >> /var/log/prospectra-cron.log 2>&1") | crontab -

# -------------------------------------------------
# Final
# -------------------------------------------------
echo ""
echo "=============================================="
echo "  Deploy concluído com Cloudflare!"
echo "=============================================="
echo ""
echo "Aplicação: https://${CF_HOSTNAME}"
echo "Túnel: $TUNNEL_NAME (ID: $TUNNEL_ID)"
echo ""
echo "Verifique:"
echo "  pm2 list                    # Status da aplicação"
echo "  systemctl status cloudflared # Status do túnel"
echo "  curl https://${CF_HOSTNAME}/api/health  # Health check"
echo ""
echo "Logs:"
echo "  pm2 logs prospectra"
echo "  journalctl -u cloudflared -f"
echo "=============================================="

#!/bin/bash
# Deploy Script — Prospectra+ (Leads + Campanhas + Fila)
# Execute na VPS como root: bash deploy-prospectra.sh

set -euo pipefail

echo "=============================================="
echo "  Deploy Prospectra+ — Leads + Campanhas"
echo "=============================================="

# -------------------------------------------------
# 0. Verificar se está rodando como root
# -------------------------------------------------
if [ "$EUID" -ne 0 ]; then
  echo "ERRO: Execute este script como root (sudo ou su -)."
  exit 1
fi

APP_DIR="/opt/prospectra-plus"
ENV_FILE="$APP_DIR/.env"

echo ""
echo "[1/8] Preparando diretório $APP_DIR ..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# -------------------------------------------------
# 1. Verificar se o código já está presente
# -------------------------------------------------
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "ERRO: package.json não encontrado em $APP_DIR."
  echo "Transfira o código primeiro (scp, tar.gz, git clone, etc.)."
  echo "Arquivo esperado: $APP_DIR/package.json"
  exit 1
fi

echo "Código encontrado em $APP_DIR"

# -------------------------------------------------
# 2. Verificar variáveis de ambiente
# -------------------------------------------------
echo ""
echo "[2/8] Verificando .env ..."
if [ ! -f "$ENV_FILE" ]; then
  echo "Criando .env de exemplo em $ENV_FILE ..."
  cat > "$ENV_FILE" << 'EOF'
# Banco (Neon — endpoint -pooler, sslmode=require)
DATABASE_URL=postgresql://SEU_USUARIO:SUA_SENHA@SEU_ENDPOINT.neon.tech/prospectra_plus?sslmode=require

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

# IA (OpenRouter) — opcional
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
  chmod 600 "$ENV_FILE"
  echo ""
  echo "⚠️  ATENÇÃO: Edite $ENV_FILE com seus valores reais antes de continuar!"
  echo "   - DATABASE_URL (Neon)"
  echo "   - AUTH_SECRET (openssl rand -hex 32)"
  echo "   - CRON_SECRET (openssl rand -hex 32)"
  echo ""
  read -p "Pressione Enter após editar o .env, ou Ctrl+C para cancelar..."
fi

# Verificar se DATABASE_URL foi preenchida
if grep -q "SEU_USUARIO\|SUA_SENHA\|SEU_ENDPOINT" "$ENV_FILE" 2>/dev/null; then
  echo "ERRO: DATABASE_URL não foi preenchida no .env."
  echo "Edite $ENV_FILE e execute o script novamente."
  exit 1
fi

if grep -q "SUA_CHAVE_SECRETA_AQUI\|SUA_CHAVE_CRON_AQUI" "$ENV_FILE" 2>/dev/null; then
  echo "ERRO: AUTH_SECRET ou CRON_SECRET não foram preenchidos no .env."
  echo "Edite $ENV_FILE e execute o script novamente."
  exit 1
fi

echo ".env configurado."

# -------------------------------------------------
# 3. Instalar dependências do sistema
# -------------------------------------------------
echo ""
echo "[3/8] Verificando Node.js, pnpm e PM2 ..."
if ! command -v node &> /dev/null; then
  echo "Instalando Node.js 22 ..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pnpm &> /dev/null; then
  echo "Instalando pnpm 10.25.0 ..."
  npm install -g pnpm@10.25.0
fi

if ! command -v pm2 &> /dev/null; then
  echo "Instalando PM2 ..."
  npm install -g pm2
fi

node --version
pnpm --version
pm2 --version

# -------------------------------------------------
# 4. Instalar dependências do projeto
# -------------------------------------------------
echo ""
echo "[4/8] Instalando dependências do projeto ..."
pnpm install --frozen-lockfile

# -------------------------------------------------
# 5. Build de produção
# -------------------------------------------------
echo ""
echo "[5/8] Executando build de produção ..."
pnpm run build

# -------------------------------------------------
# 6. Iniciar com PM2
# -------------------------------------------------
echo ""
echo "[6/8] Iniciando aplicação com PM2 ..."
if pm2 list | grep -q "prospectra"; then
  pm2 restart prospectra || pm2 start ecosystem.config.js
else
  pm2 start ecosystem.config.js
fi
pm2 save
pm2 startup systemd 2>/dev/null || true

echo ""
echo "[7/8] Configurando crontab diário ..."
# Extrair CRON_SECRET do .env
CRON_SECRET=$(grep '^CRON_SECRET=' "$ENV_FILE" | cut -d'=' -f2)

# Remover crontab existente do prospectra se houver
(crontab -l 2>/dev/null | grep -v "prospectra-cron" || true) | crontab -

# Adicionar novo crontab
(crontab -l 2>/dev/null; echo "0 10 * * * curl -sf -H \"Authorization: Bearer $CRON_SECRET\" https://crm.argusprime.com.br/api/cron >> /var/log/prospectra-cron.log 2>&1") | crontab -

echo "Crontab configurado (execução diária às 10h)."

# -------------------------------------------------
# 8. Verificação final
# -------------------------------------------------
echo ""
echo "[8/8] Verificando se a aplicação está online ..."
sleep 3

echo ""
echo "=== PM2 Status ==="
pm2 list

echo ""
echo "=== Health Check ==="
curl -sf https://crm.argusprime.com.br/api/health || echo "Health check falhou — verifique nginx e PM2"

echo ""
echo "=============================================="
echo "  Deploy concluído!"
echo "=============================================="
echo ""
echo "Próximos passos:"
echo "1. Acesse https://crm.argusprime.com.br no navegador"
echo "2. Faça login com $MASTER_USER_EMAIL"
echo "3. Verifique os módulos: /leads, /campanhas, /fila"
echo ""
echo "Logs da aplicação: pm2 logs prospectra"
echo "Logs do cron: tail -f /var/log/prospectra-cron.log"
echo "=============================================="

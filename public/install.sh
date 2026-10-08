#!/bin/bash
# ============================================================
# PROSPECTRA PLUS - DEPLOY AUTOMÁTICO COMPLETO (corrigido)
# Uso na VM:
# curl -sSL https://raw.githubusercontent.com/atintilio/prospectra-plus/main/public/install.sh | sudo bash
# Log: /root/prospectra-install.log
# ============================================================

set -e
exec > >(tee -a /root/prospectra-install.log) 2>&1
export DEBIAN_FRONTEND=noninteractive

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   🚀 PROSPECTRA PLUS - DEPLOY AUTOMÁTICO               ║"
echo "║   IP: 163.176.125.120                                   ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

IP="163.176.125.120"

# ============================================================
# 0. SWAP (VM E2.1.Micro tem só 1 GB de RAM)
# ============================================================
if ! swapon --show | grep -q '/swapfile'; then
  echo "💾 [0/5] Criando swap de 2 GB..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ============================================================
# 1. SISTEMA + DOCKER
# ============================================================
echo "📦 [1/5] Atualizando sistema e instalando Docker..."
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confold"
apt-get install -y docker.io python3-pip python3-venv git ufw curl openssl
# Compose: tenta plugin v2; se não houver, usa docker-compose v1
apt-get install -y docker-compose-v2 2>/dev/null || apt-get install -y docker-compose
usermod -aG docker ubuntu
systemctl enable docker && systemctl start docker

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi
echo "   usando: $COMPOSE"

# ============================================================
# 2. FIREWALL (ufw + iptables padrão da imagem Oracle)
# ============================================================
echo "🔥 [2/5] Configurando firewall..."
for P in 22 3456 3001 8000; do
  ufw allow ${P}/tcp
  # Imagem Ubuntu da Oracle tem REJECT no INPUT; liberar antes dele
  iptables -C INPUT -p tcp -m state --state NEW --dport ${P} -j ACCEPT 2>/dev/null || \
    iptables -I INPUT 5 -p tcp -m state --state NEW --dport ${P} -j ACCEPT
done
command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
ufw --force enable

# ============================================================
# 3. LINKI (LinkedIn)
# ============================================================
echo "💼 [3/5] Deploy Linki (LinkedIn)..."
mkdir -p /home/ubuntu/linki/data && cd /home/ubuntu/linki

if [ ! -f .env.local ]; then
  SECRET=$(openssl rand -base64 32)
  PASSWORD=$(openssl rand -base64 12 | tr -d '/+=' | head -c 12)
  cat > .env.local << EOF
NEXTAUTH_URL=http://${IP}:3456
NEXTAUTH_SECRET=${SECRET}
AUTH_PASSWORD=${PASSWORD}
EOF
else
  PASSWORD=$(grep '^AUTH_PASSWORD=' .env.local | cut -d= -f2-)
fi

cat > docker-compose.yml << EOF
version: '3.8'
services:
  linki:
    image: moaljumaa/linki:latest
    container_name: linki
    ports:
      - "3456:3000"
    env_file:
      - .env.local
    volumes:
      - ./data:/app/data
    restart: unless-stopped
EOF

$COMPOSE up -d || echo "⚠️  Linki: falhou ao subir (ver log acima)"

# ============================================================
# 4. BAILEYS (WhatsApp)
# ============================================================
echo "📱 [4/5] Deploy Baileys (WhatsApp)..."
mkdir -p /home/ubuntu/baileys/auth && cd /home/ubuntu/baileys

if [ ! -f .token ]; then
  openssl rand -hex 24 > .token
  chmod 600 .token
fi
TOKEN=$(cat .token)

cat > docker-compose.yml << EOF
version: '3.8'
services:
  baileys:
    image: chaymoo/baileys-gateway:latest
    container_name: baileys-gateway
    ports:
      - "3001:3000"
    environment:
      - API_TOKEN=${TOKEN}
    volumes:
      - ./auth:/app/data/auth
    restart: unless-stopped
EOF

$COMPOSE up -d || echo "⚠️  Baileys: falhou ao subir (ver log acima)"

# ============================================================
# 5. SCRAPER
# ============================================================
echo "🔍 [5/5] Deploy Scraper..."
cd /home/ubuntu

if [ ! -d "website-email-contact-scraper" ]; then
    git clone https://github.com/omkarcloud/website-email-contact-scraper.git || echo "⚠️  Scraper: clone falhou"
fi

if [ -d "website-email-contact-scraper" ]; then
    cd website-email-contact-scraper
    python3 -m venv .venv
    ./.venv/bin/pip install --upgrade pip || true
    [ -f requirements.txt ] && ./.venv/bin/pip install -r requirements.txt || echo "⚠️  Scraper: requirements com erro"
    ./.venv/bin/pip install fastapi uvicorn || true

    cat > start.sh << 'EOF'
#!/bin/bash
cd /home/ubuntu/website-email-contact-scraper
[ -f scraper.pid ] && kill $(cat scraper.pid) 2>/dev/null
nohup ./.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 > scraper.log 2>&1 &
echo $! > scraper.pid
EOF
    chmod +x start.sh
    ./start.sh
    chown -R ubuntu:ubuntu /home/ubuntu/website-email-contact-scraper
fi

# ============================================================
# SALVAR CREDENCIAIS
# ============================================================
cd /home/ubuntu
cat > CREDENCIAIS.txt << EOF
╔══════════════════════════════════════════════════════════╗
║   PROSPECTRA PLUS - CREDENCIAIS                         ║
║   Gerado em: $(date)                                    ║
╚══════════════════════════════════════════════════════════╝

🔗 LINKI (LinkedIn)
   URL: http://${IP}:3456
   Senha: ${PASSWORD}

📱 BAILEYS (WhatsApp)
   URL: http://${IP}:3001
   Token: ${TOKEN}

🔍 SCRAPER
   URL: http://${IP}:8000

🌐 PROSPECTRA PLUS
   URL: https://prospectra-eight.vercel.app

⚠️  SALVE ESTE ARQUIVO!
EOF

chmod 600 CREDENCIAIS.txt
chown ubuntu:ubuntu CREDENCIAIS.txt

# ============================================================
# VERIFICAÇÃO
# ============================================================
sleep 15
echo ""
echo "===== docker ps ====="
docker ps
echo "===== portas ====="
ss -ltnp | grep -E ':3456|:3001|:8000' || echo "⚠️  nenhuma porta escutando"
echo "===== scraper /docs ====="
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:8000/docs || echo "⚠️  scraper sem resposta (ver scraper.log)"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ✅ DEPLOY CONCLUÍDO                                   ║"
echo "╚═════════════════════════════════════════════════════════╝"
echo "🔐 Credenciais: /home/ubuntu/CREDENCIAIS.txt"
echo "📋 Log completo: /root/prospectra-install.log"

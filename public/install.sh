#!/bin/bash
# ============================================================
# PROSPECTRA PLUS - SERVIDOR DE INTEGRACOES (Oracle VM)
#
# Sobe na VM, atras de HTTPS (Caddy + Let's Encrypt):
#   - WhatsApp: prospectra-baileys-gateway  -> https://whatsapp.prospectra.argusprime.com.br
#   - Scraper:  omkarcloud website-email-contact-scraper (open source, sem creditos)
#                                            -> https://scraper.prospectra.argusprime.com.br
#
# Uso na VM (logado como ubuntu):
#   curl -sSL https://raw.githubusercontent.com/atintilio/prospectra-plus/main/public/install.sh | sudo bash
#
# Pode ser executado de novo com seguranca: segredos e sessao do WhatsApp sao preservados.
# Log: /root/prospectra-install.log
# ============================================================

set -e
exec > >(tee -a /root/prospectra-install.log) 2>&1
export DEBIAN_FRONTEND=noninteractive

APP_URL="https://prospectra.argusprime.com.br"
DOMAIN_WA="whatsapp.prospectra.argusprime.com.br"
DOMAIN_SCRAPER="scraper.prospectra.argusprime.com.br"
GATEWAY_REPO="git@github.com:atintilio/prospectra-baileys-gateway.git"
SCRAPER_REPO="https://github.com/omkarcloud/website-email-contact-scraper.git"
BASE=/opt/prospectra

echo ""
echo "=== PROSPECTRA PLUS - SERVIDOR DE INTEGRACOES ==="
echo ""

# ------------------------------------------------------------
# 0. SWAP (VM com 1 GB de RAM)
# ------------------------------------------------------------
if ! swapon --show | grep -q '/swapfile'; then
  echo "[0/7] Criando swap de 2 GB..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ------------------------------------------------------------
# 1. PACOTES + DOCKER
# ------------------------------------------------------------
echo "[1/7] Docker e dependencias..."
apt-get update -y
apt-get install -y docker.io git curl openssl ufw
apt-get install -y docker-compose-v2 2>/dev/null || apt-get install -y docker-compose
systemctl enable docker && systemctl start docker
usermod -aG docker ubuntu || true
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi
echo "   usando: $COMPOSE"

# ------------------------------------------------------------
# 2. FIREWALL: somente 22, 80 e 443
# ------------------------------------------------------------
echo "[2/7] Firewall (22, 80, 443)..."
for P in 22 80 443; do
  ufw allow ${P}/tcp >/dev/null
  iptables -C INPUT -p tcp -m state --state NEW --dport ${P} -j ACCEPT 2>/dev/null || \
    iptables -I INPUT 5 -p tcp -m state --state NEW --dport ${P} -j ACCEPT
done
for P in 3456 3001 8000; do
  ufw delete allow ${P}/tcp >/dev/null 2>&1 || true
  while iptables -D INPUT -p tcp -m state --state NEW --dport ${P} -j ACCEPT 2>/dev/null; do :; done
done
command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
ufw --force enable >/dev/null

# ------------------------------------------------------------
# 3. REMOVER A INSTALACAO ANTERIOR (Linki, Baileys antigo, scraper na 8000)
#    Nada e apagado: as pastas antigas vao para /opt/prospectra/_antigo
# ------------------------------------------------------------
echo "[3/7] Removendo servicos antigos nao usados pelo Prospectra..."
docker rm -f linki baileys-gateway >/dev/null 2>&1 || true
if [ -f /home/ubuntu/website-email-contact-scraper/scraper.pid ]; then
  kill "$(cat /home/ubuntu/website-email-contact-scraper/scraper.pid)" 2>/dev/null || true
fi
mkdir -p $BASE/_antigo
for D in linki baileys website-email-contact-scraper; do
  if [ -d /home/ubuntu/$D ]; then mv /home/ubuntu/$D $BASE/_antigo/$D-$(date +%s); fi
done
[ -f /home/ubuntu/CREDENCIAIS.txt ] && mv /home/ubuntu/CREDENCIAIS.txt $BASE/_antigo/ || true

# ------------------------------------------------------------
# 4. SEGREDOS (gerados uma vez e preservados)
# ------------------------------------------------------------
echo "[4/7] Segredos..."
mkdir -p $BASE && chmod 700 $BASE
if [ ! -f $BASE/secrets.env ]; then
  umask 077
  cat > $BASE/secrets.env <<EOF
GATEWAY_API_TOKEN=$(openssl rand -hex 32)
WEBHOOK_SECRET=$(openssl rand -hex 32)
SCRAPER_API_KEY=$(openssl rand -hex 32)
EOF
fi
# shellcheck disable=SC1091
. $BASE/secrets.env

# ------------------------------------------------------------
# 5. GATEWAY DO WHATSAPP (repositorio privado via deploy key somente leitura)
# ------------------------------------------------------------
echo "[5/7] Gateway do WhatsApp (prospectra-baileys-gateway)..."
mkdir -p $BASE/keys && chmod 700 $BASE/keys
[ -f $BASE/keys/gateway_deploy ] || ssh-keygen -t ed25519 -N "" -C "prospectra-vps-deploy" -f $BASE/keys/gateway_deploy >/dev/null
export GIT_SSH_COMMAND="ssh -i $BASE/keys/gateway_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

fetch_gateway() {
  if [ -d $BASE/baileys-gateway/.git ]; then
    git -C $BASE/baileys-gateway pull --ff-only
  else
    git clone --depth 1 $GATEWAY_REPO $BASE/baileys-gateway
  fi
}

TRIES=0
until fetch_gateway; do
  TRIES=$((TRIES+1))
  if [ $TRIES -ge 4 ]; then echo "ERRO: nao foi possivel baixar o gateway."; exit 1; fi
  echo ""
  echo "=================================================================="
  echo " ACAO NECESSARIA: autorizar esta VM a ler o repositorio do gateway"
  echo " Adicione a chave abaixo em:"
  echo "   github.com/atintilio/prospectra-baileys-gateway -> Settings -> Deploy keys -> Add deploy key"
  echo "   (Title: prospectra-vps | NAO marque 'Allow write access')"
  echo ""
  cat $BASE/keys/gateway_deploy.pub
  echo "=================================================================="
  echo "Depois de adicionar, pressione ENTER para continuar..."
  read -r _ < /dev/tty
done

mkdir -p $BASE/baileys-gateway/data/auth
cat > $BASE/baileys-gateway/.env <<EOF
PORT=8081
GATEWAY_API_TOKEN=${GATEWAY_API_TOKEN}
BAILEYS_AUTH_DIR=./data/auth
LOG_LEVEL=info
PROSPECTRA_WEBHOOK_URL=${APP_URL}/api/integrations/whatsapp/baileys-webhook
PROSPECTRA_WEBHOOK_SECRET=${WEBHOOK_SECRET}
EOF
chmod 600 $BASE/baileys-gateway/.env

# ------------------------------------------------------------
# 6. SCRAPER OPEN SOURCE (omkarcloud, MIT) no contrato /api/extract
# ------------------------------------------------------------
echo "[6/7] Scraper open source (omkarcloud/website-email-contact-scraper)..."
mkdir -p $BASE/scraper
if [ -d $BASE/scraper/engine/.git ]; then
  git -C $BASE/scraper/engine pull --ff-only
else
  git clone --depth 1 $SCRAPER_REPO $BASE/scraper/engine
fi
git -C $BASE/scraper/engine rev-parse --short HEAD > $BASE/scraper/engine/.commit

cat > $BASE/scraper/Dockerfile <<'EOF'
FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY engine/requirements.txt /app/engine-requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends curl wget ca-certificates gnupg git \
 && pip install -r /app/engine-requirements.txt fastapi "uvicorn[standard]" \
 && patchright install --with-deps chrome \
 && rm -rf /var/lib/apt/lists/*
COPY engine /app/engine
COPY app.py /app/app.py
RUN useradd -m scraper && chown -R scraper /app
USER scraper
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
EOF

cat > $BASE/scraper/app.py <<'PYEOF'
"""Prospectra+ Contact Scraper.

Servico HTTP que expoe o motor open source omkarcloud/website-email-contact-scraper
(MIT) no contrato HTTP do Prospectra; não é o ScrapeGraphAI gerenciado:

    POST /api/extract   (cabecalho SGAI-APIKEY)
    -> { "id": ..., "json": { companyName, description, sector, employees,
                              signals[], publicChannels[] }, "raw": "..." }

Sem IA, sem creditos, sem proxy. O Chrome "furtivo" (modo headed anti-bot) fica
desligado: sites protegidos por desafio anti-bot retornam erro em vez de serem
contornados. Nada e gravado em disco: o resultado volta ao Prospectra e e
descartado aqui.
"""

import hmac
import ipaddress
import json
import os
import socket
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from urllib.parse import urlsplit

# Pools de Chrome: o "contact" (headed, anti-bot) nunca e usado; o CSR
# (headless, so para sites em JavaScript) fica limitado a 1 por causa da RAM.
os.environ.setdefault("CONTACT_SCRAPER_CHROMES_MAX", "0")
os.environ.setdefault("CONTACT_SCRAPER_CSR_CHROMES_MAX", "1")

ENGINE_DIR = os.environ.get("SCRAPER_ENGINE_DIR", "/app/engine")
sys.path.insert(0, ENGINE_DIR)

from fastapi import FastAPI, Header  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from src.contact_scraper import api as engine  # noqa: E402
from src.contact_scraper import crawler, fetcher  # noqa: E402
from src.contact_scraper.aggregate import PLATFORM_KEYS  # noqa: E402

API_KEY = os.environ.get("SCRAPER_API_KEY", "").strip()
CRAWL_MODE = os.environ.get("SCRAPER_MODE", "key_pages")
MAX_SECONDS = int(os.environ.get("SCRAPER_MAX_SECONDS", "45"))
MAX_CONCURRENT = int(os.environ.get("SCRAPER_MAX_CONCURRENT", "2"))

crawler.MAX_CRAWL_SECONDS = MAX_SECONDS


# --- Anti-bot desligado ------------------------------------------------------
def _ensure_pool(self, reason):
    # Sempre o pool headless CSR; nunca o Chrome headed de contorno de desafio.
    if self.driver is None and self.pool_key is None:
        self.pool_key = fetcher.POOL_KEY_CSR


def _upgrade_for_block(self):
    return False


def _lease(self):
    if self.driver is None:
        self.pool_key = self.pool_key or fetcher.POOL_KEY_CSR
        self.driver = fetcher.chrome_manager.acquire(self.pool_key, timeout=60)
    return self.driver


fetcher.BrowserSession.ensure_pool = _ensure_pool
fetcher.BrowserSession.upgrade_for_block = _upgrade_for_block
fetcher.BrowserSession.lease = _lease
# -----------------------------------------------------------------------------

try:
    with open(os.path.join(ENGINE_DIR, ".commit"), encoding="utf-8") as fh:
        ENGINE_COMMIT = fh.read().strip()
except OSError:
    ENGINE_COMMIT = "desconhecido"

_slots = threading.BoundedSemaphore(MAX_CONCURRENT)
_executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT, thread_name_prefix="crawl")

app = FastAPI(title="Prospectra+ Contact Scraper", docs_url=None, redoc_url=None, openapi_url=None)


def _is_public_host(hostname):
    try:
        infos = socket.getaddrinfo(hostname, None)
    except OSError:
        return False
    if not infos:
        return False
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            return False
    return True


def _validate_url(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 2048:
        return None
    value = value.strip()
    if "://" not in value:
        value = "https://" + value
    parts = urlsplit(value)
    host = (parts.hostname or "").lower()
    if parts.scheme not in ("http", "https") or parts.username or parts.password:
        return None
    if not host or "." not in host or host.endswith((".local", ".internal")) or host == "localhost":
        return None
    if not _is_public_host(host):
        return None
    return value


def _clean(text, limit):
    if not isinstance(text, str):
        return ""
    return " ".join(text.split())[:limit]


def _values(items, limit):
    out = []
    for item in items or []:
        value = item.get("value") if isinstance(item, dict) else None
        if value and value not in out:
            out.append(value)
        if len(out) >= limit:
            break
    return out


def to_prospectra(result, source_url):
    emails = _values(result.get("emails"), 5)
    phones = _values(result.get("phones"), 3)
    socials = []
    for key in PLATFORM_KEYS:
        for value in _values(result.get(key), 2):
            socials.append(value)

    channels = [f"E-mail: {e}" for e in emails] + [f"Telefone: {p}" for p in phones] + socials

    contact_bits = []
    if emails:
        contact_bits.append("E-mails: " + ", ".join(emails))
    if phones:
        contact_bits.append("Telefones: " + ", ".join(phones))
    if socials:
        contact_bits.append("Redes: " + ", ".join(socials[:4]))
    site_description = _clean(result.get("description"), 180)
    description = " | ".join(part for part in [site_description] + contact_bits if part)

    signals = []
    for tech in (result.get("technologies") or [])[:15]:
        name = tech.get("name") if isinstance(tech, dict) else None
        if not name:
            continue
        categories = tech.get("categories") or []
        detail = ", ".join(c if isinstance(c, str) else str(c.get("name", c)) for c in categories)
        signals.append({"title": f"Tecnologia no site: {name}", "detail": detail, "date": "", "sourceUrl": source_url})

    return {
        "companyName": _clean(result.get("title"), 120),
        "description": description,
        "sector": "",
        "employees": "",
        "signals": signals,
        "publicChannels": channels,
    }


@app.get("/health")
def health():
    return {"status": "ok", "engine": "omkarcloud/website-email-contact-scraper", "commit": ENGINE_COMMIT,
            "mode": CRAWL_MODE, "antiBot": "desligado"}


@app.post("/api/extract")
def extract(payload: dict, sgai_apikey: str | None = Header(default=None, alias="SGAI-APIKEY")):
    if not API_KEY or not sgai_apikey or not hmac.compare_digest(sgai_apikey.strip(), API_KEY):
        return JSONResponse(status_code=401, content={"error": "invalid_api_key"})
    url = _validate_url(payload.get("url") if isinstance(payload, dict) else None)
    if not url:
        return JSONResponse(status_code=400, content={"error": "invalid_public_url"})

    request_id = "pc-" + uuid.uuid4().hex[:16]
    if not _slots.acquire(timeout=MAX_SECONDS):
        return JSONResponse(status_code=429, content={"error": "busy", "id": request_id})
    try:
        future = _executor.submit(engine._scrape_single, url, CRAWL_MODE)
        try:
            result = future.result(timeout=MAX_SECONDS + 15)
        except FuturesTimeout:
            return JSONResponse(status_code=504, content={"error": "timeout", "id": request_id})
        except Exception as exc:  # falha do motor nao derruba o servico
            return JSONResponse(status_code=502, content={"error": f"{type(exc).__name__}", "id": request_id})
    finally:
        _slots.release()

    data = to_prospectra(result, url)
    has_content = data["companyName"] or data["description"] or data["publicChannels"]
    if result.get("error") and not has_content:
        return JSONResponse(status_code=502, content={"error": str(result["error"])[:200], "id": request_id})
    return {"id": request_id, "json": data, "raw": json.dumps(result, ensure_ascii=False)[:50000]}
PYEOF

# ------------------------------------------------------------
# 7. CADDY (HTTPS) + DOCKER COMPOSE
# ------------------------------------------------------------
echo "[7/7] HTTPS e subida dos servicos (o primeiro build leva de 10 a 20 minutos)..."
cat > $BASE/Caddyfile <<EOF
${DOMAIN_WA} {
	reverse_proxy baileys:8081
}

${DOMAIN_SCRAPER} {
	reverse_proxy scraper:8000
}
EOF

cat > $BASE/docker-compose.yml <<EOF
services:
  baileys:
    build: ./baileys-gateway
    container_name: prospectra-baileys
    restart: unless-stopped
    env_file:
      - ./baileys-gateway/.env
    volumes:
      - ./baileys-gateway/data:/app/data
  scraper:
    build: ./scraper
    container_name: prospectra-scraper
    restart: unless-stopped
    shm_size: 256m
    environment:
      - SCRAPER_API_KEY=${SCRAPER_API_KEY}
      - SCRAPER_MODE=key_pages
      - SCRAPER_MAX_SECONDS=45
      - SCRAPER_MAX_CONCURRENT=2
  caddy:
    image: caddy:2
    container_name: prospectra-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - baileys
      - scraper
volumes:
  caddy_data:
  caddy_config:
EOF
chmod 600 $BASE/docker-compose.yml

cd $BASE
$COMPOSE build
$COMPOSE up -d

# ------------------------------------------------------------
# VARIAVEIS PARA A VERCEL
# ------------------------------------------------------------
cat > $BASE/VERCEL_ENV.txt <<EOF
BAILEYS_GATEWAY_URL=https://${DOMAIN_WA}
BAILEYS_GATEWAY_TOKEN=${GATEWAY_API_TOKEN}
BAILEYS_WEBHOOK_SECRET=${WEBHOOK_SECRET}
SCRAPER_BASE_URL=https://${DOMAIN_SCRAPER}
SCRAPER_API_KEY=${SCRAPER_API_KEY}
# aliases legados durante a migração
SGAI_BASE_URL=https://${DOMAIN_SCRAPER}
SGAI_API_KEY=${SCRAPER_API_KEY}
EOF
chmod 600 $BASE/VERCEL_ENV.txt

# ------------------------------------------------------------
# VERIFICACAO
# ------------------------------------------------------------
echo ""
echo "Aguardando servicos e certificados HTTPS..."
sleep 40
echo "===== containers ====="
docker ps --format 'table {{.Names}}\t{{.Status}}'
echo "===== WhatsApp gateway (local) ====="
docker exec prospectra-caddy wget -qO- http://baileys:8081/health 2>/dev/null || echo "sem resposta"
echo ""
echo "===== Scraper (local) ====="
docker exec prospectra-caddy wget -qO- http://scraper:8000/health 2>/dev/null || echo "sem resposta"
echo ""
echo "===== HTTPS publico ====="
curl -s -o /dev/null -w "whatsapp: HTTP %{http_code}\n" https://${DOMAIN_WA}/health || echo "whatsapp: HTTPS ainda nao disponivel (DNS/certificado)"
curl -s -o /dev/null -w "scraper:  HTTP %{http_code}\n" https://${DOMAIN_SCRAPER}/health || echo "scraper: HTTPS ainda nao disponivel (DNS/certificado)"

echo ""
echo "=== CONCLUIDO ==="
echo "Variaveis para a Vercel (projeto prospectra): sudo cat $BASE/VERCEL_ENV.txt"
echo "Log completo: /root/prospectra-install.log"

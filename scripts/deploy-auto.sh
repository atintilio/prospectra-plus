#!/usr/bin/env bash
# Auto-deploy: detecta novo commit em origin/main e implanta sozinho.
# Rodado por cron (a cada 2 min). Idempotente e com trava (flock no chamador).
# Loga em /var/log/pp-autodeploy.log.
set -uo pipefail

DIR=/opt/prospectra-plus-current
ENV_FILE=/etc/prospectra-plus/app.env
cd "$DIR" || exit 1

git fetch origin main -q 2>/dev/null || { echo "[auto] $(date -u) fetch falhou"; exit 0; }
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)
[ "$LOCAL" = "$REMOTE" ] && exit 0  # nada novo

echo "[auto] $(date -u) novo commit $REMOTE — implantando"
git checkout main -q 2>/dev/null || true
git pull --ff-only -q || { echo "[auto] pull falhou"; exit 1; }

export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"

# 1) CURA PRIMEIRO: corrige o schema e reinicia com o build ATUAL. Isso recupera o
#    site mesmo que o build novo demore ou falhe (o código já lida com as colunas;
#    só precisa que elas existam). Não depende de build.
echo "[auto] garantindo schema completo (ensure-schema)"
node scripts/ensure-schema.mjs 2>&1 | tail -5 || true
echo "[auto] reiniciando para aplicar schema"
systemctl restart prospectra-plus
sleep 5
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/health || echo 000)
echo "[auto] $(date -u) health pos-cura=$code"

# 2) Agora o build do código novo. Se falhar, o site segue no ar (já curado acima).
echo "[auto] install + build (codigo novo)"
pnpm install --silent 2>&1 | tail -2
if pnpm build 2>&1 | tail -3; then
  node scripts/ensure-schema.mjs 2>&1 | tail -3 || true
  systemctl restart prospectra-plus
  if systemctl list-unit-files | grep -q '^prospectra-argus-worker\.service'; then systemctl restart prospectra-argus-worker || true; fi
  sleep 5
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/health || echo 000)
  echo "[auto] $(date -u) OK build novo health=$code versao=$(git rev-parse --short HEAD)"
else
  echo "[auto] $(date -u) build novo FALHOU — site segue no ar na versao anterior (ja curado)"
fi

#!/usr/bin/env bash
# Deploy do Prospectra+ no release atual (/opt/prospectra-plus-current).
# Uso na VPS:  nohup bash scripts/deploy-vps-release.sh > /root/pp-deploy.log 2>&1 &
set -euo pipefail
cd /opt/prospectra-plus-current
# Lê o DATABASE_URL do app.env removendo aspas em volta (systemd aceita aspas; o shell, não).
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' /etc/prospectra-plus/app.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
echo "[deploy] versao: $(git rev-parse --short HEAD) ($(date -u +%H:%M:%S) UTC)"
echo "[deploy] pnpm install..."; pnpm install
echo "[deploy] build (aplica migracoes 0012/0013 + compila)..."; pnpm build
echo "[deploy] reiniciando prospectra-plus..."; systemctl restart prospectra-plus
sleep 5
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/health || echo 000)
echo "[deploy] health: $code"
if [ "$code" = "200" ]; then echo "[deploy] OK — no ar na versao $(git rev-parse --short HEAD)"; else echo "[deploy] ATENCAO: health != 200 — ver 'journalctl -u prospectra-plus -n 50'"; fi

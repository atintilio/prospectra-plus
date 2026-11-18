#!/usr/bin/env bash
# Instala o worker de enriquecimento Argus como serviço systemd na VPS.
# Roda o loop que drena enrichment_jobs (queued -> running -> completed), coleta
# sinais públicos (busca web keyless + MX + página/DNS) e grava no lead.
# Uso na VPS:  bash scripts/wire-argus.sh
set -euo pipefail

APP_DIR=/opt/prospectra-plus-current
ENV_FILE=/etc/prospectra-plus/app.env
UNIT=/etc/systemd/system/prospectra-argus-worker.service

[ -d "$APP_DIR" ] || { echo "release nao encontrado em $APP_DIR"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "env nao encontrado em $ENV_FILE"; exit 1; }

echo "[argus] compilando bundle do worker..."
cd "$APP_DIR"
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
pnpm build:argus-worker

echo "[argus] instalando unit systemd..."
cat > "$UNIT" <<UNITEOF
[Unit]
Description=Prospectra+ Argus enrichment worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $APP_DIR/.dist/argus-worker.cjs
Restart=always
RestartSec=5
# Ritmo humano/seguro nas buscas públicas é controlado pelo loop (1 job a cada ~3s).

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
systemctl enable --now prospectra-argus-worker
sleep 2
systemctl --no-pager --full status prospectra-argus-worker | head -12 || true
echo "[argus] logs:  journalctl -u prospectra-argus-worker -n 30 -f"

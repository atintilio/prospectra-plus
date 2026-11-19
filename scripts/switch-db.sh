#!/usr/bin/env bash
# Troca o banco do Prospectra para uma nova URL (ex.: Supabase), com segurança.
# - Faz backup do app.env e preserva a URL antiga como DATABASE_URL_OLD (recuperação).
# - Cria o schema completo no banco novo (migrate + ensure-schema).
# - Recria usuários a partir do arquivo legado, se existir (preserva login).
# - Reinicia o app e checa a saúde.
# Uso:  bash scripts/switch-db.sh 'postgresql://...supabase-session-pooler...:5432/postgres'
set -uo pipefail

NEW="${1:-}"
ENV=/etc/prospectra-plus/app.env
cd /opt/prospectra-plus-current || exit 1

if [ -z "$NEW" ]; then echo "uso: bash scripts/switch-db.sh '<URL do banco novo>'"; exit 1; fi
case "$NEW" in postgres://*|postgresql://*) : ;; *) echo "URL inválida (precisa começar com postgres:// ou postgresql://)"; exit 1;; esac

cp "$ENV" "$ENV.bak.$(date +%s)" && echo "[switch] backup do app.env feito"

# Preserva a URL atual como DATABASE_URL_OLD (sem duplicar) e grava a nova.
sed -i '/^DATABASE_URL_OLD=/d' "$ENV"
if grep -q '^DATABASE_URL=' "$ENV"; then
  OLD=$(grep -m1 '^DATABASE_URL=' "$ENV" | cut -d= -f2-)
  sed -i '/^DATABASE_URL=/d' "$ENV"
  printf 'DATABASE_URL_OLD=%s\n' "$OLD" >> "$ENV"
fi
printf 'DATABASE_URL="%s"\n' "$NEW" >> "$ENV"
echo "[switch] app.env atualizado (URL antiga guardada em DATABASE_URL_OLD)"

export DATABASE_URL="$NEW"
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"

echo "[switch] criando schema + usuários no banco novo (migrate)"
node scripts/migrate.mjs 2>&1 | tail -6 || true
echo "[switch] garantindo schema completo (ensure-schema)"
node scripts/ensure-schema.mjs 2>&1 | tail -8 || true

echo "[switch] reiniciando app"
systemctl restart prospectra-plus
if systemctl list-unit-files | grep -q '^prospectra-argus-worker\.service'; then systemctl restart prospectra-argus-worker || true; fi
sleep 6
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/health || echo 000)
echo "[switch] health=$code"
[ "$code" = "200" ] && echo "[switch] OK — banco novo no ar" || echo "[switch] ATENCAO: health != 200, ver journalctl -u prospectra-plus -n 30"

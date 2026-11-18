#!/usr/bin/env bash
# Liga o Prospectra ao worker Go: copia GO_SECRET/DISPATCH_SECRET/porta do go.env
# para o app.env e ativa a automação. Não imprime valores de segredo.
set -euo pipefail
GOENV=/etc/prospectra-go/go.env
APPENV=/etc/prospectra-plus/app.env
val(){ grep -m1 "^$1=" "$2" | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
GO_SECRET="$(val GO_SECRET "$GOENV")"; DISPATCH_SECRET="$(val DISPATCH_SECRET "$GOENV")"; PORT="$(val PORT "$GOENV")"
[ -n "$GO_SECRET" ] && [ -n "$DISPATCH_SECRET" ] && [ -n "$PORT" ] || { echo "ERRO: faltam GO_SECRET/DISPATCH_SECRET/PORT em $GOENV"; exit 1; }
cp -a "$APPENV" "$APPENV.bak-$(date +%s)"
upsert(){ local k="$1" v="$2"; if grep -q "^$k=" "$APPENV"; then sed -i "s|^$k=.*|$k=$v|" "$APPENV"; else echo "$k=$v" >> "$APPENV"; fi; }
upsert DISPATCH_SECRET "$DISPATCH_SECRET"
upsert GO_SECRET "$GO_SECRET"
upsert GO_BASE_URL "http://127.0.0.1:$PORT"
upsert LINKEDIN_AUTOMATION_ENABLED "true"
chmod 600 "$APPENV"
systemctl restart prospectra-plus
sleep 5
echo "health: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/api/health)"
echo "OK: app.env atualizado (DISPATCH_SECRET, GO_SECRET, GO_BASE_URL=http://127.0.0.1:$PORT, LINKEDIN_AUTOMATION_ENABLED=true) — backup salvo."

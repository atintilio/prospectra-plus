#!/usr/bin/env bash
# Argus Prime — publica uma nova versão do site COM ROLLBACK, por troca de symlink.
# Cada deploy vira uma "release" datada; a ativa é um symlink. Rollback = apontar
# o symlink para a release anterior (instantâneo, sem downtime).
#
# Uso:
#   sudo bash deploy.sh /caminho/para/argus-prime-site_PUBLICAR.zip
#   sudo bash deploy.sh --rollback          # volta para a release anterior
#   sudo bash deploy.sh --list              # lista releases

set -euo pipefail

DOMINIO="argusprime.com.br"
WEBROOT="/var/www/${DOMINIO}"
RELEASES="/var/www/${DOMINIO}_releases"

listar() { ls -1dt "${RELEASES}"/*/ 2>/dev/null | sed 's#/$##'; }

if [ "${1:-}" = "--list" ]; then
  echo "Release ativa: $(readlink -f "${WEBROOT}")"
  echo "Releases (mais nova no topo):"; listar; exit 0
fi

if [ "${1:-}" = "--rollback" ]; then
  mapfile -t rels < <(listar)
  atual="$(readlink -f "${WEBROOT}")"
  anterior=""
  for r in "${rels[@]}"; do [ "$r" != "$atual" ] && { anterior="$r"; break; }; done
  [ -z "$anterior" ] && { echo "Não há release anterior para voltar."; exit 1; }
  ln -sfn "$anterior" "${WEBROOT}"
  systemctl reload apache2
  echo "Rollback feito. Agora ativa: $anterior"; exit 0
fi

ZIP="${1:-}"
[ -z "$ZIP" ] || [ ! -f "$ZIP" ] && { echo "Informe o .zip do site. Ex.: sudo bash deploy.sh site.zip"; exit 1; }

NOVA="${RELEASES}/$(date +%Y%m%d-%H%M%S)"
echo "==> Extraindo para ${NOVA}..."
mkdir -p "$NOVA"
unzip -q "$ZIP" -d "$NOVA"
# se o zip tiver uma pasta única no topo, sobe o conteúdo um nível
if [ "$(find "$NOVA" -maxdepth 1 -mindepth 1 | wc -l)" -eq 1 ] && [ -d "$(find "$NOVA" -maxdepth 1 -mindepth 1)" ]; then
  sub="$(find "$NOVA" -maxdepth 1 -mindepth 1)"; shopt -s dotglob; mv "$sub"/* "$NOVA"/; rmdir "$sub"; shopt -u dotglob
fi

echo "==> Ajustando dono/permissões..."
chown -R www-data:www-data "$NOVA"
find "$NOVA" -type d -exec chmod 755 {} \;
find "$NOVA" -type f -exec chmod 644 {} \;

echo "==> Validando que o index existe..."
[ -f "$NOVA/index.html" ] || { echo "ERRO: index.html não encontrado na release. Abortando."; rm -rf "$NOVA"; exit 1; }

echo "==> Ativando a nova release (troca de symlink)..."
ln -sfn "$NOVA" "${WEBROOT}"
apache2ctl configtest
systemctl reload apache2

echo "==> Limpando releases antigas (mantém as 5 mais novas)..."
listar | tail -n +6 | xargs -r rm -rf

echo
echo "OK. Publicado: $NOVA"
echo "Rollback a qualquer momento: sudo bash deploy.sh --rollback"

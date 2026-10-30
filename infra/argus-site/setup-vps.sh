#!/usr/bin/env bash
# Argus Prime — site institucional na VPS (Apache + PHP), migrando do Manus.
# Serve argusprime.com.br a partir de /var/www/argusprime.com.br com .htaccess ativo.
# Idempotente: pode rodar de novo sem quebrar. Requer root (sudo).
#
# Uso:
#   sudo bash setup-vps.sh
# Depois suba os arquivos do site para releases/ (ver README.md) e rode deploy.sh.

set -euo pipefail

DOMINIO="argusprime.com.br"
WEBROOT="/var/www/${DOMINIO}"          # symlink para a release ativa
RELEASES="/var/www/${DOMINIO}_releases"

echo "==> Instalando Apache + PHP..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y apache2 php libapache2-mod-php php-cli unzip curl

echo "==> Habilitando módulos (rewrite, headers, deflate) + PHP..."
a2enmod rewrite headers deflate >/dev/null

echo "==> Criando diretórios..."
mkdir -p "${RELEASES}"
# docroot inicial (placeholder) até o primeiro deploy criar o symlink
if [ ! -e "${WEBROOT}" ]; then
  mkdir -p "${RELEASES}/inicial"
  echo "Site em preparação." > "${RELEASES}/inicial/index.html"
  ln -s "${RELEASES}/inicial" "${WEBROOT}"
fi

echo "==> Configurando o VirtualHost..."
cat > "/etc/apache2/sites-available/${DOMINIO}.conf" <<APACHE
<VirtualHost *:80>
    ServerName ${DOMINIO}
    ServerAlias www.${DOMINIO}
    DocumentRoot ${WEBROOT}

    <Directory ${WEBROOT}>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/${DOMINIO}-error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMINIO}-access.log combined
</VirtualHost>
APACHE

a2ensite "${DOMINIO}.conf" >/dev/null
a2dissite 000-default.conf >/dev/null 2>&1 || true
apache2ctl configtest
systemctl reload apache2

echo "==> Liberando firewall (se o ufw estiver ativo)..."
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp  >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
fi

echo
echo "OK. Apache servindo ${WEBROOT} na porta 80."
echo "Próximo: suba o site (README.md) e rode deploy.sh. Depois configure o HTTPS com certbot."

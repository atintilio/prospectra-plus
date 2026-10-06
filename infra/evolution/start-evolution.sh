#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não foi encontrado. Instale o Docker Desktop para Mac." >&2
  exit 1
fi

if [ ! -f .env ]; then
  api_key="$(openssl rand -base64 48 | tr -d '\n')"
  db_password="$(openssl rand -base64 32 | tr -d '\n')"
  webhook_secret="$(openssl rand -base64 32 | tr -d '\n')"
  cat > .env <<EOF
SERVER_NAME=prospectra-evolution
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=http://localhost:8080
CORS_ORIGIN=https://prospectra.argusprime.com.br
CORS_METHODS=GET,POST,PUT,DELETE
CORS_CREDENTIALS=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:${db_password}@evolution-postgres:5432/evolution
DATABASE_CONNECTION_CLIENT_NAME=prospectra
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_HISTORIC=true
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://evolution-redis:6379
CACHE_REDIS_PREFIX_KEY=prospectra-evolution
CACHE_REDIS_TTL=604800
CACHE_REDIS_SAVE_INSTANCES=true
CACHE_LOCAL_ENABLED=true
AUTHENTICATION_API_KEY=${api_key}
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false
DEL_INSTANCE=false
DEL_TEMP_INSTANCES=true
LANGUAGE=pt-BR
WEBHOOK_GLOBAL_ENABLED=false
WEBHOOK_EVENTS_CONNECTION_UPDATE=false
WEBHOOK_EVENTS_QRCODE_UPDATED=false
WEBHOOK_EVENTS_MESSAGES_UPSERT=false
WEBHOOK_EVENTS_MESSAGES_UPDATE=false
WEBHOOK_EVENTS_SEND_MESSAGE=false
POSTGRES_DATABASE=evolution
POSTGRES_USERNAME=evolution
POSTGRES_PASSWORD=${db_password}
PROSPECTRA_WEBHOOK_SECRET=${webhook_secret}
EOF
  chmod 600 .env
  echo "Arquivo .env criado. Guarde AUTHENTICATION_API_KEY e PROSPECTRA_WEBHOOK_SECRET para cadastrar no Vercel." >&2
fi

echo "Baixando imagens..."
docker compose --env-file .env pull
echo "Iniciando Evolution, PostgreSQL e Redis..."
docker compose --env-file .env up -d
docker compose --env-file .env ps
echo "Evolution local: http://localhost:8080"
echo "Em outra janela, execute ./start-tunnel.sh para obter uma URL HTTPS pública."

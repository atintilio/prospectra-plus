$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker Desktop não foi encontrado. Instale o Docker Desktop para Windows e execute novamente.'
}

$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) {
  $apiKey = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
  $dbPassword = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
  $webhookSecret = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
  @"
SERVER_NAME=prospectra-evolution
SERVER_TYPE=http
SERVER_PORT=8080
SERVER_URL=http://localhost:8080
CORS_ORIGIN=https://prospectra.argusprime.com.br
CORS_METHODS=GET,POST,PUT,DELETE
CORS_CREDENTIALS=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:$dbPassword@evolution-postgres:5432/evolution
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
AUTHENTICATION_API_KEY=$apiKey
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
POSTGRES_PASSWORD=$dbPassword
PROSPECTRA_WEBHOOK_SECRET=$webhookSecret
"@ | Set-Content -Path $envFile -Encoding utf8
  Write-Host "Arquivo .env criado em $envFile" -ForegroundColor Green
  Write-Host 'Guarde a AUTHENTICATION_API_KEY e a PROSPECTRA_WEBHOOK_SECRET: elas serão necessárias no Vercel.' -ForegroundColor Yellow
}

Write-Host 'Baixando imagens da Evolution API, PostgreSQL e Redis...' -ForegroundColor Cyan
docker compose --env-file .env pull
Write-Host 'Iniciando a Evolution API com volumes persistentes...' -ForegroundColor Cyan
docker compose --env-file .env up -d
Write-Host ''
docker compose --env-file .env ps
Write-Host ''
Write-Host 'Teste local: http://localhost:8080' -ForegroundColor Green
Write-Host 'Para obter uma URL pública temporária, execute start-tunnel.ps1 em outra janela.' -ForegroundColor Yellow

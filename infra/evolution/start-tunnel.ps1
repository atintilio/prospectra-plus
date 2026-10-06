$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host 'cloudflared não foi encontrado.' -ForegroundColor Yellow
  Write-Host 'Instale com: winget install Cloudflare.cloudflared' -ForegroundColor Cyan
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error 'Docker Desktop não foi encontrado.'
}

try {
  $health = Invoke-WebRequest -Uri 'http://localhost:8080/' -UseBasicParsing -TimeoutSec 5
  Write-Host "Evolution respondeu localmente com HTTP $($health.StatusCode)." -ForegroundColor Green
} catch {
  Write-Error 'A Evolution não respondeu em http://localhost:8080. Execute start-evolution.ps1 primeiro.'
}

Write-Host 'Abrindo túnel HTTPS temporário. Copie a URL https://*.trycloudflare.com exibida abaixo.' -ForegroundColor Cyan
Write-Host 'Essa URL muda quando o túnel é reiniciado; para produção, use um túnel nomeado Cloudflare.' -ForegroundColor Yellow
cloudflared tunnel --url http://localhost:8080

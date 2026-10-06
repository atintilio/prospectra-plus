#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared não foi encontrado." >&2
  echo "Instale com: brew install cloudflared" >&2
  exit 1
fi

if ! curl -fsS --max-time 5 http://localhost:8080/ >/dev/null; then
  echo "A Evolution não respondeu em http://localhost:8080. Execute ./start-evolution.sh primeiro." >&2
  exit 1
fi

echo "Copie a URL https://*.trycloudflare.com exibida abaixo e cadastre-a como EVOLUTION_API_URL no Vercel."
echo "A URL temporária muda quando o túnel for reiniciado."
cloudflared tunnel --url http://localhost:8080

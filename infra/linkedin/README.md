# Worker de LinkedIn (VPS)

Executa a automação não-oficial do LinkedIn fora da Vercel (serverless não roda navegador
headless persistente). O app chama este worker via HTTP (`src/lib/linkedin/http-executor.ts`):
`POST /dispatch` → o worker faz **uma** ação logado por cookie `li_at` + proxy e devolve
`{state:'sent'|'unknown', providerId?}`. Resultado incerto (`unknown`) **nunca** é reenviado —
a fila/limites do app cuidam disso.

> ⚠️ Automação não-oficial viola os Termos do LinkedIn (§8.2) e pode restringir/banir a conta.
> É decisão do proprietário. O desenho isola o risco (segredos só aqui, 1 IP/conta, 1 ação por
> vez, para em checkpoint), mas não o elimina.

## Arquitetura
- **1 instância por conta.** Vários vendedores = vários processos (portas/`.env` distintos).
- **1 ação por vez** por instância (serializada) — nunca paralelizar a mesma sessão.
- **Espaçamento humano** vem da fila do app (delays da cadência + `dailyInvites`/`dailyMessages`
  + frequência do cron), **não** de esperas longas aqui (estourariam o timeout de 60s do app).
  O worker só adiciona jitter curto (~1–4s) e para em checkpoint/CAPTCHA.

## Rodar
```bash
cd infra/linkedin
cp .env.example .env   # preencha LINKEDIN_WORKER_KEY, LI_AT, PROXY_URL
npm install            # instala Playwright + Chromium
npm test               # self-check (auth, validação, serialização; sem navegador)
npm start              # escuta em 127.0.0.1:$PORT
```

## Expor para a Vercel
O worker escuta em `127.0.0.1`. Exponha com TLS (nginx ou um túnel como Cloudflare Tunnel) num
host HTTPS, e na Vercel configure:
```
LINKEDIN_AUTOMATION_ENABLED=true
LINKEDIN_WORKER_URL=https://seu-host         # sem query/credenciais; o app chama <URL>/dispatch
LINKEDIN_WORKER_KEY=<mesmo valor do .env>
```
Sem essas variáveis o app fica no fluxo assistido (Fila) — nada muda.

## systemd (exemplo)
```ini
[Unit]
Description=Prospectra LinkedIn worker
After=network-online.target

[Service]
WorkingDirectory=/opt/prospectra/infra/linkedin
EnvironmentFile=/opt/prospectra/infra/linkedin/.env
ExecStart=/usr/bin/node worker.mjs
Restart=on-failure
User=prospectra

[Install]
WantedBy=multi-user.target
```

## Limite conhecido
Os seletores do LinkedIn (`worker.mjs`, função `createLinkedinRunner`) mudam sem aviso. Só é
devolvido `sent` com sinal visível de sucesso; na dúvida, `unknown`. **Revalide os seletores
contra o LinkedIn vivo antes de ligar em produção** e ajuste o warm-up/limites por conta.

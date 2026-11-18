# prospectra-go — conector de automação do LinkedIn

Recebe ações por-lead do Prospectra (`POST /acoes`), enfileira no Redis e um worker
executa e devolve o resultado ao Prospectra por webhook (`POST /api/dispatch`).

Contrato em `docs/GO-INTEGRACAO.md`.

## Arquitetura
- `server.js` — API `POST /acoes` (auth `x-go-secret`) + `GET /health`; enfileira no Redis.
- `worker.js` — consome a fila; executa a ação e devolve `kind:"action"` (+`kind:"account"`).
- `lib/cursor.js` — movimento de mouse humano (ghost-cursor + Bézier); nunca `element.click()`.
- `lib/linkedin.js` — ações reais (invite/message/react/comment), login-check e detecção de limite.
- `lib/accounts.js` — armazém local por conta: `storageState` (cookies) + proxy, em `GO_DATA_DIR`.
- `login.js` — captura a sessão do LinkedIn uma vez (sem guardar senha).

## Modos
- **DRY_RUN=true (padrão, seguro):** não toca no LinkedIn; valida o laço fila→worker→dispatch.
- **DRY_RUN=false (real):** usa Patchright (Playwright stealth) + movimento humano. Requer:
  1. `npm install` (baixa o Chromium do Patchright via postinstall);
  2. headful — em servidor sem tela, rode sob `xvfb-run -a`;
  3. a conta precisa estar logada (ver abaixo).

## Login de uma conta (uma vez, sem senha no Prospectra)
`conta_id` = `providerId` da conta LinkedIn no Prospectra.
```
node login.js <conta_id> [proxy_server] [proxy_user] [proxy_pass]
```
Abre o navegador; você faz login manualmente. Ao detectar o cookie `li_at`, salva o
`storageState` em `GO_DATA_DIR/accounts/<conta_id>.json` (permissão 0600). Em VPS sem
tela: rode sob xvfb+VNC, ou faça numa máquina com tela e copie o arquivo.

## Variáveis
`PORT`, `REDIS_URL`, `QUEUE_NAME`, `GO_SECRET`, `DISPATCH_SECRET`, `DRY_RUN`,
`GO_DATA_DIR` (padrão `./.data`). O proxy fica por conta no armazém.

## Segurança / ritmo
Cookies e proxy vivem só aqui, nunca no Prospectra. O espaçamento entre ações por
conta, janela de horário e teto semanal são aplicados pelo Prospectra (cadência/cron).
A detecção de limite marca a conta (`blocked`/`checkpoint`/`expired`) de volta no dispatch.
Automação de LinkedIn viola os termos da plataforma e pode gerar bloqueio — use com
contas próprias, leads conhecidos e ritmo humano.

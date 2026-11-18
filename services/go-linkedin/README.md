# prospectra-go — conector de automação do LinkedIn

Recebe ações por-lead do Prospectra (`POST /acoes`), enfileira no Redis e um worker
executa e devolve o resultado ao Prospectra por webhook (`POST /api/dispatch`).

Contrato em `docs/GO-INTEGRACAO.md`. Começa em `DRY_RUN=true` (não toca no LinkedIn);
a execução real via Playwright é a etapa seguinte, ajustada ao vivo.

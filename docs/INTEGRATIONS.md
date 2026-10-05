# Integrações do Prospectra+

## ScrapeGraphAI

O provedor padrão da aplicação é o **ScrapeGraphAI v2**, com base URL `https://v2-api.scrapegraphai.com` e endpoint `POST /api/extract`. A API gerenciada usa o cabeçalho `SGAI-APIKEY` e é chamada exclusivamente pelos handlers server-side `/api/integrations/scrapegraph/*`; a chave nunca é enviada ao bundle do navegador.

O prompt e o JSON Schema do Prospectra extraem nome, descrição, setor, porte aproximado, sinais públicos recentes e canais públicos. O retorno preserva `requestId`, URL de origem e data de coleta. Se `SGAI_API_KEY` não estiver configurada, a UI exibe **Aguardando chave** e não simula um resultado. Quando configurada, o formulário de enriquecimento executa a chamada real e apresenta a resposta como sugestão revisável.

O endpoint v2 é utilizado porque os hosts e nomes v1 (`api.scrapegraphai.com/v1`, `smartscraper`, `markdownify`) estão depreciados na documentação atual do provedor. A aplicação aceita `SGAI_BASE_URL` para ambientes controlados, mas o valor padrão não deve ser trocado sem validar o contrato v2.

### Enriquecimento em lote por CSV/XLSX

A área **Enriquecimento** também aceita `.csv`, `.xlsx` e `.xls`. O navegador lê a primeira aba do arquivo, sugere a coluna de URL/domínio por nomes como `url`, `site`, `website`, `dominio` ou `link` e permite escolher outra coluna. Uma coluna opcional de empresa pode ser usada para exibição quando a API não encontrar o nome.

Ao iniciar o lote, apenas linhas com URL pública válida entram na fila. Cada linha chama o mesmo endpoint autenticado `/api/integrations/scrapegraph/enrich`; três workers executam em paralelo para preservar estabilidade e o progresso, request ID, status e erro ficam visíveis por linha. O botão **Exportar CSV** gera uma saída local com URL, status, empresa, setor, descrição, request ID e erro. O processamento consome créditos do ScrapeGraphAI por requisição; a aplicação não finge sucesso quando a chave está ausente ou o provedor falha.

A biblioteca open source `Scrapegraph-ai` também é uma alternativa MIT, mas exige uma execução Python, modelo LLM próprio e, em cenários de páginas JavaScript, Playwright e infraestrutura operacional. O produto não deve habilitar proxies ou mecanismos anti-bot por padrão.

## WhatsApp — decisão do MVP

Entre Evolution API, WPPConnect Server e whatsapp-web.js, o MVP prioriza **Evolution API**. Ela é uma camada REST pronta para produção, suporta múltiplas instâncias, QR Code, webhooks, eventos, Docker, persistência e integração com Baileys e Cloud API. A execução ficará em um serviço persistente separado do Vercel, com Redis/banco e volumes para sessões; o Prospectra consumirá somente seu adaptador server-side.

WPPConnect Server permanece como fallback para fluxos de customização profunda e whatsapp-web.js não entra como núcleo porque é uma biblioteca Puppeteer, não um servidor multi-instância pronto. Os três são não oficiais quando usados via WhatsApp Web e podem sofrer desconexão, mudança de protocolo ou bloqueio; a operação precisa aceitar esse risco e manter plano de troca para Cloud API.

## LinkedIn

O Prospectra usará um adaptador não oficial configurável para o LinkedIn, conforme definido pelo usuário. O adaptador deve ficar isolado no servidor e expor health, send, webhook e status; não armazena cookies do navegador nem simula cliques. A operação depende de credencial, base URL, escopos do provedor, quota, custo e reconciliação de estados.

## CRM

A referência `trycompai/crm` organiza dados CRM e pesquisa por agentes, com registros de contas, contatos, negócios, atividades e filas. O Prospectra poderá interoperar por API no futuro, mas não pressupõe que o CRM externo seja multi-tenant nem transfere dados pessoais sem contrato e autorização.

# Integrações do Prospectra+

## ScrapeGraphAI

O provedor padrão da aplicação é o **ScrapeGraphAI v2**, com base URL `https://v2-api.scrapegraphai.com` e endpoint `POST /api/extract`. A API gerenciada usa o cabeçalho `SGAI-APIKEY` e é chamada exclusivamente pelos handlers server-side `/api/integrations/scrapegraph/*`; a chave nunca é enviada ao bundle do navegador.

O prompt e o JSON Schema do Prospectra extraem nome, descrição, setor, porte aproximado, sinais públicos recentes e canais públicos. O retorno preserva `requestId`, URL de origem e data de coleta. Se `SGAI_API_KEY` não estiver configurada, a UI exibe **Aguardando chave** e não simula um resultado. Quando configurada, o formulário de enriquecimento executa a chamada real e apresenta a resposta como sugestão revisável.

O endpoint v2 é utilizado porque os hosts e nomes v1 (`api.scrapegraphai.com/v1`, `smartscraper`, `markdownify`) estão depreciados na documentação atual do provedor. A aplicação aceita `SGAI_BASE_URL` para ambientes controlados, mas o valor padrão não deve ser trocado sem validar o contrato v2.

### Enriquecimento em lote por CSV/XLSX

A área **Enriquecimento** também aceita `.csv`, `.xlsx` e `.xls`. O navegador lê a primeira aba do arquivo, sugere a coluna de URL/domínio por nomes como `url`, `site`, `website`, `dominio` ou `link` e permite escolher outra coluna. Uma coluna opcional de empresa pode ser usada para exibição quando a API não encontrar o nome.

O modo padrão é **Importar dados prontos**: ele incorpora a base ao CRM sem fazer chamada externa e sem consumir créditos. O importador reconhece, quando presentes, empresa, domínio, setor, porte, score, responsável, contato, cargo, e-mail, LinkedIn, URL da evidência, trecho e indicador de verificação. Duplicidades por domínio ou nome são atualizadas em vez de gerar uma segunda conta. O operador deve revisar evidências e contatos antes de aprovar uma ação.

O modo **Pesquisar com ScrapeGraphAI** é opt-in. Ao iniciar, apenas linhas com URL pública válida entram na fila; cada linha chama o endpoint autenticado `/api/integrations/scrapegraph/enrich`, três workers executam em paralelo e o progresso, request ID, status, origem e erro ficam visíveis por linha. O botão **Exportar CSV** gera uma saída local. Somente esse segundo modo consome créditos do ScrapeGraphAI; a aplicação não finge sucesso quando a chave está ausente ou o provedor falha.

A biblioteca open source `Scrapegraph-ai` também é uma alternativa MIT, mas exige uma execução Python, modelo LLM próprio e, em cenários de páginas JavaScript, Playwright e infraestrutura operacional. O produto não deve habilitar proxies ou mecanismos anti-bot por padrão.

## WhatsApp — Baileys Gateway

O provedor padrão não oficial do Prospectra é o **Baileys**, encapsulado no projeto separado `prospectra-baileys-gateway`. Baileys é uma biblioteca MIT, não uma API REST pronta; o gateway fornece o contrato operacional que a aplicação precisa: `GET /health`, `GET /v1/status`, `POST /v1/session/start`, `GET /v1/qr`, `POST /v1/session/logout` e `POST /v1/messages/text`.

O gateway usa Node 20+, sessão persistente em `BAILEYS_AUTH_DIR` (por padrão `data/auth`), token `GATEWAY_API_TOKEN`, reconexão e webhook assinado para `/api/integrations/whatsapp/baileys-webhook`. O Prospectra chama o gateway apenas server-side. O painel só exibe **Conectado** depois de o health check retornar a sessão pareada; não há QR simulado.

O envio exige `approved=true` e `optIn=true` no gateway, além das validações de copy, evidência, contato, pausa e oposição no Prospectra. Mensagens recebidas pelo webhook pausam a conta correspondente quando o remetente é identificado no CRM.

O `WHATSAPP_PROVIDER` padrão é `baileys`. Evolution API continua disponível como fallback explícito (`WHATSAPP_PROVIDER=evolution`) para um serviço persistente separado. WPPConnect Server permanece alternativa de customização e `whatsapp-web.js` não entra como núcleo por depender de Chromium. Todas as opções via WhatsApp Web são não oficiais e podem sofrer desconexão, mudança de protocolo ou bloqueio.

## LinkedIn

O Prospectra mantém o LinkedIn assistido por padrão: abrir perfil, copiar copy aprovada e registrar a ação humana. A conexão opcional de conta foi estruturada com Hosted Auth do Unipile em `/api/integrations/prospecting/*`, usando link temporário, callback protegido e armazenamento privado somente do estado/identificador. Ela exige `UNIPILE_DSN`, `UNIPILE_API_KEY` e `UNIPILE_WEBHOOK_SECRET` no Vercel; sem esses valores a UI informa que o provedor não está configurado.

Conectar uma conta **não autoriza automaticamente convites ou mensagens**. O adapter não armazena cookies, não simula cliques e não envia nada no estado atual; qualquer provider futuro precisa comprovar escopos, quota, custo, webhook assinado, reconciliação e compatibilidade contratual antes de habilitar transporte.

O produto também não promete que a automação do LinkedIn seja permitida pelo LinkedIn: a política pública da plataforma proíbe crawlers, bots, extensões e métodos automatizados não autorizados para copiar dados ou enviar mensagens/convites. A opção desktop segue separada, pois exigiria aplicativo assinado, atualização, máquina ativa e suporte operacional.

## CRM

A referência `trycompai/crm` organiza dados CRM e pesquisa por agentes, com registros de contas, contatos, negócios, atividades e filas. O Prospectra poderá interoperar por API no futuro, mas não pressupõe que o CRM externo seja multi-tenant nem transfere dados pessoais sem contrato e autorização.

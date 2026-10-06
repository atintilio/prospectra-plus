# Integrações do Prospectra+

## ScrapeGraphAI

O provedor padrão da aplicação é o **ScrapeGraphAI v2**, com base URL `https://v2-api.scrapegraphai.com` e endpoint `POST /api/extract`. A API gerenciada usa o cabeçalho `SGAI-APIKEY` e é chamada exclusivamente pelos handlers server-side `/api/integrations/scrapegraph/*`; a chave nunca é enviada ao bundle do navegador.

O fluxo individual de `POST /api/extract` extrai nome, descrição, setor, porte, sinais e pessoas nomeadas na página pública. Para cada pessoa, solicita cargo, telefone profissional, e-mail profissional e URL exata de perfil LinkedIn quando publicados; a ausência permanece vazia. O botão separado **Descobrir pessoas** chama `POST /api/search` para cinco resultados públicos de empresa, equipe e perfis, exige URL de origem em cada sugestão e mostra as páginas encontradas. O Owner seleciona os contatos antes de incorporá-los ao CRM. Novos contatos ficam **A revisar**, com `optIn: false`, e as evidências ficam **Não verificadas** até a revisão humana explícita no CRM. Não há coleta autenticada de LinkedIn no servidor nem cobertura garantida de celulares pessoais.

`GET /api/credits` é consultado pelo health check sem consumir créditos: a interface distingue provedor conectado, chave inválida, falta de saldo e indisponibilidade. As chamadas de `extract` custam aproximadamente 5 créditos e a pesquisa de cinco resultados com prompt pode custar até 25 créditos segundo a [documentação do fornecedor](https://docs.scrapegraphai.com/api-reference/endpoint/credits). Ambas requerem Owner autenticado, clique explícito e chave server-side. O status técnico e o saldo são exibidos sem expor a chave. A pesquisa não roda automaticamente ao abrir a tela.

O endpoint v2 é utilizado porque os hosts e nomes v1 (`api.scrapegraphai.com/v1`, `smartscraper`, `markdownify`) estão depreciados na documentação atual do provedor. A aplicação aceita `SGAI_BASE_URL` para ambientes controlados, mas o valor padrão não deve ser trocado sem validar o contrato v2.

### Enriquecimento em lote por CSV/XLSX

A área **Enriquecimento** também aceita `.csv`, `.xlsx` e `.xls`. O navegador lê a primeira aba do arquivo, sugere a coluna de URL/domínio por nomes como `url`, `site`, `website`, `dominio` ou `link` e permite escolher outra coluna. Uma coluna opcional de empresa pode ser usada para exibição quando a API não encontrar o nome.

O modo padrão é **Importar dados prontos**: ele incorpora a base ao CRM sem fazer chamada externa e sem consumir créditos. O importador reconhece, quando presentes, empresa, domínio, setor, porte, score, responsável, contato, cargo, e-mail, telefone, LinkedIn, URL e trecho de evidência. As colunas de empresa e URL escolhidas na interface têm precedência. Duplicidades por domínio ou nome são atualizadas. **Sinalizações `verified` e `contactreviewed` do arquivo não são aceitas como revisão local**: o Owner deve revisar no CRM e marcar cada evidência/contato, com ator e data na trilha. Sem score, o valor existente permanece e uma conta nova começa em 50.

O modo **Pesquisar com ScrapeGraphAI** é opt-in e permite selecionar até 20 URLs por execução (até 100 créditos aproximados), com dois workers concorrentes. Cada linha usa `/api/integrations/scrapegraph/enrich`; erro, progresso, request ID e pessoas detectadas ficam visíveis. O lote **não é perdido ao exportar**: o Owner revisa e clica em **Adicionar resultados ao CRM**, que atualiza/cria contas, contatos e evidências não verificadas no workspace. A exportação CSV mantém telefone e LinkedIn disponíveis e neutraliza fórmulas de planilha. Importação econômica permanece separada da pesquisa paga.

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

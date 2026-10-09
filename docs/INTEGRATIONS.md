# Integrações do Prospectra+

## Prospectra Web Scraper

O provider de produção é o `omkarcloud/website-email-contact-scraper`, hospedado na VM e publicado em `https://scraper.prospectra.argusprime.com.br`. O Prospectra chama `POST /api/extract` exclusivamente no backend, usando o cabeçalho `SGAI-APIKEY`; a chave nunca vai para o bundle do navegador e não há créditos de terceiro nem proxy anti-bot.

O contrato retorna `id`, `json` e `raw`; o adapter preserva request ID, URL de origem e data de coleta e grava o resultado apenas como sugestão revisável. `SCRAPER_BASE_URL` e `SCRAPER_API_KEY` são os nomes oficiais. `SGAI_BASE_URL` e `SGAI_API_KEY` permanecem somente como aliases de migração para deployments antigos.

O health check server-side consulta `/health` da VM e diferencia **Pronto**, **Aguardando chave**, **Indisponível** e **Falhou**. A execução aceita apenas URLs públicas HTTP/HTTPS, bloqueia destinos locais/privados e informa falhas do provider sem simulá-las. O engine opera com anti-bot desligado: páginas protegidas por desafio retornam erro em vez de contornar a proteção.

### Enriquecimento em lote por CSV/XLSX

A área **Enriquecimento** também aceita `.csv`, `.xlsx` e `.xls`. O navegador lê a primeira aba do arquivo, sugere a coluna de URL/domínio por nomes como `url`, `site`, `website`, `dominio` ou `link` e permite escolher outra coluna. Uma coluna opcional de empresa pode ser usada para exibição quando a API não encontrar o nome.

O modo padrão é **Importar dados prontos**: ele incorpora a base ao CRM sem fazer chamada externa. O modo **Pesquisar com scraper web** é opt-in; somente linhas com URL pública válida entram na fila, com até três workers em paralelo, request ID, status, origem e erro por linha. O botão **Exportar CSV** gera uma saída local.

## WhatsApp — Baileys Gateway

O provedor padrão não oficial do Prospectra é o **Baileys**, encapsulado no projeto separado `prospectra-baileys-gateway`. Baileys é uma biblioteca MIT, não uma API REST pronta; o gateway fornece o contrato operacional que a aplicação precisa: `GET /health`, `GET /v1/status`, `POST /v1/session/start`, `GET /v1/qr`, `POST /v1/session/logout` e `POST /v1/messages/text`.

O gateway usa Node 20+, sessão persistente em `BAILEYS_AUTH_DIR` (por padrão `data/auth`), token `GATEWAY_API_TOKEN`, reconexão e webhook assinado para `/api/integrations/whatsapp/baileys-webhook`. O Prospectra chama o gateway apenas server-side. O painel só exibe **Conectado** depois de o health check retornar a sessão pareada; não há QR simulado.

O envio exige `approved=true` e `optIn=true` no gateway, além das validações de copy, evidência, contato, pausa e oposição no Prospectra. Mensagens recebidas pelo webhook pausam a conta correspondente quando o remetente é identificado no CRM.

O `WHATSAPP_PROVIDER` padrão é `baileys`. Evolution API continua disponível como fallback explícito (`WHATSAPP_PROVIDER=evolution`) para um serviço persistente separado. WPPConnect Server permanece alternativa de customização e `whatsapp-web.js` não entra como núcleo por depender de Chromium. Todas as opções via WhatsApp Web são não oficiais e podem sofrer desconexão, mudança de protocolo ou bloqueio.

## LinkedIn

O Prospectra V0 usa o LinkedIn MCP open source self-hosted na VM Oracle. A conta é autenticada no próprio serviço; o Vercel guarda apenas o estado da conexão e nunca recebe cookies ou senhas.

Conectar uma conta **não autoriza automaticamente convites ou mensagens**. O adapter não armazena cookies, não simula cliques e não envia nada no estado atual; qualquer provider futuro precisa comprovar escopos, quota, custo, webhook assinado, reconciliação e compatibilidade contratual antes de habilitar transporte.

O produto também não promete que a automação do LinkedIn seja permitida pelo LinkedIn: a política pública da plataforma proíbe crawlers, bots, extensões e métodos automatizados não autorizados para copiar dados ou enviar mensagens/convites. A opção desktop segue separada, pois exigiria aplicativo assinado, atualização, máquina ativa e suporte operacional.

## CRM

A referência `trycompai/crm` organiza dados CRM e pesquisa por agentes, com registros de contas, contatos, negócios, atividades e filas. O Prospectra poderá interoperar por API no futuro, mas não pressupõe que o CRM externo seja multi-tenant nem transfere dados pessoais sem contrato e autorização.

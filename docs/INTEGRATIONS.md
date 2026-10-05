# Integrações do Prospectra+

## ScrapeGraphAI

A API gerenciada usa o cabeçalho `SGAI-APIKEY` e deve ser chamada pelo backend para evitar exposição da credencial. O MVP entrega a interface, o contrato de proveniência e o estado de configuração; chamadas reais só são ativadas quando `SGAI_API_KEY` for inserida por meio do gerenciador seguro de segredos.

A biblioteca open source `Scrapegraph-ai` também é uma alternativa MIT, mas exige uma execução Python, modelo LLM próprio e, em cenários de páginas JavaScript, Playwright e infraestrutura operacional. O produto não deve habilitar proxies ou mecanismos anti-bot por padrão.

## WhatsApp — decisão do MVP

Entre Evolution API, WPPConnect Server e whatsapp-web.js, o MVP prioriza **Evolution API**. Ela é uma camada REST pronta para produção, suporta múltiplas instâncias, QR Code, webhooks, eventos, Docker, persistência e integração com Baileys e Cloud API. A execução ficará em um serviço persistente separado do Vercel, com Redis/banco e volumes para sessões; o Prospectra consumirá somente seu adaptador server-side.

WPPConnect Server permanece como fallback para fluxos de customização profunda e whatsapp-web.js não entra como núcleo porque é uma biblioteca Puppeteer, não um servidor multi-instância pronto. Os três são não oficiais quando usados via WhatsApp Web e podem sofrer desconexão, mudança de protocolo ou bloqueio; a operação precisa aceitar esse risco e manter plano de troca para Cloud API.

## LinkedIn

O Prospectra usará um adaptador não oficial configurável para o LinkedIn, conforme definido pelo usuário. O adaptador deve ficar isolado no servidor e expor health, send, webhook e status; não armazena cookies do navegador nem simula cliques. A operação depende de credencial, base URL, escopos do provedor, quota, custo e reconciliação de estados.

## CRM

A referência `trycompai/crm` organiza dados CRM e pesquisa por agentes, com registros de contas, contatos, negócios, atividades e filas. O Prospectra poderá interoperar por API no futuro, mas não pressupõe que o CRM externo seja multi-tenant nem transfere dados pessoais sem contrato e autorização.

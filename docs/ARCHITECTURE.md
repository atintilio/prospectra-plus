# Prospectra+ — arquitetura do MVP

O workspace autenticado usa o Blob privado do projeto para persistir contas, campanhas, pausas, tarefas assistidas e auditoria. O `localStorage` permanece apenas como fallback transitório quando o endpoint server-side não responde; a interface informa esse estado e não o apresenta como sincronizado.

O modelo de domínio segue os princípios do pacote Prospectra: conta, contato, evidência, atividade, oportunidade, tarefa, campanha, aprovação e supressão. Uma implementação de produção deve mover esse estado para o banco gerenciado, sempre derivando `organizationId` da sessão autenticada e aplicando isolamento em todas as consultas. Não aceitar `organizationId` no corpo de requisições é um requisito de segurança.

O desenho do CRM é inspirado no `trycompai/crm`: registros mantêm tarefas de pesquisa, atividades, contatos, negócios e evidências separados; pesquisa e enriquecimento devem operar por fila e registrar observações em vez de fatos inferidos. O repositório de referência é MIT, mas a sua arquitetura atual é single-tenant e não pode ser copiada como solução de isolamento do Prospectra.

## Prospectra Web Scraper

O adaptador de produção deve ser chamado apenas no servidor. `SCRAPER_API_KEY` (com `SGAI_API_KEY` apenas como alias legado) nunca pode ir ao navegador. A operação recebe uma URL pública e devolve o contrato de extração do scraper e grava: URL canônica, trecho, data de coleta, status do job, resultado bruto controlado e sugestões revisáveis. Uma falha de fonte deve ser visível; ela não equivale a ausência de sinais.

## LinkedIn

O MVP mostra somente tarefas assistidas. Ele não armazena cookies, não automatiza navegador, não simula cliques e não despacha convites ou mensagens. A futura operação por API depende de prova específica de autorização, escopo, quota, custo, operação permitida e mecanismo de reconciliação.

## Guardas de operação

Uma mudança de copy invalida aprovação anterior. Uma resposta pausa a conta. Uma oposição mantém supressão persistente. Nenhum estado de tarefa assistida comprova entrega pelo provedor externo.

## Operação da interface

O sino abre a central de notificações e navega para a origem do sinal ou tarefa. CRM, auditoria, criação de conta, exportação, filtros e configurações possuem handlers explícitos. O endpoint `GET/PUT /api/workspace/state` exige sessão; apenas `admin` grava o snapshot completo, e leituras de `leader`/`member` são filtradas por equipe/carteira. `GET /api/integrations/channels/health` consulta provedores server-side e nunca expõe credenciais.

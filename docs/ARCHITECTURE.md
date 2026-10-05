# Prospectra+ — arquitetura do MVP

O MVP usa uma interface React persistida no `localStorage` do navegador exclusivamente para demonstrar os fluxos de CRM, evidência, aprovação, tarefas e pausas. O banner de ambiente deixa explícito que os dados são fictícios e não representam um backend conectado.

O modelo de domínio segue os princípios do pacote Prospectra: conta, contato, evidência, atividade, oportunidade, tarefa, campanha, aprovação e supressão. Uma implementação de produção deve mover esse estado para o banco gerenciado, sempre derivando `organizationId` da sessão autenticada e aplicando isolamento em todas as consultas. Não aceitar `organizationId` no corpo de requisições é um requisito de segurança.

O desenho do CRM é inspirado no `trycompai/crm`: registros mantêm tarefas de pesquisa, atividades, contatos, negócios e evidências separados; pesquisa e enriquecimento devem operar por fila e registrar observações em vez de fatos inferidos. O repositório de referência é MIT, mas a sua arquitetura atual é single-tenant e não pode ser copiada como solução de isolamento do Prospectra.

## ScrapeGraphAI

O adaptador de produção deve ser chamado apenas no servidor. `SGAI_API_KEY` nunca pode ir ao navegador. A operação recebe URL, prompt e schema de extração e grava: URL canônica, trecho, data de coleta, status do job, resultado bruto controlado e sugestões revisáveis. Uma falha de fonte deve ser visível; ela não equivale a ausência de sinais.

## LinkedIn

O MVP mostra somente tarefas assistidas. Ele não armazena cookies, não automatiza navegador, não simula cliques e não despacha convites ou mensagens. A futura operação por API depende de prova específica de autorização, escopo, quota, custo, operação permitida e mecanismo de reconciliação.

## Guardas de operação

Uma mudança de copy invalida aprovação anterior. Uma resposta pausa a conta. Uma oposição mantém supressão persistente. Nenhum estado de tarefa assistida comprova entrega pelo provedor externo.

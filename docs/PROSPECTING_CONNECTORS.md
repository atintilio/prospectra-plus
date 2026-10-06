# Motor de prospecção — análise e arquitetura

> Decisão de produto: **contexto → aprovação → tarefa/cadência → conversa → handoff humano**. O transporte de canal não substitui CRM, evidência, limites, pausa por resposta nem calendário.

## O que foi observado

| Referência | Capacidade útil | Caminho de conexão | O que o Prospectra absorve | Limite importante |
|---|---|---|---|---|
| ProspectMe | Busca assistida por IA, cadências, personalização e métricas por abordagem | Evidência pública de Hosted Auth Unipile: o backend gera um link temporário, o titular conecta a conta e o provedor retorna um identificador de conta | Conexão por link temporário, ID da conta separado de credenciais, reconexão e registro de estado | A página anuncia automação de LinkedIn; isso não comprova autorização oficial do LinkedIn para todos os fluxos |
| LeadHunter | Calibração de ICP, base enriquecida, revisão humana de copy, inbox, métricas e operação multicanal | Evidência anterior de ponte Electron no app desktop; a página pública confirma produto com convites, mensagens, follow-ups e inbox | ICP, fonte/evidência, revisão de copy, fila, inbox/handoff, métricas e responsabilidade humana | Desktop próprio é outro produto: requer instaladores, assinatura, atualizações, telemetria, suporte e máquina ativa |
| Contatio | Context Engine, Agent Studio, Playbooks, Signals, Pipeline e Human Handoff; contexto antes do contato | Contas de canal conectadas por plano; a página pública declara LinkedIn, e-mail, WhatsApp, Instagram, X e TikTok | Modelo operacional de contexto, regras/voz, playbooks, sinais, prioridade de respostas e handoff | É um SaaS separado; o plano gratuito é limitado e não é uma API/infraestrutura do Prospectra |

## Capacidade criada no Prospectra

A versão atual inclui dois caminhos **provider-first**:

1. `POST /api/integrations/prospecting/hosted-auth` cria um link temporário de Hosted Auth quando `UNIPILE_DSN`, `UNIPILE_API_KEY` e `UNIPILE_WEBHOOK_SECRET` estão configurados exclusivamente no Vercel.
2. O titular é redirecionado ao assistente do provedor; o Prospectra não pede senha, cookies nem um perfil de navegador.
3. `POST /api/integrations/prospecting/unipile-webhook` recebe o callback protegido por token e persiste apenas o estado e o identificador da conexão no Blob privado.
4. `GET /api/integrations/prospecting/accounts` exibe somente as conexões do usuário autenticado.
5. A tela **Configurações** oferece Hosted Auth opcional, pareamento do Abridge e configuração da Evolution API. A conexão não habilita envio automático por si só: o Prospectra exige tarefa aprovada, evidência, limite e reconciliação.

O caminho sem assinatura para LinkedIn é o **Abridge**: um único aplicativo desktop abre Chrome visível, usa uma sessão que o operador autenticou manualmente e chama o `linkout-scraper` para ler perfis/posts públicos ou executar uma tarefa de escrita somente após confirmação local. O Prospectra não recebe senha ou cookie. A Evolution API é o caminho de WhatsApp quando o servidor persistente, QR Code e webhook estão configurados.

## Decisão recomendada

### Fase 1 — piloto de baixo custo

Use o Prospectra com enriquecimento, CRM, copy aprovada, fila de tarefa assistida e Abridge. O custo de transporte do LinkedIn é **zero**; o operador instala o Abridge, abre o Chrome, faz login e confirma as ações. É a forma mais econômica de validar ICP, copy, evidência, cadência e reuniões.

### Fase 2 — Hosted Auth por provedor

Para conectar contas e sincronizar inbox/calendário sem construir um desktop agent, o Unipile é o caminho técnico mais curto. A documentação oficial descreve link temporário, callback com `account_id`, reconexão e armazenamento da chave de API no backend. A página de preços informa mínimo de **€49/mês (ou US$55/mês) para até 10 contas conectadas**, teste grátis de sete dias e cobrança por identidade conectada. O próprio fornecedor informa que LinkedIn, WhatsApp e Instagram usam engenharia reversa, enquanto e-mail/calendário usam integrações oficiais. Isso é custo recorrente e risco operacional/contratual a ser aceito conscientemente; não é “gratuito”.

### Fase 3 — Abridge próprio

O Prospectra agora possui a base do **Abridge**, um único aplicativo desktop empacotado para Windows, macOS e Linux. O aplicativo abre um Chrome visível com perfil dedicado, mantém a sessão local, consulta uma fila HTTPS autenticada, executa tarefas aprovadas com `linkout-scraper`, lê perfis/posts públicos e constrói organogramas a partir de URLs informadas pelo operador. O Vercel não acessa `localhost`, cookies ou senha do operador.

O produto fica dividido em dois aplicativos para o usuário: **Prospectra+ Web** e **Prospectra Abridge Desktop**. Não há dois bridges diferentes: o mesmo código é empacotado como `.exe` para Windows e `.dmg` para macOS. A primeira fila exige confirmação visível no Abridge para convites e mensagens; leituras podem ser sincronizadas automaticamente.

Endpoints do contrato:

- `POST/GET/DELETE /api/integrations/prospecting/bridge/devices` — pareamento e revogação;
- `POST/GET /api/integrations/prospecting/bridge/tasks` — criar e consultar tarefas;
- `GET /api/integrations/prospecting/bridge/jobs` — lease de tarefas pelo dispositivo;
- `POST /api/integrations/prospecting/bridge/results` — retorno da execução;
- `POST /api/integrations/prospecting/bridge/heartbeat` — status de presença.

O token de pareamento é exibido uma única vez e armazenado no servidor somente como hash. O Abridge guarda o token localmente e usa `Bearer` sobre HTTPS.

### Evolution API para WhatsApp

A Evolution API não roda no Vercel: a instalação fica em Docker/VM persistente com PostgreSQL, Redis e volume de sessões. O Prospectra chama `POST /message/sendText/{instance}` server-side com `apikey`; o navegador nunca recebe a chave.

No painel **Configurações → WhatsApp · Evolution API**, o Owner cria/atualiza a instância, gera o QR Code e lê o QR no WhatsApp Business. O health check só marca o canal como conectado quando a instância retorna estado `open`/`connected`.

Eventos de conexão, QR, entrada e envio chegam em `/api/integrations/whatsapp/webhook` com o segredo `x-prospectra-webhook-secret`. Uma mensagem só é elegível quando a copy está aprovada, o contato tem número internacional, a conta não está pausada/suprimida e há evidência associada.

### Alternativa de referência

O Contatio anuncia plano gratuito de R$0 com 50 envios de IA, 1 conta de canal, 1 campanha e 25 créditos de lead por mês; seus planos pagos divulgados iniciam em R$499/mês. É uma referência de produto e pode ser usado como comparação de custo/experiência, não como backend embutido do Prospectra.

## Guardas obrigatórias do motor

- Ações externas ficam bloqueadas sem conta ativa, copy válida, destinatário revisado, canal definido e evidências verificadas.
- Resposta ou oposição pausa todas as tarefas pendentes daquela conta.
- O registro de ação assistida nunca equivale a `sent`, `delivered` ou `read` no provedor.
- Um health check técnico não é autorização de envio; escopos, webhook assinado, limites e reconciliação são requisitos separados.
- O workspace revalida a sessão no servidor e filtra contas, oportunidades, diagnósticos, sinais e membros conforme papel/equipe.

## Fontes consultadas em 06/10/2026

- [ProspectMe](https://www.prospectme.com.br/) — produto, planos e recursos anunciados.
- [Pesquisa de conexão entregue pelo usuário](/home/ubuntu/upload/pasted_file_RxWuHD_PESQUISA_CONECTORES_LINKEDIN.md) — evidências públicas dos módulos Unipile/Hosted Auth e da ponte Electron do LeadHunter.
- [Unipile Hosted Auth](https://developer.unipile.com/docs/hosted-auth) — link temporário, callback, `account_id`, reconexão e orientação de backend intermediário.
- [Unipile Pricing](https://www.unipile.com/pricing-api/) — mínimo, contas conectadas e escopo declarado da API.
- [LeadHunter Software](https://leadhunter.com.br/software) — ICP, base, revisão de copy, multicanal, inbox e métricas anunciados.
- [Contatio](https://contatio.ai/#produto) — Context Engine, Agent Studio, Playbooks, Signals, Pipeline, Human Handoff e planos divulgados.
- [LinkedIn — software e extensões proibidos](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions?lang=en) e [User Agreement](https://www.linkedin.com/legal/user-agreement) — posição oficial sobre bots, scraping, extensões, automação de mensagens/convites e risco de restrição de conta.

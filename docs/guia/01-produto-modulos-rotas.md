# Prospectra+ — Guia de manutenção (Parte 1): produto, módulos e rotas

> Base do código: `/opt/prospectra-plus` (monorepo `prospectra-plus`), Next.js 16 App Router + React 19, Drizzle ORM sobre Postgres (Neon), Tailwind 4, deploy em OpenNext/Cloudflare Workers.
> Este guia foi escrito **lendo o código**: cada rota, tabela e gate abaixo existe no repositório nesta data.

---

## 1. O produto em uma página

O **Prospectra+** é o CRM de prospecção da Argus Prime: um painel multi-parceiro (multi-tenant) onde cada operação ("org") tem leads, campanhas de LinkedIn, fila de trabalho, agenda, atendimento, voz, WhatsApp, LinkedIn, inteligência comercial e workspace interno.

| Camada | Onde | Nota |
|---|---|---|
| App web | `src/app/**` | App Router. Grupos: `(app)` = telas logadas, `(auth)` = login/recuperação, raiz = páginas públicas. |
| Domínio | `src/lib/**` | Regras de negócio puras e "server-only". É aqui que se mexe para mudar comportamento. |
| Dados | `src/db/schema.ts` | 45 tabelas Drizzle + `lead_communication_profiles` (SQL cru). Migrações em `drizzle/*.sql` (aplicadas por `scripts/migrate.mjs` no `pnpm build`). |
| Ações de servidor | `src/app/(app)/actions.ts`, `src/app/(app)/*/actions.ts` | Mutations do React (`useActionState`). A API REST é só o que precisa ser público ou de webhook. |
| API REST | `src/app/api/**/route.ts` | 29 rotas: agenda (públicas + internas), cron, webhooks, widget, CSAT, health, demo e integrações do LinkedIn. |
| Cron | `src/app/api/cron/route.ts` | `GET` com `Authorization: Bearer $CRON_SECRET`. Roda cadência, Harvey, LinkedIn, lembretes, descoberta DISC e a fila de inteligência. |

**Três ambientes de execução** (importante para manutenção):

| Ambiente | Como se entra | Comportamento |
|---|---|---|
| Produção | login normal | Tudo real: WhatsApp, e-mail, IA, agenda pública. |
| Demonstração | `/ambiente` → "Demonstração" | Org com `orgs.is_demo = true`. Nada é enviado; as telas mostram cópias simuladas e há banner roxo no shell. |
| Público (agenda) | `/agendamento/**` | Sem sessão. O lead marca e cancela pelo token. |

---

## 2. Como o acesso é controlado

### 2.1 Sessão e papéis

Tudo começa em `src/lib/auth.ts`. Cookie `prospectra_session` (httpOnly, 14 dias), token guardado como `sha256(token)` em `sessions`.

| Função | Comportamento | Quem cai fora |
|---|---|---|
| `getCtx()` | Lê sessão + usuário + org + papel. `cache()` do React, então é chamado várias vezes por request sem custo extra. | — |
| `requireUser()` | Redireciona para `/login` se não há sessão ou se `users.status !== 'active'`. | anônimo → `/login` |
| `requireOrg()` | Exige sessão **e** org selecionada. | admin master sem org → `/admin`; usuário sem time → `/sem-equipe` |
| `requireAdmin()` | Exige `users.platform_role === 'admin'`. | não-admin → `/painel` |
| `canManage(role)` | `owner` ou `manager` — usado para gravar (SLA, webhook, atributos, equipe). | sdr/closer não gravam |
| `switchOrg()` | Troca a org da sessão; usuário comum só entra em orgs onde tem `memberships`. | — |

Papéis: `owner`, `manager`, `sdr`, `closer` (tabela `memberships.role`). O admin master (`platform_role='admin'`) opera como `owner` em qualquer parceiro (`src/lib/auth.ts:67-70`).

### 2.2 Flags por operação (`orgs`)

| Flag | Efeito | Onde é lida |
|---|---|---|
| `active` | Operação inativa: `/comunicacao` e `/inteligencia` ficam bloqueadas; WhatsApp e voz caem. | várias telas |
| `ai_enabled` | IA desligada: rascunhos comerciais, voz, perfil de comunicação **e a busca por IA em `/leads`** ficam indisponíveis. | `src/app/(app)/actions.ts:144` (`aiSearchAction`), `src/app/(app)/inteligencia/page.tsx:34`, `src/lib/voice/delivery.ts` |
| `image_enabled` | Libera o **passo de campanha do tipo imagem**. Default `false`. | `src/lib/campaign-features.ts` |
| `call_enabled` | Libera o **passo de campanha do tipo ligação**. Default `false`. | `src/lib/campaign-features.ts` |
| `linkedin_enabled` | Permite a execução automática de LinkedIn **daquela operação**. | `src/lib/linkedin/automation.ts` |
| `is_demo` | Bloqueia envios reais (WhatsApp, e-mail, IA, voz) e libera o piloto automático simulado. | `src/lib/campaign-features.ts`, `src/app/(app)/automacao/page.tsx:19` |

`src/lib/campaign-features.ts` é a **fonte única** do gate de recurso de campanha, em três camadas: (1) o editor não oferece o passo; (2) a cadência pula o passo ainda não alcançado; (3) ação já criada continua pendente, nada automático.

### 2.3 Flags de ambiente

São **31 variáveis de ambiente** lidas por `process.env.*` / `env.*` em `src/**`, mais **1 binding do Cloudflare** (`NEON_DATABASE_URL`) — 32 no total. Todas estão listadas abaixo; nenhuma existe no código sem constar aqui.

| Grupo | Variável | Efeito |
|---|---|---|
| Banco | `DATABASE_URL` | Conexão do Postgres na VPS/Node. Tem precedência sobre `POSTGRES_URL` (`src/db/index.ts:38`). |
| Banco | `NEON_DATABASE_URL` | Binding do **Cloudflare Worker** (texto ou Hyperdrive). Tem precedência sobre `DATABASE_URL` quando o app roda no Worker (`src/db/index.ts:32`). |
| Banco | `POSTGRES_URL` | Fallback do `DATABASE_URL` (`src/db/index.ts:38`). |
| Sessão | `PUBLIC_APP_URL` | URL pública do app (sem barra final). Usada nos links de convite, no `.ics` e no webhook do WhatsApp. |
| Sessão | `MASTER_USER_EMAIL` | Admin master protegido (default `atintilio@argusprime.com.br`, ver `src/lib/admin-policy.ts`). |
| Sessão | `NODE_ENV` | Marca o cookie de sessão e o cookie do `state` do LinkedIn como `secure` em produção. |
| Cron | `CRON_SECRET` | Autoriza `GET /api/cron` e `GET /api/harvey/tick` (Bearer). |
| Webhooks | `HARVEY_WEBHOOK_SECRET` | Assina o webhook do gateway de WhatsApp do Harvey (o segredo de cada sessão é derivado dele). |
| Webhooks | `SUPPORT_WEBHOOK_SECRET` | Assina o webhook de WhatsApp do módulo de suporte. |
| WhatsApp | `WA_AKG_BASE_URL` | Endereço do gateway WA-AKG (só servidor). |
| WhatsApp | `WA_AKG_API_KEY` | Chave do gateway WA-AKG (header `x-api-key`). |
| WhatsApp | `WA_AKG_SESSION_ID` | Fixa a sessão do WhatsApp entre deploys (o pareamento não se perde). |
| Voz | `VOICESTUDIO_BASE_URL` | Endereço do motor de voz (Voice Studio). |
| Voz | `VOICESTUDIO_API_KEY` | Chave do motor de voz. |
| Voz | `VOICESTUDIO_ENGINE` | Motor/engine a usar na clonagem. |
| Voz | `VOICE_AUTOMATION_ENABLED` | Libera o **envio** de áudio. O perfil de voz e a tela continuam existindo sem ela. |
| IA | `AI_API_KEY` / `OPENROUTER_API_KEY` | Chave do provedor. `aiConfigured()` só é `true` com uma das duas. |
| IA | `AI_BASE_URL` | Endpoint do provedor (default: API da OpenRouter). |
| IA | `AI_MODEL` | Modelo principal. |
| IA | `AI_FALLBACK_MODELS` | Cadeia de fallback, separada por vírgula (`src/lib/ai.ts:60`). |
| Inteligência | `INTELLIGENCE_WORKER_ENABLED` | Libera o enfileiramento da análise de qualidade de dados (fora da demo). |
| LinkedIn (OIDC) | `LINKEDIN_CLIENT_ID` | Client ID do app LinkedIn. Sem ele, a conexão fica em `configuration_required`. |
| LinkedIn (OIDC) | `LINKEDIN_CLIENT_SECRET` | Segredo do app LinkedIn. **Nunca sai do servidor** nem vai para o banco. |
| LinkedIn (OIDC) | `LINKEDIN_REDIRECT_URI` | URI de callback (deve apontar para `/api/integrations/linkedin/callback`). |
| LinkedIn (OIDC) | `LINKEDIN_STATE_SECRET` | Chave de assinatura do `state` do fluxo OIDC. Sem ela, usa o id da sessão como chave. |
| LinkedIn (worker) | `LINKEDIN_AUTOMATION_ENABLED` | Interruptor geral do LinkedIn automático. |
| LinkedIn (worker) | `LINKEDIN_WORKER_URL` | URL HTTPS do worker de LinkedIn na VPS. Sem ela a fila é no-op. |
| LinkedIn (worker) | `LINKEDIN_WORKER_KEY` | Chave do worker de LinkedIn. |
| Agenda | `AGENDA_PUBLIC_URL` | Base pública do link de agendamento (default `https://agenda.argusprime.com.br`). |
| Agenda | `MEETING_SCHEDULER_URL` | Link de marcação externo usado quando a reunião é pedida pelo Harvey. |
| Migração | `BLOB_READ_WRITE_TOKEN` | Necessário para a migração silenciosa do v1 (`src/lib/legacy.ts`). |

> `AUTH_SECRET` aparece no `.env.example` mas **não é lido por nenhum arquivo de `src/`**: o token de sessão é sorteado e guardado como `sha256` em `sessions` (`src/lib/auth.ts`, `src/lib/crypto.ts`).

---

## 3. Roteiro de telas

São **34 telas** (`find src/app -name page.tsx`): 10 públicas/de autenticação e 24 dentro de `(app)`.

> **Colunas:** `Rota` = URL · `Propósito` = o que a tela faz · `Dados` = tabelas Drizzle que alimentam a tela · `Gate` = o que controla o acesso.

### 3.1 Páginas públicas e de autenticação

| Rota | Propósito | Dados | Gate |
|---|---|---|---|
| `/` | Redireciona: logado → `/painel`, anônimo → `/login`. | — | `getCtx()` |
| `/login` | Formulário de e-mail + senha. Server action `loginAction`. | `users`, `sessions`, `memberships` | público; valida `users.status = 'active'` |
| `/recuperar-senha` | Pede link de redefinição por e-mail. | `users`, `auth_tokens` | público |
| `/definir-senha` | Cria a senha a partir do `token` do convite/reset (mín. 10 chars). | `users`, `auth_tokens` | token válido e não usado |
| `/sem-equipe` | Aviso de que o usuário não pertence a nenhuma equipe. | — | alcançado por `requireOrg()` |
| `/ambiente` | Escolhe entre **Produção** e **Demonstração**; recria a demo do zero. | `orgs`, `memberships` | `requireUser()` |
| `/central-de-ajuda` | Central de ajuda pública do parceiro: busca por texto e artigo. | `help_articles` (apenas `status='published'`) | público; exige `?org=<uuid>` válido |
| `/agendamento` | Porta de entrada pública da agenda; aceita link/código colado e redireciona. | — | público |
| `/agendamento/[slug]` | Tela de marcação: mostra o evento e os horários livres. | `agenda_event_types`, `agenda_availability`, `agenda_blackouts`, `meetings` | público; evento precisa estar `is_active` |
| `/agendamento/cancelar` | Cancelamento público pelo `cancelToken`. | `meetings`, `agenda_event_types` | público; token |

### 3.2 Telas do produto (`src/app/(app)`)

| Rota | Propósito | Dados | Gate |
|---|---|---|---|
| `/painel` | Dashboard: KPIs de convites/respostas/reuniões, funil por etapa, série diária, ranking da equipe, card de agenda. Roda `runScheduler` ao abrir. | `events`, `leads`, `actions`, `users`, `meetings` | `requireOrg()`; gestor vê a org toda, sdr/closer só o próprio |
| `/fila` | Fila do dia: ações pendentes com prazo ≤ hoje, leads aguardando conexão e reuniões pedidas. | `actions`, `leads`, `campaigns`, `meetings` | `requireOrg()`; escopo `userId` do usuário |
| `/leads` | CRM: lista paginada com busca, filtro por etapa e por etiqueta; importação CSV/URLs, busca por IA, exclusão auditada. | `leads`, `campaigns` | `requireOrg()`; IA depende de `aiConfigured()` ou `is_demo`; créditos em `orgs.search_credits_month` |
| `/leads/atributos` | CRUD de campos personalizados do lead. | `lead_attribute_defs` (valores em `leads.attributes` JSONB) | `requireOrg()`; gravação exige `canManage` |
| `/campanhas` | Lista de campanhas com inscritos, ativos, convites, aceitações e respostas. | `campaigns`, `enrollments`, `events`, `users` | `requireOrg()` |
| `/campanhas/nova` | Cria campanha e abre o editor. | `campaigns`, `memberships`/`users` | `requireOrg()`; recursos conforme `campaignFeatures(org)` |
| `/campanhas/[id]` | Editor de campanha (passos, IA, responsável) + inscrição de leads. | `campaigns`, `enrollments`, `leads`, `memberships`/`users` | `requireOrg()`; `image`/`call` só se `image_enabled`/`call_enabled` |
| `/inteligencia` | Inteligência comercial: rascunho avulso, operação Harvey (perfil do vendedor, conversas, aprovações), mensagens em revisão e análise de qualidade dos dados. | `leads`, `commercial_profiles`, `harvey_conversations`, `harvey_outbox`, `harvey_inbound_jobs`, `intelligence_jobs`, `lead_communication_profiles` | `requireOrg()` + `org.active`; IA exige `ai_enabled`; análise exige `INTELLIGENCE_WORKER_ENABLED` ou demo |
| `/comunicacao` | Perfil de comunicação por lead (DISC, canal e formato preferidos). | `leads`, `lead_communication_profiles` | `requireOrg()` + `org.active` |
| `/linkedin` | Conexão da conta do próprio usuário no LinkedIn (OpenID Connect): vincular, ver o estado e desconectar. | `linkedin_connections` | `requireOrg()`; sem `LINKEDIN_CLIENT_ID`/`SECRET`/`REDIRECT_URI` o estado é `configuration_required` (a tela explica o que falta) |
| `/agenda` | Tela interna da agenda: tipos de reunião, disponibilidade semanal, link público rastreado, reservas e bloqueios. | `agenda_event_types`, `agenda_availability`, `agenda_links`, `agenda_blackouts`, `meetings`, `leads` | `requireOrg()` |
| `/atendimento` | Regras de atendimento: SLA, horário + auto-resposta, webhooks de saída, trilha de auditoria. | `support_sla_policies`, `support_schedules`, `webhook_endpoints`, `audit_log` | `requireOrg()`; edição exige `canManage` |
| `/suporte` | Inbox de suporte: lista, thread, etiquetas, times, atribuição e abertura de chamado. | `support_conversations`, `support_messages`, `support_teams`, `support_team_members`, `memberships`/`users` | `requireOrg()`; atribuição a agente/time exige `canManage` |
| `/ajuda` | Gerencia artigos de autoatendimento (rascunho/publicado). | `help_articles` | `requireOrg()` |
| `/relatorios` | Relatório de atendimento do período: volume, primeira resposta, SLA, resolução, CSAT, agentes e times. | `support_conversations`, `support_messages`, `support_sla_policies`, `support_schedules` (via `supportReport`) | `requireOrg()` |
| `/projetos` | Quadro de tarefas (a fazer / fazendo / feito) com responsável e lead vinculado. | `tasks`, `memberships`/`users` | `requireOrg()` |
| `/docs` | Documentos internos da equipe. | `docs` | `requireOrg()` |
| `/equipe` | Time da operação: membros, papéis, limite de assentos, convites. | `memberships`, `users`, `orgs` | `requireOrg()`; gerenciar exige `canManage` |
| `/conta` | Dados do usuário e limites diários de convites/mensagens. | `users` | `requireUser()` |
| `/whatsapp` | Pareamento do número (QR/status), envio e painel de voz. | `whatsapp_commands`, `voice_profiles`, `voice_jobs` | `requireOrg()`; exige `WA_AKG_*` (ou demo); voz exige `org.active && ai_enabled && !is_demo` e `VOICE_AUTOMATION_ENABLED` para enviar |
| `/voz` | Perfil de voz clonado do vendedor e registro de consentimento. | `voice_profiles`, `voice_registrations` | `requireOrg()`; exige `VOICESTUDIO_*` + `org.active` + `ai_enabled` + `!is_demo` |
| `/automacao` | Piloto automático simulado: linha do tempo, respostas automáticas, comentários em publicações. | `sim_feed`, `leads` | `requireOrg()` **e** `org.is_demo` (fora da demo, mostra aviso) |
| `/admin` | Administração de parceiros: criar org, ligar/desligar IA, imagem, ligação, LinkedIn; gerir usuários. | `orgs`, `memberships`, `users` | `requireAdmin()` |
| `/argus` | Suporte interno do produto: chamados dos parceiros (público do Prospectra+). | `support_conversations` (`audience='product'`), `support_messages` | `requireAdmin()` |

### 3.3 Mapa de navegação (sidebar)

O menu é montado em `src/components/sidebar.tsx` e é a referência rápida do que existe:

| Grupo | Itens | Visibilidade |
|---|---|---|
| Atalhos | `/painel`, `/fila`, `/leads`, `/campanhas` | sempre |
| Prospecção | `/inteligencia`, `/comunicacao`, `/linkedin`, `/leads/atributos` | sempre |
| Prospecção | `/automacao` | **só na demo** (`isDemo`) |
| Relacionamento | `/agenda`, `/atendimento`, `/whatsapp`, `/voz`, `/suporte`, `/ajuda` | sempre |
| Gestão e equipe | `/relatorios`, `/projetos`, `/docs` | sempre |
| Gestão e equipe | `/equipe` | `canManage` ou admin master |
| Gestão e equipe | `/conta` | sempre |
| Administração | `/argus`, `/admin` | **só admin master** |

Rotas fora do menu: `/ambiente` (botão "Trocar ambiente" na topbar) e as três páginas públicas de `/agendamento/*`.

---

## 4. APIs

São **29 rotas** (`find src/app/api -name route.ts`).

### 4.1 Agenda — públicas (sem sessão)

| Rota | Método | Propósito | Autenticação |
|---|---|---|---|
| `/api/agenda/event` | `GET` | Dados públicos de um tipo de reunião (`?slug=`). | Nenhuma; slug precisa existir e estar ativo |
| `/api/agenda/slots` | `GET` | Horários livres de um tipo de reunião (`?slug=&from=&to=`). | Nenhuma |
| `/api/agenda/book` | `POST` | Reserva o horário; recalcula a disponibilidade no servidor e devolve `cancelUrl`. | Nenhuma; `token` opcional (link rastreado) |
| `/api/agenda/cancel` | `POST` | Cancela a reserva pelo `cancelToken`. | Nenhuma; token |

O horário enviado pelo navegador **nunca é confiável**: o servidor recalcula. O banco é a última linha de defesa com o índice único `meetings_no_double_booking` (`org_id`, `user_id`, `scheduled_at`).

### 4.2 Agenda — internas (sessão da operação)

Todas usam `requireScope()` (`src/app/api/agenda/_auth.ts`), que converte o redirect do `requireOrg()` em JSON: `401` (sessão expirada) ou `403` (sem acesso). O `orgId` **nunca** vem do corpo — é sempre o da sessão.

| Rota | Método | Propósito | Autenticação |
|---|---|---|---|
| `/api/agenda/event-types` | `GET` | Lista os tipos de reunião da operação. | `requireScope()` |
| `/api/agenda/event-types` | `POST` | Cria um tipo de reunião. | `requireScope()` |
| `/api/agenda/event-types/[id]` | `PATCH` | Edita um tipo de reunião. | `requireScope()` |
| `/api/agenda/event-types/[id]/availability` | `POST` | Substitui a disponibilidade semanal do tipo. | `requireScope()` |
| `/api/agenda/links` | `POST` | Gera link público rastreado (`token`, `channel`, `leadId`). | `requireScope()` |
| `/api/agenda/bookings` | `GET` | Lista reservas da operação (`from`, `to`, `limit`). | `requireScope()` |
| `/api/agenda/blackouts` | `GET` / `POST` / `DELETE` | Lista, cria e remove bloqueios de agenda. | `requireOrg()` convertido em JSON |

### 4.3 Suporte (Helpin)

| Rota | Método | Propósito | Autenticação |
|---|---|---|---|
| `/api/support/widget` | `GET` | Mensagens públicas da conversa + payload de CSAT. | Origem liberada em `support_widget_origins` (403 se não) |
| `/api/support/widget` | `POST` | Abre/continua conversa a partir do widget; registra nota quando a conversa encerrada está na janela de CSAT. | Origem liberada; `orgId` + `conversationId` |
| `/api/support/widget` | `OPTIONS` | Preflight CORS. | — |
| `/api/support/csat` | `POST` | Registra a nota (1..5) enviada pelo widget. | Origem liberada; `orgId` + `conversationId` |
| `/api/support/csat` | `GET` | Resumo de CSAT da operação (média, distribuição, pendentes). | `requireOrg()` |
| `/api/support/sla` | `GET` / `PUT` | Política de SLA e o horário que ela respeita. | `requireOrg()`; `PUT` exige `canManage` |
| `/api/support/schedule` | `GET` / `PUT` | Horário de atendimento e auto-resposta. | `requireOrg()`; `PUT` exige `canManage` |
| `/api/support/webhooks` | `GET` / `POST` | Lista e cadastra webhooks de saída (a assinatura aparece só na criação). | `requireOrg()`; `POST` exige `canManage` |
| `/api/support/webhooks/[id]` | `PATCH` / `DELETE` | Atualiza e remove webhook. | `requireOrg()` + `canManage` |
| `/api/support/audit` | `GET` | Trilha de auditoria (`limit`, `action`, `entity`, `days`). | `requireOrg()` |
| `/api/support/reports` | `GET` | Relatório de atendimento (`from`, `to` em `YYYY-MM-DD`; sem período = últimos 30 dias). | `requireOrg()` |
| `/api/support/whatsapp` | `POST` | Entrada de mensagem de WhatsApp do gateway para o suporte. | HMAC em `x-webhook-signature` com `SUPPORT_WEBHOOK_SECRET` |

### 4.4 Operações, cron e utilitários

| Rota | Método | Propósito | Autenticação |
|---|---|---|---|
| `/api/cron` | `GET` | Ciclo principal: cadência, relatórios de exclusão, fila Harvey, LinkedIn (se ligado), descoberta DISC, lembretes de reunião e fila de inteligência. | `Authorization: Bearer $CRON_SECRET` |
| `/api/harvey/tick` | `GET` | Ciclo do Harvey: processa a inbox e despacha 1 job do outbox. | `Authorization: Bearer $CRON_SECRET` |
| `/api/harvey/inbound` | `POST` | Webhook do gateway de WhatsApp do Harvey. Grava o job e processa em `after()`. | HMAC por sessão (`HARVEY_WEBHOOK_SECRET` derivado) |
| `/api/leads/attributes` | `GET` / `POST` | Lista e cria definições de campo do lead. | `requireOrg()`; `POST` exige `canManage` |
| `/api/leads/attributes/[id]` | `PATCH` / `DELETE` | Edita e remove uma definição de campo. | `requireOrg()` + `canManage` |
| `/api/demo/reset` | `POST` | Apaga e recria a org de demonstração do usuário. | `requireUser()` **e** `platform_role='admin'`; nunca toca produção |
| `/api/health` | `GET` | Estado do app: banco, Office 365, IA. `200` ou `503`. | Nenhuma |

### 4.5 LinkedIn — OpenID Connect (conta do próprio usuário)

Todas usam `requireLinkedInScope()` (`src/app/api/integrations/linkedin/_auth.ts`), que aplica o mesmo contrato da agenda: `401` (sessão expirada), `403` (sem acesso) ou `500`. O `orgId` vem **sempre** da sessão e a conexão é da pessoa logada (uma conta por usuário e operação).

| Rota | Método | Propósito | Autenticação |
|---|---|---|---|
| `/api/integrations/linkedin/start` | `GET` | Inicia a autorização: sorteia um `state`, assina e grava em cookie httpOnly de uso único (10 min), depois redireciona para o authorize do LinkedIn. | `requireLinkedInScope()`; sem credencial do app, devolve a página de popup com o aviso (sem estado "fingido") |
| `/api/integrations/linkedin/callback` | `GET` | Callback OIDC: valida o `state`, troca o `code` por token, busca o perfil e grava a conexão. Responde com HTML mínimo + `postMessage` e fecha o popup. | `requireLinkedInScope()` **e** `state` assinado válido (cookie de uso único, apagado no fim) |
| `/api/integrations/linkedin/connect` | `GET` | Estado da conta LinkedIn do usuário: `disconnected` \| `authenticated` \| `configuration_required` \| `unavailable`. | `requireLinkedInScope()` |
| `/api/integrations/linkedin/connect` | `DELETE` | Desconecta a conta (o registro fica `revoked`). | `requireLinkedInScope()` |

> O `client_secret` e o access token **nunca** saem do servidor nem vão para o banco: o app só orquestra a autorização e guarda o perfil vinculado (`linkedin_connections`).

---

## 5. Módulos

`src/lib` é a camada de domínio (**54 arquivos**). As telas leem; a regra mora aqui.

### 5.1 Identidade, sessão e tenancy

| Módulo | Papel | Onde mexer |
|---|---|---|
| `src/lib/auth.ts` | Sessão, papéis, `requireUser/requireOrg/requireAdmin`, troca de org, link de convite/reset. | Mudar regra de acesso, expiração de sessão, papéis. |
| `src/lib/crypto.ts` | `scrypt` para senha, `sha256` para token de sessão, `newToken`. | Trocar o algoritmo de hash ou o formato do token. |
| `src/lib/admin-policy.ts` | Admin master protegido e quem pode alterar contas. | Trocar quem é protegido (e-mail do dono). |
| `src/lib/membership.ts` | Org padrão, `ensureTeam` (conta migrada do v1), `ensureMasterOrg`. | Comportamento de contas órfãs. |
| `src/lib/legacy.ts` | Migração silenciosa do v1 (Blob `prospectra/auth.json`): copia usuário + hash. | Ampliar a migração. |
| `src/lib/workspace.ts` | Documentos e tarefas do workspace. | Regras de docs/projetos. |
| `src/lib/lead-attributes.ts` | Campos personalizados do lead: definição, validação e merge em `leads.attributes`. | Novo tipo de campo, validação. |
| `src/lib/leads-import.ts` | CSV (Sales Navigator, planilhas) e URLs coladas → leads. | Novo formato de importação. |

### 5.2 Prospecção: campanhas, cadência e IA

| Módulo | Papel | Onde mexer |
|---|---|---|
| `src/lib/cadence.ts` | Motor da cadência assistida: inscrição de leads, `runScheduler` (vira inscrição vencida em ação na Fila), `completeAction`, `markOutcome`. | Regras de quando uma ação nasce, delays, transições de etapa. |
| `src/lib/campaign-features.ts` | Gate único dos recursos de campanha (`image`, `call`). | Novo passo gated ou nova regra de habilitação. |
| `src/lib/ai.ts` | Provedor de IA (API compatível com OpenAI: Z.AI, OpenRouter), cadeia de modelos com fallback, `aiGenerator`, `planSearch`. | Modelo, fallback, custo, prompts de geração. |
| `src/lib/template.ts` | Preenchimento de `{nome}`, `{cargo}`, `{empresa}`, `{cidade}` etc. | Novas variáveis de template. |
| `src/lib/linkedin/automation.ts` | Fila de execução automática de LinkedIn (desligada por padrão), recibo durável em `linkedin_dispatches`. | Regras de despacho, limites, retry. |
| `src/lib/linkedin/http-executor.ts` | Constrói o executor HTTP para o worker na VPS (segredos ficam lá). | Protocolo com o worker. |
| `src/lib/linkedin/connection.ts` | Conexão da conta do próprio usuário (OpenID Connect): monta a authorize URL, assina o `state`, troca o `code` por token e grava o perfil vinculado. | Credenciais do app, escopos, TTL do `state`, estados da conexão. |

### 5.3 Agenda nativa

| Módulo | Papel | Onde mexer |
|---|---|---|
| `src/lib/agenda.ts` | Ponto de entrada do módulo: só documentação/índice dos submódulos. | — |
| `src/lib/agenda-slots.ts` | Cálculo **puro** de horários livres (fuso, antecedência, buffers, bloqueios, tetos de 62 dias/400 slots). | Regra de geração de slot. |
| `src/lib/agenda-booking.ts` | Tipos de reunião, disponibilidade, links rastreados, reserva pública e cancelamento público. | Regras de reserva, janela padrão, URL pública. |
| `src/lib/agenda-notify.ts` | Convite `.ics` por e-mail, aviso ao vendedor e confirmação no WhatsApp do participante. Falha de envio vira estado `unknown`, nunca quebra a reserva. | Conteúdo e canais da notificação. |
| `src/lib/agenda-reminders.ts` | Lembrete automático antes da reunião (roda no cron), uma vez por reserva. | Antecedência, canal (WhatsApp/e-mail), texto. |
| `src/lib/scheduling.ts` | Agendamento **assistido**: pedido de reunião, link do agendador externo, `.ics`, cancelamento. | Quando a reunião vira `requested` vs `confirmed`. |

### 5.4 Relacionamento: WhatsApp, voz, atendimento

| Módulo | Papel | Onde mexer |
|---|---|---|
| `src/lib/whatsapp/akg.ts` | Cliente do gateway WA-AKG: status, pareamento (QR), envio de texto/áudio/mídia, `assertWhatsAppAccess`. | Protocolo com o gateway, sessão, mídia. |
| `src/lib/whatsapp/commands.ts` | Recibo durável de comando de envio (`whatsapp_commands`); resultado incerto **nunca** é reenviado. | Regras de idempotência e cota diária. |
| `src/lib/whatsapp/webhook-signing.ts` | Segredo do webhook derivado do master + `sessionId`. | Rotação do segredo. |
| `src/lib/whatsapp/harvey-webhook.ts` | Reconcilia o webhook do vendedor depois de conectar. | Fluxo de pareamento. |
| `src/lib/voice/voicestudio.ts` | Contrato com o motor de voz (config, engine, contrato privado de geração). | Novo motor, parâmetros de TTS. |
| `src/lib/voice/delivery.ts` | Fila e execução de entrega de áudio/call, autorização da operação. | Fila, cota, estados (`queued`→`sent`/`unknown`). |
| `src/lib/voice/campaign.ts` | Fecha a ação da campanha quando o job de voz é enviado. | Ligar voz ao passo de campanha. |
| `src/lib/mailer.ts` | Office 365 / Microsoft Graph: e-mail de acesso, relatório de exclusão, aviso de suporte, convite de calendário, aviso comercial. | Novos e-mails, remetente, template. |
| `src/lib/support.ts` | Núcleo do Helpin: intake (web/WhatsApp), inbox, thread, etiquetas, times, notas internas, origem liberada do widget. | Regras do inbox e roteamento. |
| `src/lib/support-sla.ts` | Política de SLA por operação e cálculo de prazo (respeita horário comercial). | Prazos e regra de breach. |
| `src/lib/support-schedule.ts` | Horário de atendimento (fuso, dias, abertura/fechamento) e auto-resposta. | Horário e mensagem de auto-resposta. |
| `src/lib/support-csat.ts` | CSAT: janela de 24 h, nota única (1..5), resumo e payload público. | Janela, escala e texto da pesquisa. |
| `src/lib/support-reports.ts` | Relatório de atendimento: volume, primeira resposta, SLA, resolução, CSAT, agentes e times. | Métricas e fuso do relatório. |
| `src/lib/webhooks.ts` | Webhooks de saída com assinatura HMAC (`X-Prospectra-Signature`) e lista de eventos. | Eventos assinados e formato do payload. |
| `src/lib/audit.ts` | Trilha de auditoria por operação (ações sensíveis). | Novas entidades auditadas. |
| `src/lib/help.ts` | Artigos da central de ajuda: slug, CRUD, busca por texto (ILIKE). | Busca, publicação, slug. |
| `src/lib/deletion-audit.ts` | Exclusão atômica + relatório de exclusão reservado ao dono (não sai para demo). | Fluxo de exclusão e notificação. |

### 5.5 Inteligência comercial e comunicação

| Módulo | Papel | Onde mexer |
|---|---|---|
| `src/lib/harvey.ts` | Motor comercial: plano de conversa por IA, validação de entrada, `optOut`, roteamento de handoff. | Prompt, regras de handoff e opt-out. |
| `src/lib/harvey-operations.ts` | Operação: perfil do vendedor, aprovação de conversa, handoff, fila de saída, verificação de assinatura HMAC. | Aprovação, outbox, assinatura. |
| `src/lib/harvey-webhooks.ts` | Entrada do webhook do Harvey: valida assinatura por sessão, grava job, retoma fila interrompida. | Idempotência e retomada. |
| `src/lib/communication-guidance.ts` | Tipos de domínio: quadrantes DISC, preferências, origem/evidência, escopo de acesso ao lead. | Novo quadrante ou tipo de evidência. |
| `src/lib/communication-copy.ts` | Roteiro de perguntas e mensagem comercial conforme o quadrante. | Texto das abordagens. |
| `src/lib/communication-discovery.ts` | Inferência do estilo DISC (IA primária, léxico local como fallback) — sempre **estimativa**. | Prompt e pesos léxicos. |
| `src/lib/communication.ts` | Persistência do perfil de comunicação (`lead_communication_profiles`), descoberta em lote no cron. | Tabela e fluxo de descoberta. |
| `src/lib/intelligence/jobs.ts` | Enfileira e lista análises de qualidade de dados (`intelligence_jobs`). | Fila e escopo. |
| `src/lib/intelligence/runner.ts` | Executor da fila: 6 fatores, IA como cérebro com **fallback heurístico** (a IA nunca derruba o job). | Fatores, pesos, prompt. |

### 5.6 Demonstração

| Módulo | Papel | Onde mexer |
|---|---|---|
| `src/lib/demo.ts` | Cria/acha a org de demonstração e orquestra os seeds. | Nome da org de demo e orquestração. |
| `src/lib/demo-reset.ts` | Apaga a demo e semeia de novo ("Recriar do zero"). | O que é preservado no reset. |
| `src/lib/demo-sim.ts` | Piloto automático simulado: pool de busca fictício, `seedFeed`, `simulateCycle`. | Comportamento da simulação. |
| `src/lib/demo-agenda.ts` | Seed da agenda: tipos de reunião, disponibilidade, links, reservas e bloqueios fictícios. | Cenário de agenda. |
| `src/lib/demo-support.ts` | Seed do suporte: times, conversas, mensagens, SLA, horário, pré-chat, artigos, docs e tarefas. | Cenário de suporte. |
| `src/lib/demo-intel.ts` | Seed da inteligência: operações comerciais, perfis de comunicação, automações, auditoria e webhooks. | Cenário comercial. |
| `src/lib/demo-voice.ts` | Seed de voz: perfil clonado, fila de áudio e consentimento. | Cenário de voz. |

> Regra que vale para todos os seeds: **nada de rede** (sem e-mail, WhatsApp, IA ou webhook) e **nada de dado pessoal real** (e-mails `@demo.invalid`, telefones `+55 51 9XXXX-XXXX`).

---

## 6. Onde mexer por tema (guia rápido)

| Se você quer… | Vá para |
|---|---|
| Adicionar uma tela | `src/app/(app)/<tema>/page.tsx` (server component com `requireOrg()`) + item em `src/components/sidebar.tsx` |
| Adicionar um campo ao lead | `src/db/schema.ts` (`leads`) + migração em `drizzle/` + `src/lib/lead-attributes.ts` |
| Mudar o que a tela de leads mostra | `src/app/(app)/leads/page.tsx` (query) e `src/app/(app)/leads/leads-view.tsx` (UI) |
| Mudar a cadência das campanhas | `src/lib/cadence.ts` (motor) + `src/db/schema.ts` (`campaigns.steps`) |
| Ligar/desligar um recurso de campanha | `src/lib/campaign-features.ts` + coluna em `orgs` + `/admin` |
| Mudar o cálculo de horários da agenda | `src/lib/agenda-slots.ts` (puro, com teste) |
| Mudar o que a reserva dispara | `src/lib/agenda-notify.ts` e `src/lib/agenda-reminders.ts` |
| Mudar o comportamento do WhatsApp | `src/lib/whatsapp/*` e `src/app/(app)/whatsapp/actions.ts` |
| Mudar a voz | `src/lib/voice/*` e `src/app/(app)/voz/voice-actions.ts` |
| Mudar SLA, horário, CSAT ou webhooks do suporte | `src/lib/support*.ts` + `src/app/api/support/**` |
| Mudar a Intelligence comercial | `src/lib/intelligence/*` e `src/lib/harvey*.ts` |
| Mudar a IA (modelo, fallback, prompt) | `src/lib/ai.ts` |
| Conectar a conta LinkedIn do usuário | `src/lib/linkedin/connection.ts` + `src/app/api/integrations/linkedin/**` |
| Executar LinkedIn automaticamente | `src/lib/linkedin/automation.ts` + `src/lib/linkedin/http-executor.ts` |
| Adicionar uma rota de API | `src/app/api/<tema>/route.ts`; use `requireScope()`/`requireOrg()` e o envelope `ok()`/`fail()` de `src/app/api/agenda/_http.ts` |
| Adicionar uma ação de servidor | `src/app/(app)/actions.ts` (ou `src/app/(app)/<tema>/actions.ts`) com `requireOrg()` no topo |
| Mudar as permissões | `src/lib/auth.ts` (`require*`, `canManage`) e `src/lib/admin-policy.ts` |
| Mudar o menu lateral | `src/components/sidebar.tsx` (`primary`, `groups`) |
| Recriar a demonstração | `src/lib/demo-reset.ts` + `POST /api/demo/reset` (só admin master) |

---

## 7. Mapa rápido das tabelas

46 tabelas no total: 45 em `src/db/schema.ts` + `lead_communication_profiles`, que é criada por SQL cru (`drizzle/0008_communication.sql`) e acessada por `db.execute` em `src/lib/communication.ts`.

> Duas tabelas existem no schema mas **ainda não têm tela nem API** — só o seed da demo as preenche: `supportPrechatForms` / `support_prechat_forms` (formulário pré-chat) e `automationRules` / `automation_rules` (gatilho → condições → ações). Tratar como esquema reservado.

| Família | Tabelas |
|---|---|
| Tenancy | `users`, `orgs`, `memberships`, `sessions`, `authTokens` |
| Prospecção | `leads`, `campaigns`, `enrollments`, `actions`, `events` |
| Demonstração | `simFeed` |
| Auditoria | `deletionReports`, `auditLog` |
| WhatsApp | `whatsappCommands` |
| Inteligência | `intelligenceJobs`, `commercialProfiles`, `leadCommunicationProfiles` (SQL cru, ver `drizzle/0008_communication.sql`) |
| Voz | `voiceProfiles`, `voiceRegistrations`, `voiceJobs` |
| Harvey (comercial) | `harveyConversations`, `harveyInbox`, `harveyOutbox`, `harveySellerInbox`, `harveyInboundJobs` |
| Agenda | `meetings`, `agendaEventTypes`, `agendaAvailability`, `agendaBlackouts`, `agendaLinks` |
| LinkedIn | `linkedinConnections` (conta OIDC do usuário), `linkedinDispatches` (recibo do despacho automático) |
| Suporte (Helpin) | `supportConversations`, `supportMessages`, `supportWidgetOrigins`, `supportTeams`, `supportTeamMembers`, `supportSlaPolicies`, `supportSchedules` |
| Workspace | `helpArticles`, `docs`, `tasks` |
| Campos do lead | `leadAttributeDefs` |
| Integrações | `webhookEndpoints` |

---

## 8. Convenções que valem para qualquer mudança

1. **O `orgId` nunca vem do cliente.** Toda query de operação filtra por `ctx.org.id` (ou pelo `scope` derivado da sessão). Isso vale para rotas, server actions e lib.
2. **Erro de envio não quebra a operação.** Notificações gravam estado (`unknown`, `sent`) em vez de estourar exceção (`agenda-notify.ts`, `agenda-reminders.ts`).
3. **Resultado incerto não é reenviado.** `whatsapp_commands` e `linkedin_dispatches` existem para isso.
4. **A IA é opcional.** Toda falha de IA cai em heurística local e o job completa (`intelligence/runner.ts`).
5. **A demo nunca envia nada de verdade.** Ramo `is_demo` em cada integração.
6. **Migração junto.** Mudança em `src/db/schema.ts` exige `pnpm db:generate` e o `.sql` correspondente em `drizzle/`.
7. **Escopo do Prospectra+ só.** Não tocar em outros projetos (CRM Argus, site institucional, etc.) sem autorização — ver `docs/ESCOPO-E-TOCABILIDADE.md`.

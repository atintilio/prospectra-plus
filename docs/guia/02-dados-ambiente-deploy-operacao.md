# Prospectra+ — Guia de manutenção (Parte 2): dados, ambiente, deploy e operação

> Base do código: `/opt/prospectra-plus` (monorepo `prospectra-plus`), Next.js 16 App Router + React 19,
> Drizzle ORM sobre Postgres (Neon), deploy em OpenNext/Cloudflare Workers, com a VPS nativa (França) como
> caminho de produção e rollback.
> Este guia foi escrito **lendo o código e a infra**: cada tabela, variável, arquivo e comando abaixo existe
> no repositório ou na VPS nesta data. Onde o repositório **não** traz o artefato, isso está dito.

---

## 1. Topologia do ambiente

### 1.1 Quem é do Prospectra+ e quem não é

| Recurso | Onde | Dentro do Prospectra+? |
|---|---|---|
| App Next.js | `/opt/prospectra-plus`, release `prospectra-plus.service` | ✅ |
| Worker Cloudflare do app | Worker `prospectra` | ✅ |
| Bridge do WhatsApp | Worker `prospectra-wa-gateway-bridge` | ✅ |
| Gateway WhatsApp (WA-AKG) | `prospectra-wa-akg.service`, `/opt/prospectra-wa-akg`, 3101 | ✅ |
| Cloudflare Tunnel → WA-AKG | Tunnel `prospectra-wa-gateway`, host `wa.argusprime.com.br` | ✅ |
| Voice Studio (MOSS-TTS-Nano) | `prospectra-voice.service`, `/opt/prospectra-voice` | ✅ |
| Agenda nativa | `src/app/api/agenda/**`, `src/lib/agenda-*.ts` | ✅ |
| Postgres Neon | `DATABASE_URL` (VPS) / `NEON_DATABASE_URL` (Worker) | ✅ |
| Cron do Prospectra | `/etc/cron.d/prospectra-tick` (5 min) | ✅ |
| cal.diy self-hosted | `prospectra-agenda.service`, `/opt/agenda`, 3102 | ⚠️ legado — **decisão pendente do dono** (só desligar com aval) |
| CRM Argus (`argus-api`, `argus-app`) | `/opt/argus-crm`, `crm.argusprime.com.br` | ❌ **fora de escopo** |
| Reversa/Gov, site institucional, e-mail/Mailgun, Microsoft 365 (tenant) | — | ❌ **fora de escopo** |

> Fonte: `docs/ESCOPO-E-TOCABILIDADE.md` (seções 1 e 2). A regra é dura: **item fora de escopo é intocável
> sem autorização escrita do dono**. Se a tarefa exigir tocar um deles, **pare e pergunte**.

### 1.2 Portas e domínios

| Porta (loopback) | Serviço | Origem |
|---|---|---|
| `127.0.0.1:3100` | App Next.js (`prospectra-plus.service`) | `infra/prospectra/systemd/prospectra-plus.service` |
| `127.0.0.1:3101` | Gateway WhatsApp WA-AKG | `infra/prospectra/systemd/prospectra-wa-akg.service` + `infra/wa-akg/compose.yaml` |
| `127.0.0.1:3102` | cal.diy (legado, sem vhost público desde 30/10/2026) | `infra/agenda/prospectra-agenda.service` |
| `127.0.0.1:3900` | Voice Studio (uvicorn) | `infra/prospectra/systemd/prospectra-voice.service` (`--port 3900`) |
| `127.0.0.1:8080` | Worker de LinkedIn (quando implantado) | `infra/linkedin/worker.mjs` (`PORT`) |

> ⚠️ **Divergência conhecida**: `docs/ESCOPO-E-TOCABILIDADE.md` §1 registra a voz como "porta 3103", mas a
> unit systemd versionada sobe o uvicorn em **`--port 3900`** — e é o 3900 que o `docs/FALTA-IMPLANTAR.md` §6.2
> usa no comando de verificação. **3900 é a referência real.**

| Domínio | Aponta para | TLS |
|---|---|---|
| `prospectra.argusprime.com.br` | nginx `[::]:80` → `127.0.0.1:3100` | Cloudflare (edge) |
| `agenda.argusprime.com.br` | nginx `[::]:80` → `127.0.0.1:3100` (agenda **nativa**) | Cloudflare (edge) |
| `wa.argusprime.com.br` | Cloudflare Tunnel `prospectra-wa-gateway` → VPS 3101 | Cloudflare (edge) |
| `voice.argusprime.com.br` | Voice Studio na VPS | Cloudflare (edge) |

O **nginx da VPS escuta somente em `[::]:80`** — o TLS termina na Cloudflare. Para testar localmente use
`http://[::1]/` com `-H "Host: <domínio>"`; `127.0.0.1` não conecta.

### 1.3 Caminho do tráfego (o que é a fonte da verdade hoje)

```
usuário → Cloudflare (TLS + proxy) → nginx VPS (:80) → 127.0.0.1:3100 (Next.js) → Neon (Postgres)
                                                          └→ /whatsapp-gateway/* → 127.0.0.1:3101 (WA-AKG)
```

O Worker `prospectra` (Cloudflare) é o **caminho planejado** de produção (`docs/guia/03-decisoes-e-expectativas.md` §2:
"Cloudflare é o caminho; a Vercel está fora do caminho de produção. A VPS segue como rollback"). Em 01/11/2026 o
build OpenNext foi gerado e o bundle publicado, mas **o Worker ainda não tem rota/domínio na zona** — a VPS
continua atendendo o domínio público.

---

## 2. Banco de dados

### 2.1 Onde o schema mora

| Item | Caminho |
|---|---|
| Schema Drizzle (fonte da verdade do modelo) | `src/db/schema.ts` (577 linhas) |
| Conexão (Node/VPS e Worker) | `src/db/index.ts` |
| Migrações SQL | `drizzle/*.sql` (26 arquivos, `0000`…`0025`) |
| Ledger das migrações | `drizzle/meta/_journal.json` + `drizzle/meta/*_snapshot.json` |
| Config do drizzle-kit | `drizzle.config.ts` (`out: './drizzle'`) |
| Auto-cura / decisão de recriar schema | `scripts/migrate-repair.mjs` |
| Aplicação das migrações | `scripts/migrate.mjs` |

### 2.2 Inventário de tabelas por domínio

**45 tabelas publicadas** — 44 declaradas em `src/db/schema.ts` (versão em `main`) + 1 criada em SQL cru
(`lead_communication_profiles`, migration `0008_communication.sql`, usada por `src/lib/communication.ts`).
A tabela `linkedin_connections` (migration `0025`) existe na árvore de trabalho em andamento e **ainda não está
publicada** — quando for, o total vai a 46.

Os grupos abaixo somam **46 linhas = 45 publicadas + 1 em andamento**. Cada linha da coluna "Tabela" é **uma
tabela** (uma linha por entidade, sem agrupar), para a contagem ser auditável contra o schema.

#### Identidade e multi-tenant (5)

| Tabela | Papel | Chaves / índices notáveis |
|---|---|---|
| `users` | Contas de login | `users_email_uq` (único por e-mail); `platform_role` (`admin`/`user`), `status` (`invited`/`active`/`disabled`), limites `daily_invites`/`daily_messages` |
| `orgs` | Operações (multi-tenant) | flags `active`, `ai_enabled`, `image_enabled`, `call_enabled`, `linkedin_enabled`, `is_demo`; `driver` (`assisted`/`unipile`); `seats`, `search_credits_month` |
| `memberships` | Vínculo usuário ↔ operação | PK composta `(org_id, user_id)`; `role` = `owner`/`manager`/`sdr`/`closer`; `memberships_user_idx` |
| `sessions` | Sessão web | PK = `sha256(token)`; `expires_at`; `sessions_user_idx` |
| `auth_tokens` | Convite e reset de senha | PK = `sha256(token)`; `kind` = `invite`/`reset`; `used_at` |

> **Regra de sessão**: `src/lib/auth.ts` grava o cookie `prospectra_session` (httpOnly, 14 dias) e guarda
> **apenas o hash SHA-256** do token na tabela. Não existe `AUTH_SECRET` no código — o `.env.example` e a
> `infra/prospectra/README.md` são explícitos nesse ponto.

#### CRM / prospecção (5)

| Tabela | Papel | Notas |
|---|---|---|
| `leads` | Contatos | `leads_org_url_uq` (LinkedIn único por operação); `stage` ∈ `new`…`won`, `lost`, `do_not_contact`; `attributes` jsonb (atributos por operação, Fase A) |
| `lead_attribute_defs` | Definição dos atributos por operação | `lead_attribute_defs_org_key_uq`; tipo `text`/`number`/`date`/`bool`/`select` |
| `lead_communication_profiles` | Perfil de comunicação/DISC do lead | **SQL cru**, criada na migration `0008`; `source` ∈ `manual`, `observational_quiz`, `inferred` |
| `campaigns` | Campanhas multicanal | `steps` jsonb (`CampaignStep[]`); `status` ∈ `draft`, `active`, `paused`, `finished` |
| `events` | Trilha de eventos | 15 tipos (`invite_sent`…`ai_search`); `events_org_type_at_idx` |

#### Cadência / fila de trabalho (3)

| Tabela | Papel | Notas |
|---|---|---|
| `enrollments` | Lead dentro de uma campanha | `enrollments_one_active_per_lead` (parcial, só `running`/`waiting_accept`); `enrollments_due_idx` |
| `actions` | Tarefa a executar (a "Fila") | `actions_enrollment_step_uq`; `actions_user_due_idx`; `due_date` é **date**, não timestamp |
| `sim_feed` | Linha do tempo do piloto **simulado** (só org de demo) | `sim_feed_org_at_idx` |

#### WhatsApp e Harvey (6)

| Tabela | Papel | Notas |
|---|---|---|
| `whatsapp_commands` | Recibo durável de cada envio | `state` ∈ `pending`, `sent`, `unknown`; **resultado incerto nunca é reenviado** |
| `harvey_conversations` | Conversa do assistente comercial | `state` ∈ `active`, `processing`, `handoff`, `stopped`; unique por `(org_id, lead_id)` e por `(org_id, user_id, phone)` |
| `harvey_inbox` | Mensagens recebidas do WhatsApp | `harvey_inbox_receipt_uq` — recibo único por mensagem do provedor |
| `harvey_outbox` | Fila de saída do Harvey (lead, interno, e-mail) | `state` ∈ `pending`, `processing`, `sent`, `unknown`, `cancelled`; `harvey_outbox_due_idx` |
| `harvey_seller_inbox` | Caixa de entrada do vendedor | `harvey_seller_inbox_receipt_uq` |
| `harvey_inbound_jobs` | Fila de processamento das entradas | `state` ∈ `queued`, `processing`, `completed`, `review`; `harvey_inbound_receipt_uq` |

#### Agenda nativa (5)

| Tabela | Papel | Notas |
|---|---|---|
| `agenda_event_types` | Tipo de reunião | `agenda_event_types_slug_uq`; duração, antecedência, fuso, lembrete, aviso ao vendedor, convite |
| `agenda_availability` | Janela semanal (dia + minutos) | `agenda_availability_event_idx` |
| `agenda_blackouts` | Bloqueios (férias, indisponibilidade) | `agenda_blackouts_org_idx` |
| `agenda_links` | Link público rastreado | `agenda_links_token_uq`; opcionalmente vinculado a um lead |
| `meetings` | Reserva | `meetings_one_open_per_lead` e `meetings_no_double_booking` (parciais, status `requested`/`confirmed`) |

> O servidor **nunca confia no horário enviado pelo navegador**: `src/lib/agenda-booking.ts` recalcula a grade e
> valida contra a disponibilidade atual no momento da reserva.

#### Suporte / Helpin (12)

| Tabela | Papel |
|---|---|
| `support_conversations` | Inbox compartilhada (`audience` = `customer`/`product`; `channel` = `web`/`whatsapp`/`internal`; SLA, CSAT, `labels`) |
| `support_messages` | Mensagens (`author` = `visitor`/`agent`/`system`; `private` = nota interna; `mentions`) |
| `support_widget_origins` | Allowlist de origens do widget |
| `support_teams` | Times de atendimento (nome único por operação) |
| `support_team_members` | Membros de cada time (PK composta `team_id` + `user_id`) |
| `help_articles` | Central de ajuda (busca por `ILIKE`; busca semântica é upgrade futuro) |
| `support_sla_policies` | SLA por operação (1ª resposta / resolução, `business_hours_only`) |
| `support_schedules` | Horário de atendimento + auto-resposta fora do horário |
| `support_prechat_forms` | Formulário pré-chat do widget |
| `automation_rules` | Regras de automação (gatilho → condições → ações) |
| `audit_log` | Trilha de ações sensíveis |
| `webhook_endpoints` | Webhooks de saída (5 eventos, assinatura HMAC-SHA256) |

#### Workspace interno e comercial (4)

| Tabela | Papel |
|---|---|
| `docs` | Documentos internos por operação |
| `tasks` | Projetos/tarefas (estilo Linear): `status` ∈ `todo`, `doing`, `done` |
| `commercial_profiles` | Perfil comercial do vendedor (nome, empresa, telefone, estratégia, ofertas) |
| `deletion_reports` | Auditoria de exclusões + fila de aviso ao proprietário |

#### Voz (3)

| Tabela | Papel | Notas |
|---|---|---|
| `voice_profiles` | Perfil de voz clonado | PK `(org_id, user_id)`; `consent_at` obrigatório |
| `voice_registrations` | Registro de cadastros de voz | limite diário (5) |
| `voice_jobs` | Fila de áudio/ligação | `state` ∈ `queued`, `running`, `sent`, `unknown`, `failed`, `waiting_transport` |

#### Inteligência, LinkedIn e automação (3)

| Tabela | Papel | Notas |
|---|---|---|
| `intelligence_jobs` | Fila de análise de qualidade de dados | `state` ∈ `queued`, `running`, `completed`, `failed`, `cancelled`; `attempts`; resultado com 6 fatores |
| `linkedin_dispatches` | Recibo durável de cada ação de LinkedIn | `state` ∈ `pending`, `sent`, `unknown`; `linkedin_dispatches_action_uq` |
| `linkedin_connections` | Conta do LinkedIn conectada (OIDC) | **migration `0025`, ainda não publicada**; guarda só perfil e estado — **nunca** o `client_secret` nem o token |

#### Contagem por grupo (auditoria)

| Grupo | Tabelas | Publicadas |
|---|---|---|
| Identidade e multi-tenant | 5 | 5 |
| CRM / prospecção | 5 | 5 |
| Cadência / fila de trabalho | 3 | 3 |
| WhatsApp e Harvey | 6 | 6 |
| Agenda nativa | 5 | 5 |
| Suporte / Helpin | 12 | 12 |
| Workspace interno e comercial | 4 | 4 |
| Voz | 3 | 3 |
| Inteligência, LinkedIn e automação | 3 | 2 (`linkedin_connections` ainda não publicada) |
| **Total** | **46** | **45** |

Conferência: 44 `pgTable(` em `src/db/schema.ts` no `main` + `lead_communication_profiles` (SQL cru) = **45
publicadas**; com `linkedin_connections` (migration `0025`, fora do `main`) = **46**.

### 2.3 Migrações

| Item | Valor |
|---|---|
| Arquivos SQL | 26 (`drizzle/0000_init.sql` … `drizzle/0025_linkedin_connections.sql`) |
| Entradas no ledger | 26 (`drizzle/meta/_journal.json`, `idx` 0…25) |
| `0025_linkedin_connections.sql` | **Fora do `main`** — trabalho em andamento (ver `git status`) |
| Gerar nova migration | `pnpm db:generate` (= `drizzle-kit generate`) |
| Aplicar | `node scripts/migrate.mjs` (usa `drizzle-orm/postgres-js/migrator` com `migrationsFolder: 'drizzle'`) |

**Últimas migrations e o que elas mudaram**

| Migration | Conteúdo |
|---|---|
| `0023_agenda_nativa` | Cria `agenda_event_types`, `agenda_availability`, `agenda_blackouts`, `agenda_links` + 12 colunas novas em `meetings` (convite, cancelamento, fuso, participante) |
| `0024_large_leopardon` | `agenda_event_types.reminder_minutes_before`, `.notify_seller`, `.send_invite`; `meetings.invite_state`, `.invite_sent_at`, `.seller_notified_at` |
| `0025_linkedin_connections` *(não publicada)* | Cria `linkedin_connections` + `linkedin_connections_org_user_uq` |
| `0022_blue_callisto` | `orgs.linkedin_enabled` (gate do piloto automático por operação) |
| `0021_helpin_fase6_sla_atributos` | 7 tabelas novas (SLA, horário, pré-chat, atributos, automação, auditoria, webhooks) + `leads.attributes` + colunas de CSAT |
| `0020_powerful_betty_brant` | `orgs.image_enabled`, `orgs.call_enabled` (gate dos passos de imagem e ligação) |

> ⚠️ **Antes de rodar migration em produção, confira o ledger**: o `drizzle/` e a tabela `__drizzle_migrations`
> podem sobreviver a um banco recriado enquanto as tabelas do app somem. Nesse estado o drizzle acha que já
> aplicou tudo e o app quebra com `relation "users" does not exist` (42P01). É o incidente real de 29/10/2026.

### 2.4 Auto-cura do schema (`scripts/migrate-repair.mjs`)

`scripts/migrate.mjs` consulta o banco **antes** de aplicar qualquer migration:

| Situação detectada | Decisão | Efeito |
|---|---|---|
| `users`, `orgs` e `leads` **todas** presentes | `nenhuma` | Migração normal |
| Falta **uma ou duas** das três, ou o ledger não existe | `abortar` | **Nada é apagado.** O deploy para com mensagem explicativa |
| Faltam **as três** e o ledger existe | `recriar` | `drop schema drizzle cascade` + `drop schema public cascade` → recria do zero e reaplica todas as migrations |
| Faltam as três e `PROSPERTA_DB_REPAIR=0` | `abortar` | Auto-cura desligada; nada é alterado |

- `PROSPERTA_DB_REPAIR=0` é o que está no `wrangler.jsonc` do Worker: **no Cloudflare a auto-cura é desligada**,
  porque o Worker não pode derrubar o schema do Neon compartilhado.
- `infra/prospectra/README.md` §3 é explícito: *"Não execute `pnpm build` contra o banco de produção sem essa
  inspeção"* — a recriacao é destrutiva por definição.

### 2.5 Backup e restauração

```bash
# Snapshot consistente (read-only no banco; escreve um JSON em /var/backups/prospectra-plus)
set -a; . /etc/prospectra-plus/app.env; set +a
node /opt/prospectra-plus-current/infra/prospectra/backup-data.mjs
# formato de saída: {"file":"/var/backups/prospectra-plus/data-<ISO>.json","tables":N,"rows":N}
```

| Item | Detalhe |
|---|---|
| Script | `infra/prospectra/backup-data.mjs` |
| Como | `begin('isolation level repeatable read read only')` e lê todas as tabelas de `public` e `drizzle` |
| Destino | `/var/backups/prospectra-plus/data-<timestamp>.json`, pasta `700`, arquivo `600`, flag `wx` (nunca sobrescreve) |
| Observação | O snapshot **inclui** o ledger `drizzle.__drizzle_migrations` — o schema é reconstituído pelas migrations da release correspondente |
| Restauro | Não há script de restauração no repositório. O caminho é: criar o schema vazio rodando `node scripts/migrate.mjs` (que recria e reaplica tudo) e então carregar o JSON linha a linha |

### 2.6 Conexão: como o app escolhe a origem do banco (`src/db/index.ts`)

| Ambiente | Origem da URL | Driver |
|---|---|---|
| Node / VPS | `process.env.DATABASE_URL` (fallback `POSTGRES_URL`) | `postgres` (postgres.js), `max: 1`, `prepare: false`, `idle_timeout: 20` |
| Cloudflare Worker | Secret `NEON_DATABASE_URL` (texto) lido via `getCloudflareContext().env`; também aceita um binding Hyperdrive (`.connectionString`) | `@neondatabase/serverless` — `Client` (conexão única) + `drizzle-orm/neon-serverless` sobre **WebSocket** |
| Local / teste | `DATABASE_URL=pglite://./.data/dev` | `@electric-sql/pglite` (Postgres em WebAssembly) — as migrations são aplicadas automaticamente no boot |

> O Worker **não** usa `Pool`: o app usa transações e o driver HTTP do Neon não as suporta. E o client é criado
> **por request** (`isCloudflareWorker()` → `create()`), porque o runtime do Workers proíbe reutilizar I/O entre
> requests (`Cannot perform I/O on behalf of a different request`). No Node/VPS o singleton continua correto.

---

## 3. Variáveis de ambiente

### 3.1 Inventário completo

Fonte: `grep -rn "process.env" src/ scripts/` + `infra/`. **Todas são lidas no servidor** — o app **não usa
nenhuma** `NEXT_PUBLIC_*` (o prefixo só aparece no cal.diy legado, `infra/agenda/.env.example`).

| Variável | O que faz | Onde é lida | Tipo | Onde mora |
|---|---|---|---|---|
| `DATABASE_URL` | URL do Postgres | `src/db/index.ts:38`, `scripts/migrate.mjs:8`, `infra/prospectra/backup-data.mjs:5` | **secret** | `app.env` (VPS) · `NEON_DATABASE_URL` no Worker · painel da Vercel |
| `POSTGRES_URL` | Fallback de `DATABASE_URL` | `src/db/index.ts:38`, `scripts/migrate.mjs:8` | **secret** | idem |
| `NEON_DATABASE_URL` | URL do Postgres **no Worker** (secret text) | `src/db/index.ts:32` | **secret** | Secret do Worker `prospectra` |
| `CRON_SECRET` | Bearer de `GET /api/cron` e `GET /api/harvey/tick` | `src/app/api/cron/route.ts:18`, `src/app/api/harvey/tick/route.ts:7`, `infra/prospectra/scripts/prospectra-plus-cron-trigger.py`, `infra/prospectra/scripts/prospectra-harvey-recovery.py` | **secret** | `app.env` **+** `harvey-worker.env` **+** `cron.env` (mesmo valor nos três) |
| `PUBLIC_APP_URL` | URL pública do app (cookie, links, webhook) | `src/lib/auth.ts:121`, `src/lib/agenda-notify.ts:113`, `src/app/(app)/whatsapp/actions.ts:20`, `infra/prospectra/scripts/prospectra-harvey-recovery.py` | plain | `app.env` · `harvey-worker.env` · `vars` do `wrangler.jsonc` |
| `MASTER_USER_EMAIL` | Admin master protegido | `src/lib/auth.ts:25`, `src/lib/admin-policy.ts:4`, `src/lib/mailer.ts`, `scripts/migrate.mjs:61`, `scripts/user-sync.mjs` | plain | `app.env` · `vars` do `wrangler.jsonc` |
| `AI_API_KEY` | Chave do provedor de IA (preferida) | `src/lib/ai.ts:26` | **secret** | `app.env` · secret do Worker |
| `OPENROUTER_API_KEY` | Chave do provedor (fallback de `AI_API_KEY`) | `src/lib/ai.ts:26` | **secret** | `app.env` · painel da Vercel |
| `AI_BASE_URL` | Endpoint do provedor (compatível com OpenAI) | `src/lib/ai.ts:39` | plain | `app.env` · `vars` do `wrangler.jsonc` (`https://api.z.ai/api/paas/v4`) |
| `AI_MODEL` | Modelo principal | `src/lib/ai.ts:55`, `src/lib/harvey.ts:63` | plain | `app.env` · `vars` do `wrangler.jsonc` |
| `AI_FALLBACK_MODELS` | Cadeia de fallback (vírgula) | `src/lib/ai.ts:60` | plain | `app.env` · `vars` do `wrangler.jsonc` |
| `WA_AKG_BASE_URL` | URL HTTPS do gateway WhatsApp **sem `/api`** | `src/lib/whatsapp/akg.ts:23` | plain | `app.env` · `vars` do `wrangler.jsonc` |
| `WA_AKG_API_KEY` | Chave do gateway (header `x-api-key`) | `src/lib/whatsapp/akg.ts:23` | **secret** | `app.env` · secret do Worker |
| `WA_AKG_SESSION_ID` | Sessão fixa do número pareado | `src/lib/whatsapp/akg.ts:18` | plain | `app.env` · `vars` do `wrangler.jsonc` |
| `HARVEY_WEBHOOK_SECRET` | Assina o webhook de entrada do Harvey (HMAC) | `src/app/api/harvey/inbound/route.ts:12` | **secret** | `app.env` · painel da Vercel |
| `SUPPORT_WEBHOOK_SECRET` | Assina o webhook de WhatsApp do suporte (HMAC) | `src/app/api/support/whatsapp/route.ts:22` | **secret** | `app.env` |
| `VOICESTUDIO_BASE_URL` | URL do Voice Studio | `src/lib/voice/voicestudio.ts:8` | plain | `app.env` · `vars` do `wrangler.jsonc` |
| `VOICESTUDIO_API_KEY` | Chave do Voice Studio (`Authorization: Bearer`) | `src/lib/voice/voicestudio.ts:8` | **secret** | `app.env` — **tem que ser igual à `OMNIVOICE_API_KEY` de `/opt/prospectra-voice/.env`** |
| `VOICESTUDIO_ENGINE` | Motor de voz (ex.: `moss-tts-nano`) | `src/lib/voice/voicestudio.ts:8` | plain | `app.env` · `vars` do `wrangler.jsonc` |
| `VOICE_AUTOMATION_ENABLED` | Libera o **envio** de áudio (perfil e tela existem sem ela) | `src/app/(app)/whatsapp/voice-actions.ts:26`, `scripts/voice-worker.ts:11` | flag | `app.env` · `vars` do `wrangler.jsonc` (= `false`) |
| `INTELLIGENCE_WORKER_ENABLED` | Libera o enfileiramento da análise de dados (fora da demo) | `src/app/(app)/inteligencia/analysis-actions.ts:9`, `src/app/(app)/inteligencia/page.tsx:39` | flag | `app.env` · `vars` do `wrangler.jsonc` (= `true`) |
| `LINKEDIN_AUTOMATION_ENABLED` | Interruptor geral do LinkedIn automático | `src/lib/linkedin/automation.ts:31` | flag | `app.env` |
| `LINKEDIN_WORKER_URL` | URL do executor de LinkedIn na VPS | `src/lib/linkedin/http-executor.ts:8` | plain | `app.env` |
| `LINKEDIN_WORKER_KEY` | Bearer do executor | `src/lib/linkedin/http-executor.ts:9`, `infra/linkedin/worker.mjs:133` | **secret** | `app.env` **e** `/opt/prospectra-linkedin/.env` (mesmo valor) |
| `AGENDA_PUBLIC_URL` | Base pública do link de agendamento | `src/lib/agenda-booking.ts` | plain | `app.env` · `vars` do `wrangler.jsonc` |
| `MEETING_SCHEDULER_URL` | Link de marcação externo (fase assistida) | `src/lib/scheduling.ts:15` | plain | `app.env` |
| `BLOB_READ_WRITE_TOKEN` | Lê o `prospectra/auth.json` (migração do v1) | `src/lib/legacy.ts:10`, `scripts/migrate.mjs:48` | **secret** | `app.env` · painel da Vercel |
| `OFFICE365_TENANT_ID` | Tenant do Microsoft Graph | `src/lib/mailer.ts:16` | **secret** | `app.env` · painel da Vercel |
| `OFFICE365_CLIENT_ID` | App do Microsoft Graph | `src/lib/mailer.ts:16` | **secret** | idem |
| `OFFICE365_CLIENT_SECRET` | Segredo do app | `src/lib/mailer.ts:16` | **secret** | idem |
| `OFFICE365_SENDER_EMAIL` | Remetente dos e-mails | `src/lib/mailer.ts:16` | plain | idem |
| `PROSPERTA_DB_REPAIR` | `0` desliga a auto-cura de schema | `scripts/migrate.mjs:33` | flag | `app.env` · `vars` do `wrangler.jsonc` (= `0`) |
| `NODE_ENV` | Modo do runtime | `src/lib/auth.ts:35`, `src/lib/whatsapp/akg.ts:32` | flag | `prospectra-plus.service` (`NODE_ENV=production`) |
| `DEMO_USER_EMAIL` | E-mail do dono da demonstração (usado no reset) | `scripts/demo-reset.ts:17` | plain | digitado no comando |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_GRAPH_USER_ID`, `MAIL_FROM` | Aliases legados do Office 365 | `src/lib/mailer.ts:16-17` | **secret** (exceto `MAIL_FROM`) | idem |

Variáveis dos **serviços auxiliares** (fora do app, cada uma no seu arquivo):

| Variável | Serviço | Onde |
|---|---|---|
| `AKG_DB_PASSWORD`, `AKG_DB_ROOT_PASSWORD`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BASE_URL`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST` | WA-AKG | `/opt/prospectra-wa-akg/.env` (via `infra/wa-akg/.env.example`) |
| `OMNIVOICE_API_KEY`, `OMNIVOICE_SERVER_MODE` | Voice Studio | `/opt/prospectra-voice/.env` + `prospectra-voice.service` |
| `LI_AT`, `PROXY_URL`, `PORT`, `HEADLESS` | Worker de LinkedIn | `infra/linkedin/.env.example` |
| `NEXT_PUBLIC_WEBAPP_URL`, `NEXT_PUBLIC_LICENSE_CONSENT`, `CALCOM_DB_PASSWORD`, `NEXTAUTH_SECRET`, `CALCOM_*`, `EMAIL_SERVER_*` | cal.diy (legado) | `infra/agenda/.env.example` |

### 3.2 Onde cada coisa mora

| Ambiente | Arquivo / painel | Permissão | Conteúdo |
|---|---|---|---|
| **VPS — app** | `/etc/prospectra-plus/app.env` | `600`, root | `DATABASE_URL`, `CRON_SECRET`, chaves de IA/voz/WhatsApp/Office 365 |
| **VPS — Harvey** | `/etc/prospectra-plus/harvey-worker.env` | `600` | `PUBLIC_APP_URL`, `CRON_SECRET` (**mesmo valor**) |
| **VPS — cron** | `/etc/prospectra/cron.env` | `600` | `CRON_SECRET` (**mesmo valor**) |
| **VPS — voz** | `/opt/prospectra-voice/.env` | `600` | `OMNIVOICE_API_KEY` (**mesmo valor de `VOICESTUDIO_API_KEY`**) |
| **VPS — WA-AKG** | `/opt/prospectra-wa-akg/.env` | `600` | credenciais do gateway e do MariaDB |
| **Cloudflare Worker `prospectra`** | `vars` do `wrangler.jsonc` (plain) + `wrangler secret put` (secret) | — | `vars`: `MASTER_USER_EMAIL`, `PUBLIC_APP_URL`, `AGENDA_PUBLIC_URL`, `WA_AKG_BASE_URL`, `WA_AKG_SESSION_ID`, `VOICESTUDIO_BASE_URL`, `VOICESTUDIO_ENGINE`, `AI_BASE_URL`, `AI_MODEL`, `AI_FALLBACK_MODELS`, `INTELLIGENCE_WORKER_ENABLED`, `VOICE_AUTOMATION_ENABLED`, `PROSPERTA_DB_REPAIR` · **secret**: `NEON_DATABASE_URL`, `AI_API_KEY`, `WA_AKG_API_KEY`, `VOICESTUDIO_API_KEY`, `HARVEY_WEBHOOK_SECRET`, `SUPPORT_WEBHOOK_SECRET`, `CRON_SECRET` |
| **Vercel (histórico)** | Painel do projeto → Environment Variables | — | `WA_AKG_*`, `VOICESTUDIO_*`, `VOICE_AUTOMATION_ENABLED`, `CRON_SECRET`, `HARVEY_WEBHOOK_SECRET`, `PUBLIC_APP_URL`, `MASTER_USER_EMAIL`, `OFFICE365_SENDER_EMAIL`, `BLOB_READ_WRITE_TOKEN` (`docs/FALTA-IMPLANTAR.md` §2.6) |

### 3.3 Regras de ouro

1. **`CRON_SECRET` é o mesmo nos três arquivos** (`app.env`, `harvey-worker.env`, `cron.env`). Divergência =
   **403 silencioso** no endpoint, sem erro de DNS nem de token.
2. **Nunca substitua uma credencial existente por uma nova.** Valores do tipo Secret na Vercel podem não ser
   recuperáveis; `infra/prospectra/README.md` §2 é explícito.
3. **Segredo nunca vai para o log, para o repositório nem para argumentos de linha de comando.** O caminho
   oficial de entrada é `infra/prospectra/import-env.py`: recebe um JSON por **stdin**, valida nome/valor,
   preserva os campos não fornecidos, faz backup e grava com `600`.
4. **O app não tem `NEXT_PUBLIC_*`** — nada de configuração vaza para o navegador. Para o navegador ver um
   valor novo, é preciso mudar o código.
5. **Trocar chave de IA** tem script próprio (`set-ai-key.sh` na sandbox): ele testa a cadeia
   `principal → fallback`, faz backup do `app.env`, aplica `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL`, reinicia o app
   e prova pelo `/api/cron` + `journalctl | grep '\[ai\]'`.

---

## 4. Deploy

### 4.1 Fluxo de release na VPS (caminho oficial)

> **Onde está o script**: o repositório **não** contém `tools/deploy.sh` — o caminho não existe no `main`
> nem em nenhum outro branch (`git log --all -- tools/` é vazio). O script de release vive na VPS como
> `/usr/local/bin/prospectra-plus-release` (cópia do arquivo `prospectra-plus-release.sh` da sandbox de
> manutenção). O que **é** versionado no repo: `scripts/migrate.mjs`, `scripts/migrate-repair.mjs`,
> `infra/prospectra/**` (systemd, nginx, scripts, backup, import de env) e `docs/FALTA-IMPLANTAR.md`.

O fluxo completo é **build → migração → symlink → validação → rollback**:

```
/usr/local/bin/prospectra-plus-release <commit-sha> [/opt/prospectra-plus]
   │
   ├─ 1. git archive <sha> → /opt/prospectra-plus-release-<sha>
   ├─ 2. pnpm install --frozen-lockfile
   ├─ 3. set -a; . /etc/prospectra-plus/app.env; set +a; node scripts/migrate.mjs
   ├─ 4. pnpm exec next build          ← NÃO "pnpm build"
   ├─ 5. chown -R prospectra-plus; ln -sfn <release> /opt/prospectra-plus-current; systemctl restart
   ├─ 6. curl /api/health (200?) e curl /login (200?)
   └─ 7. se falhar → ln -sfn <release-anterior> current; systemctl restart; exit 1
```

Log: `/var/log/prospectra-plus-release.log` (o script faz `exec >>$LOG 2>&1`).

**Armadilhas já resolvidas — não quebre de novo:**

| Armadilha | Regra |
|---|---|
| `pnpm build` roda `node scripts/migrate.mjs` **de novo** dentro do build (`package.json` → `"build": "node scripts/migrate.mjs && next build"`) | Use **`pnpm exec next build`** na VPS. A migration roda uma vez, no passo 3 |
| `systemctl restart` falhando derrubava o script (`set -e`) antes da validação | O restart tem tolerância a erro (o erro é registrado no log, o script continua) — a validação final decide |
| `/opt/prospectra-plus` sem `.git` | O script aborta: "não é um repositorio git". Faça `git init` + `git remote add origin` |
| `PROSPERTA_DB_REPAIR` ligando a auto-cura sem querer | Só recria quando **as três** tabelas centrais faltam **e** o ledger existe; estado parcial aborta sem apagar nada |
| nginx escutando só em `[::]:80` | Teste local com `http://[::1]/` + `-H "Host: ..."` |

**Antes de publicar (read-only):**

```bash
cd /opt/prospectra-plus && git fetch --all --tags --quiet && git log --oneline -3

# estado atual do serviço e do symlink
systemctl is-active prospectra-plus; readlink -f /opt/prospectra-plus-current

# schema do banco (a migration vai rodar em produção)
node -e "const p=require('postgres');(async()=>{const c=p(process.env.DATABASE_URL);console.log(await c\`select count(*)::int as tabelas from information_schema.tables where table_schema='public'\`);await c.end()})()"
```

**Depois de publicar:**

```bash
systemctl is-active prospectra-plus
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/login
curl -s http://127.0.0.1:3100/api/health | head -c 300; echo
tail -n 40 /var/log/prospectra-plus-release.log
```

> ⚠️ **`/api/health` verde não prova que o app funciona.** O health só faz `select 1` — o incidente de 29/10
> teve health 200 com `/api/cron` em 500. Prove sempre com `/api/cron` + `CRON_SECRET`.

### 4.2 Fluxo Cloudflare Workers (OpenNext)

O app roda em Node (VPS) **e** em Cloudflare Workers com o **mesmo código**; o que muda é a conexão com o banco
(`src/db/index.ts`). Configuração versionada: `open-next.config.ts` + `wrangler.jsonc`.

```
pnpm install --frozen-lockfile
pnpm exec next build                  # 1) build Next.js
pnpm exec opennextjs-cloudflare build # 2) empacota em .open-next/ (worker.js + assets)
pnpm exec wrangler deploy             # 3) publica no Worker "prospectra"
```

| Item | Valor |
|---|---|
| Worker | `prospectra` (conta `60c66733d34a8cc5584b44d799b756f4`) |
| `main` | `.open-next/worker.js` |
| `assets` | `.open-next/assets`, binding `ASSETS` |
| `compatibility_date` | `2026-10-30` |
| `compatibility_flags` | `nodejs_compat`, `global_fetch_strictly_public`, `enable_request_signal` |
| `observability` | habilitada |
| Drivers | `wrangler 4.156.0`, `@opennextjs/cloudflare 1.20.15` |

**Segredos do Worker** (nunca no `wrangler.jsonc`):

```bash
pnpm exec wrangler secret put NEON_DATABASE_URL      # texto plano (secret_text)
pnpm exec wrangler secret put AI_API_KEY
pnpm exec wrangler secret put WA_AKG_API_KEY
pnpm exec wrangler secret put VOICESTUDIO_API_KEY
pnpm exec wrangler secret put HARVEY_WEBHOOK_SECRET
pnpm exec wrangler secret put SUPPORT_WEBHOOK_SECRET
pnpm exec wrangler secret put CRON_SECRET
pnpm exec wrangler secret list                        # só mostra os NOMES
```

**Variante usada na sandbox em 01/11/2026** — sem `wrangler` autenticado, o bundle foi enviado direto pela
API REST (`PUT /accounts/{acc}/workers/scripts/prospectra`): `vars` do `wrangler.jsonc` como bindings
`plain_text`, segredos de um arquivo temporário como `secret_text`, e o arquivo de segredos **apagado no fim**.
Scripts: `cf-publish.mjs` (app) e `cf-publish-bridge.mjs` (bridge do gateway). O resultado é o mesmo formato de
binding do `wrangler deploy`.

**Regras específicas do Worker:**

1. `NEON_DATABASE_URL` é **secret text** (string). O `src/db/index.ts` aceita os dois formatos: string direto
   **ou** um binding Hyperdrive (`.connectionString`).
2. **Não aponte `WA_AKG_BASE_URL` para o próprio host do Worker** — isso cria loop no edge. O valor correto é o
   host do tunnel: `https://wa.argusprime.com.br` (ou o vhost `prospectra.argusprime.com.br/whatsapp-gateway`).
3. `PROSPERTA_DB_REPAIR=0` no Worker: a auto-cura destrutiva de schema **não pode** rodar lá.
4. `AI_BASE_URL` precisa ser o **endpoint completo** (`.../chat/completions`): o `src/lib/ai.ts` faz
   `fetch(provider.endpoint)` direto, sem acrescentar caminho. O `set-ai-key.sh` grava o endpoint completo
   (`https://api.z.ai/api/paas/v4/chat/completions`) na `app.env` da VPS, mas o `wrangler.jsonc` hoje tem
   `https://api.z.ai/api/paas/v4` (sem o sufixo) — **conferir e corrigir antes de publicar no Worker**.
5. O Worker **não tem rota/domínio na zona** até hoje — publicar não é o mesmo que expor. Verifique com
   `wrangler deployments list` e `wrangler tail`.

**Validação do Worker (read-only):**

```bash
pnpm exec wrangler deployments list
pnpm exec wrangler tail --format pretty        # Ctrl-C para sair
curl -s -o /dev/null -w '%{http_code}\n' https://prospectra.atintilio.workers.dev/api/health
```

### 4.3 Fluxo Vercel (histórico / rollback)

`vercel.json` ainda está no repositório:

```json
{ "framework": "nextjs", "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm exec next build", "regions": ["gru1"],
  "crons": [{ "path": "/api/cron", "schedule": "0 10 * * *" }] }
```

- O build da Vercel é `next build` **sem** migration (o `buildCommand` não usa `pnpm build`).
- O cron da Vercel é **diário** (`0 10 * * *`); o heartbeat real é o da VPS, de 5 em 5 minutos. **Não ligue os
  dois** — cron duplicado dispara a cadência duas vezes.
- A Vercel está **fora do caminho de produção** (`docs/guia/03-decisoes-e-expectativas.md` §2) e o
  `VERCEL_TOKEN` disponível só alcança o projeto `reversa-gov-suite` (**outro produto**): qualquer ação na Vercel
  do Prospectra está **bloqueada** até o dono fornecer o token do projeto certo.

### 4.4 Worker da bridge do WhatsApp

| Item | Valor |
|---|---|
| Worker | `prospectra-wa-gateway-bridge` |
| Código | `bridge-gateway-only.js` (variante "só o gateway") e `bridge-app-gateway.js` (variante "app + gateway") |
| Rota | `https://prospectra.argusprime.com.br/whatsapp-gateway/*` → VPS |
| Regra | Só encaminha o prefixo do gateway; **preserva o `Host` público**; sem cache; resolve a VPS pelo host DNS-only para **não dar loop no edge** |

---

## 5. Serviços da VPS

### 5.1 Do Prospectra+

| Unidade systemd | Porta | O que é | Arquivo |
|---|---|---|---|
| `prospectra-plus.service` | 3100 | App Next.js (`next start --hostname 127.0.0.1 --port 3100`) | `infra/prospectra/systemd/prospectra-plus.service` |
| `prospectra-wa-akg.service` | 3101 | Gateway WhatsApp WA-AKG (`tsx src/server/index.ts`) | `infra/prospectra/systemd/prospectra-wa-akg.service` |
| `prospectra-voice.service` | 3900 | Voice Studio (uvicorn, 1 worker) | `infra/prospectra/systemd/prospectra-voice.service` |
| `prospectra-agenda.service` | 3102 | cal.diy legado (**sem vhost público**, desligar só com aval do dono) | `infra/agenda/prospectra-agenda.service` |
| `prospectra-harvey-recovery.service` + `.timer` | — | Batida horária do Harvey (`/api/harvey/tick`) | `infra/prospectra/systemd/prospectra-harvey-recovery.*` |
| `prospectra-plus-cron.service` + `.timer` | — | Alternativa de disparo do `/api/cron` por loopback — **desligada por padrão** | `infra/prospectra/systemd/prospectra-plus-cron.*` |

**Guardas da unit do app** (`ExecStartPre`): `DATABASE_URL` e `CRON_SECRET` precisam existir e
`PUBLIC_APP_URL` precisa ser exatamente `https://prospectra.argusprime.com.br` — se não for, a unit não sobe.
`Restart=on-failure`, `RestartSec=5`.

**Agendadores — escolha um:**

| Agendador | Cadência | Onde | Estado |
|---|---|---|---|
| Cron do sistema | 5 min | `/etc/cron.d/prospectra-tick` → `/usr/local/bin/prospectra-tick` → `https://prospectra.argusprime.com.br/api/cron` | **em uso** |
| Timer systemd | 1 min | `prospectra-plus-cron.timer` (loopback, sem Cloudflare) | desligado |
| GitHub Actions | `*/5 * * * *` | `.github/workflows/tick.yml` | throttle documentado (rede de segurança) |
| Vercel Cron | diário `0 10 * * *` | `vercel.json` | fora do caminho de produção |

> Não habilite dois ao mesmo tempo: a cadência dispara em duplicidade e a agenda/Inteligência rodam duas vezes.

**A armadilha do Cloudflare × Python**: o User-Agent padrão do `urllib` (`Python-urllib/3.x`) é **bloqueado com
HTTP 403** pela Cloudflare. Por isso o `prospectra-harvey-recovery.py` manda `User-Agent: Prospectra-Recovery/1.0`.
Quem chama `http://127.0.0.1:3100` (loopback) não passa pela Cloudflare e não sofre com isso.

### 5.2 Fora de escopo — só mentionar, nunca tocar

| Serviço | Motivo |
|---|---|
| `argus-api` / `argus-app` (CRM Argus) | Outro produto. Nunca parar, reiniciar ou reconfigurar |
| `mariadb`, `postgresql@14-main`, `postfix`, `nginx`, `rsyslog`, `sshd`, `sysstat` | Infraestrutura do host |
| `certbot`, `e2scrub_all` | Cron do host |
| `prospectra-agenda` (cal.diy) | **Decisão pendente do dono** — desligar só com aval |

> Ao confundi nomes: `prospectra-*` é do Prospectra; `argus-*` é do CRM. Antes de qualquer `systemctl`, confira o
> nome — e rode o inventário de `docs/ESCOPO-E-TOCABILIDADE.md` §4 antes de mudar qualquer coisa.

### 5.3 Inventário só-leitura

```bash
systemctl list-units --type=service --state=running --no-pager | grep -E 'prospectra|argus'
ls /etc/nginx/sites-enabled/
ls /etc/cron.d/; crontab -l; systemctl list-timers --no-pager | grep -E 'prospectra|cron'
ls -l /opt
ss -ltnp | grep -E ':(3100|3101|3102|3900|8080)\b'
```

---

## 6. Runbook

### (a) O app caiu

**Sinais:** `https://prospectra.argusprime.com.br/api/health` ≠ 200; 502 do nginx; `systemctl` em `failed`.

```bash
# 1. o serviço está vivo?
systemctl status prospectra-plus --no-pager
journalctl -u prospectra-plus --since '30 min ago' --no-pager | tail -60

# 2. responde localmente?
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/api/health

# 3. o nginx está de pé e o vhost correto?
nginx -t
curl -s -o /dev/null -w '%{http_code}\n' -H "Host: prospectra.argusprime.com.br" "http://[::1]/api/health"
```

| Causa provável | Ação |
|---|---|
| `ExecStartPre` falhou (falta `DATABASE_URL`/`CRON_SECRET`, ou `PUBLIC_APP_URL` diferente do esperado) | `grep -E '^(DATABASE_URL\|CRON_SECRET\|PUBLIC_APP_URL)=' /etc/prospectra-plus/app.env` (só o nome e o prefixo — não imprima o valor do segredo); corrigir e `systemctl restart prospectra-plus` |
| Memória / OOM | `free -h`; `journalctl -u prospectra-plus -k --since '1 h ago' \| grep -i oom` |
| Release quebrada no ar | **Rollback**: `ln -sfn /opt/prospectra-plus-release-<sha-anterior> /opt/prospectra-plus-current && systemctl restart prospectra-plus` (o release script já faz isso sozinho quando a validação falha) |
| Build/compilação corrompida | O `next build` gera `.next/`; `chown -R prospectra-plus:prospectra-plus` na release e `systemctl restart` |

> `Restart=on-failure` já faz o systemd reiniciar sozinho após 5 s. Se ele está em `failed` de vez, o erro
> está no `journalctl` — leia antes de qualquer ação.

### (b) O banco ficou indisponível

**Sinais:** `/api/health` devolve `503` com `{"status":"degraded","database":"error"}`; `/api/cron` devolve 500.

```bash
# 1. o banco responde?
set -a; . /etc/prospectra-plus/app.env; set +a
node -e "const p=require('postgres');(async()=>{const c=p(process.env.DATABASE_URL,{connect_timeout:15});console.log(await c\`select 1 as ok\`);await c.end()})()"

# 2. o schema existe?
node -e "const p=require('postgres');(async()=>{const c=p(process.env.DATABASE_URL,{connect_timeout:15});console.log(await c\`select to_regclass('public.users') as users, to_regclass('drizzle.__drizzle_migrations') as ledger\`);await c.end()})()"
```

| Situação | O que fazer |
|---|---|
| `users` presente, erro de rede/timeout | Problema de conexão com o Neon. Repetir em 1 min; checar se o `DATABASE_URL` do `app.env` continua válido (painel do Neon). **Não** rodar migration |
| `users` **ausente** e ledger presente (o incidente de 29/10) | Rodar `node scripts/migrate.mjs` **depois de um snapshot** (`backup-data.mjs`): a auto-cura recria o schema e reaplica as 26 migrations. Antes, conferir o estado com `decideRepair` — em estado parcial o script **aborta sem apagar nada** |
| `users` ausente e ledger **ausente** | `decideRepair` aborta (não é auto-curável). Inspecione o banco manualmente antes de qualquer `drop schema` |
| Worker no Cloudflare | `PROSPERTA_DB_REPAIR=0` lá — a recriação **não** acontece sozinha. Recrie o schema num deploy controlado do VPS, não no Worker |

> **Não rode `pnpm build` contra o banco de produção sem a inspeção do §2.4.** O `pnpm build` chama a migration,
> e a auto-cura pode derrubar o schema `public`.

### (c) O WhatsApp desconectou

**Sinais:** em `/whatsapp`, estado `disconnected` / `qr_ready`; erro "WA-AKG indisponível ou sem resposta" ou
"Credencial do WA-AKG inválida" (`src/lib/whatsapp/akg.ts`).

```bash
# 1. o gateway está de pé na VPS?
systemctl is-active prospectra-wa-akg
journalctl -u prospectra-wa-akg --since '30 min ago' --no-pager | tail -40

# 2. responde? (401 = no ar, exigindo chave)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/api/sessions
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $WA_AKG_API_KEY" http://127.0.0.1:3101/api/sessions

# 3. o caminho público (vhost ou tunnel) responde?
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $WA_AKG_API_KEY" \
  https://prospectra.argusprime.com.br/whatsapp-gateway/api/sessions
```

| Causa | Sinal | Ação |
|---|---|---|
| Gateway parado | `systemctl is-active` ≠ `active` | `systemctl restart prospectra-wa-akg` (o serviço tem `Restart=on-failure`) |
| `WA_AKG_API_KEY` divergente | 401/403 do gateway | Conferir o valor no `app.env` contra `/opt/prospectra-wa-akg/.env` |
| `WA_AKG_BASE_URL` errado | "Configure a URL HTTPS do WA-AKG sem `/api`" | A URL **não** pode terminar em `/api` nem traer credencial/query |
| Sessão do número perdida | estado `disconnected` / `qr_ready` | **O dono escaneia o QR** na tela `/whatsapp`. O agente não pode parear |
| `WA_AKG_SESSION_ID` mudando | erro de sessão não encontrada | Deve ser **fixo por instalação** (`prospectra-30592258160abd52e895f911450114df631a2bf9`). Sem ele, o id é derivado do `org_id`+`user_id` e **quebra se o banco for recriado** |
| Rota pública do gateway quebrada | 404/502 no `/whatsapp-gateway/api/...` | Conferir o vhost versionado `infra/prospectra/nginx/prospectra.argusprime.com.br.nginx` (allowlist de rotas + `x-api-key`) |

> **Nunca envie mensagem de teste para o número real do dono.** Use um número descartável e avise antes.

### (d) A IA falhou

**Sinais:** no log, `[ai] modelo <x> falhou (<código>)`; erro `AI_UNAVAILABLE_1113`, `AI_UNAVAILABLE_1302`,
`AI_NOT_CONFIGURED`; a tela de Inteligência explica o que está faltando.

Códigos que a cadeia do app entende (`src/lib/ai.ts`):

| Código | Significado | Comportamento |
|---|---|---|
| `1113` | Sem saldo / sem pacote de recursos | **Não é retryable**: o modelo entra em **cooldown de 10 min** e a chamada cai para o próximo da cadeia |
| `1302`, `1305`, `429` | Rate limit | Retryable → próximo modelo |
| `401`, `403`, `400` | Credencial/erro de requisição | Falha na hora, **sem** troca de modelo |
| `TIMEOUT`, `NETWORK` | Timeout de 25 s (OpenRouter) / 45 s (Z.AI) ou rede | Sem troca de modelo |
| `EMPTY_RESPONSE` | Resposta 200 sem conteúdo | Sem troca de modelo |
| `AI_NOT_CONFIGURED` | Falta `AI_API_KEY`/`OPENROUTER_API_KEY` | `aiConfigured()` = `false`; o app continua funcionando sem IA |

**Cadeia de modelos** (`aiModelChain()`, máx. 3 tentativas):
`AI_MODEL` → `AI_FALLBACK_MODELS` (separados por vírgula) → padrão do provedor
(`glm-4.7-flash` → `glm-4.5-flash` na Z.AI; `openrouter/free` no OpenRouter).
O Harvey usa `aiFreeModelChain()` — **só modelo gratuito**, nunca paga.

```bash
# ver as últimas falhas de IA
journalctl -u prospectra-plus --since '1 h ago' --no-pager | grep -E '\[ai\]' | tail -20

# testar a cadeia na prática (sem imprimir a chave)
set -a; . /etc/prospectra-plus/app.env; set +a
node -e "
const base=(process.env.AI_BASE_URL||'').replace(/\/$/,''), key=process.env.AI_API_KEY;
const models=[process.env.AI_MODEL,...(process.env.AI_FALLBACK_MODELS||'').split(',')].filter(Boolean);
(async()=>{for(const m of models){
 const url=base.endsWith('/chat/completions')?base:base+'/chat/completions';
 const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({model:m,messages:[{role:'user',content:'diga ok'}],max_tokens:2048})});
 const b=await r.json().catch(()=>({}));
 console.log(m, r.status, b.error?.code ?? (b.choices?'ok':'sem escolhas'));}})()"
```

| Sintoma | Ação |
|---|---|
| `1113` (sem saldo) | **Só o dono resolve**: recarregar a conta z.ai (<https://z.ai>). Enquanto isso o app usa o modelo gratuito do fallback — não desligue o fallback |
| `1302`/`1305` | Rate limit: esperar. O cooldown de 10 min já evita retry inútil |
| `AI_NOT_CONFIGURED` | Conferir `AI_API_KEY` (ou `OPENROUTER_API_KEY`) no `app.env` e reiniciar o app |
| Falha só no Worker | `AI_BASE_URL`/`AI_MODEL`/`AI_FALLBACK_MODELS` estão em `vars` do `wrangler.jsonc`; a chave é secret. Publicar de novo após corrigir as `vars` |
| A **Inteligência** falhou | O job **completa com heurística** e registra `unavailableFactors` — a IA nunca derruba o job (`src/lib/intelligence/runner.ts`) |

> ⚠️ Trocar de provedor/modelo muda o comportamento do produto. A decisão de provedor é do dono
> (`docs/guia/03-decisoes-e-expectativas.md` §1).

### (e) O tunnel caiu

O tunnel `prospectra-wa-gateway` publica o gateway WA-AKG da VPS em `wa.argusprime.com.br`. **A unit e a config
do `cloudflared` não estão versionadas no repositório** — elas vivem na VPS.

```bash
# 1. o processo do cloudflared está vivo?
systemctl list-units --type=service --all --no-pager | grep -i cloudflared
pgrep -a cloudflared

# 2. o host do tunnel responde?
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $WA_AKG_API_KEY" \
  https://wa.argusprime.com.br/api/sessions

# 3. o gateway local responde? (se sim, o problema é só o tunnel)
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $WA_AKG_API_KEY" http://127.0.0.1:3101/api/sessions

# 4. DNS do host do tunnel
dig +short wa.argusprime.com.br
```

| Sintoma | Interpretação |
|---|---|
| Gateway local OK, host do tunnel não responde | **Tunnel caiu.** Reiniciar o serviço do `cloudflared` na VPS |
| Gateway local e tunnel caídos | Parou o gateway **e** o tunnel — investigar a VPS inteira (`free -h`, `df -h /`) |
| DNS do tunnel não resolve | Problema de DNS na zona `argusprime.com.br` (CNAME do tunnel). Só alterar registro `wa*`/`gw*` — os demais são de outros produtos |
| `WA_AKG_BASE_URL` do Worker aponta para o próprio host do Worker | **Loop no edge.** O valor tem que ser o host do tunnel (`https://wa.argusprime.com.br`) |

> Quando o Worker `prospectra` estiver no ar, o caminho do gateway passa a ser
> `prospectra.argusprime.com.br/whatsapp-gateway` (via vhost ou bridge Worker). Nenhum dos dois pode apontar
> para o próprio host do Worker.

---

## 7. Checklist operacional

### 7.1 Diário (5 minutos)

| # | Verificação | Comando (read-only) | Esperado |
|---|---|---|---|
| 1 | App no ar | `curl -s -o /dev/null -w '%{http_code}\n' https://prospectra.argusprime.com.br/api/health` | `200` |
| 2 | Banco OK | `curl -s https://prospectra.argusprime.com.br/api/health` | `"database":"ok"`, `"status":"ok"` |
| 3 | Cron respondendo (a prova real) | `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $CRON_SECRET" https://prospectra.argusprime.com.br/api/cron` | `200` |
| 4 | Serviços da VPS ativos | `systemctl is-active prospectra-plus prospectra-wa-akg prospectra-voice` | `active` ×3 |
| 5 | Heartbeat do cron rodando | `tail -n 5 /var/log/prospectra-tick.log` | sem erro 403/500 |
| 6 | Gateway do WhatsApp | `curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $WA_AKG_API_KEY" http://127.0.0.1:3101/api/sessions` | `200` |
| 7 | Fila do WhatsApp sem erro | `SELECT state, count(*) FROM whatsapp_commands WHERE created_at > now() - interval '1 day' GROUP BY state;` | `unknown` = 0 (resultado incerto não é reenviado — mas precisa ser investigated) |
| 8 | Sem erro novo no log | `journalctl -u prospectra-plus --since '24 h ago' --no-pager \| grep -iE 'error\|unhandled' \| tail -20` | nada novo |

### 7.2 Semanal

| # | Verificação | Comando / ação |
|---|---|---|
| 1 | Backup do banco | `node /opt/prospectra-plus-current/infra/prospectra/backup-data.mjs` e conferir o JSON em `/var/backups/prospectra-plus/` |
| 2 | Espaço em disco | `df -h / /opt /var` — atenção a `/var/log` e `/var/backups` |
| 3 | Memória e carga | `free -h`; `ps -eo pid,comm,%mem,rss --sort=-rss \| head -12` |
| 4 | Versão no ar × versão no repo | `readlink -f /opt/prospectra-plus-current` vs `git -C /opt/prospectra-plus log --oneline -1` |
| 5 | Segredos alinhados | `CRON_SECRET` igual em `app.env`, `harvey-worker.env`, `cron.env`; `VOICESTUDIO_API_KEY` igual à `OMNIVOICE_API_KEY` |
| 6 | Estado das filas | `intelligence_jobs` (`failed`), `voice_jobs` (`failed`/`unknown`), `harvey_outbox` (`pending` antigo) |
| 7 | Agenda e lembretes | reservas confirmadas com `reminder_sent_at` preenchido; `meetings` com `invite_state='sent'` |
| 8 | Relatórios de exclusão | `deletion_reports` com `notified_at` preenchido (fila de aviso ao proprietário) |
| 9 | Rotas principais (a smoke do Worker) | `worker-smoke.mjs` (rota por rota, com sessão real e banco Neon) |
| 10 | Releases antigas da VPS | `ls -d /opt/prospectra-plus-release-* \| wc -l` — remover antigas **só** depois que a nova estiver validada |
| 11 | Cloudflare (se o Worker estiver publicado) | `wrangler deployments list`; `wrangler secret list` (só nomes) |
| 12 | Revisão do que está pendente | `docs/FALTA-IMPLANTAR.md` §3 (o que falta) e `docs/ESCOPO-E-TOCABILIDADE.md` §5 (histórico de escopo) |

### 7.3 Antes de qualquer deploy

- [ ] `pnpm typecheck` e `pnpm test` verdes
- [ ] `git status` limpo — **nenhuma** migration pendente sem o `.sql` correspondente no `drizzle/`
- [ ] Snapshot do banco feito (`backup-data.mjs`)
- [ ] Schema inspecionado (§2.4) — migration de produção **não** vai recriar schema
- [ ] Diff varrido por segredos (o repositório é público)
- [ ] `nginx -t` OK, se houve mudança de vhost
- [ ] Rollback ensaiado: qual release anterior, qual comando, quanto tempo leva
- [ ] **Sem** cron duplicado (cron.d **ou** timer **ou** Vercel — nunca dois)
- [ ] Autorização do dono para qualquer item fora de escopo

---

## 8. Resumo em 5 linhas

1. **Dados**: 45 tabelas no Neon (44 em `src/db/schema.ts` + `lead_communication_profiles` em SQL cru), 26
   migrações em `drizzle/` aplicadas por `scripts/migrate.mjs`, com auto-cura que só recria o schema quando
   **as três** tabelas centrais faltam **e** o ledger existe (estado parcial aborta sem apagar nada).
2. **Ambiente**: 34 variáveis lidas do servidor, **nenhuma** `NEXT_PUBLIC_*` no app — segredos vivem em
   `/etc/prospectra-plus/app.env` (600), nos secrets do Worker `prospectra` e no painel da Vercel, e
   `CRON_SECRET` precisa ser **igual** em três arquivos da VPS.
3. **Deploy**: na VPS, `prospectra-plus-release <sha>` faz extrair → `pnpm install` → **migração** →
   `pnpm exec next build` → **symlink** → validação (`/api/health` + `/login`) → **rollback automático**; no
   Cloudflare, `next build` → `opennextjs-cloudflare build` → `wrangler deploy`.
4. **Serviços**: `prospectra-plus` (3100), `prospectra-wa-akg` (3101), `prospectra-agenda`/cal.diy (3102, legado,
   desligar só com aval) e `prospectra-voice` (3900) são do Prospectra; `argus-api`/`argus-app` são do CRM e
   ficam **fora de escopo**.
5. **Operação**: o runbook cobre app caído, banco indisponível, WhatsApp desconectado, IA sem saldo/rate limit e
   tunnel do WhatsApp caído — e a prova de que o app funciona de verdade é `/api/cron` com `CRON_SECRET`, não o
   `/api/health`.

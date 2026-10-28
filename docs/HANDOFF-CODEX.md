# Handoff para o Codex — estado e orientações de deploy (Prospectra+)

Atualizado em 27/10/2026. Objetivo: você (Codex) continuar o deploy sem refazer o que já existe.
**Regra de ouro do proprietário:** gravar só incrementos validados; nunca descrever teste simulado como função real; não apagar banco Neon / CRM / serviços; nada de serviço pago obrigatório (sem Twilio/Unipile/API paga); toda string via i18n se aplicável; começar sempre de `origin/main` fresco.

## 1. O que está NO AR (produção)
- **Prospectra+ (web)** na Vercel: `https://prospectra.argusprime.com.br` — `/login` e `/api/health` = 200. Projeto Vercel `prospectra`, team `atintilio-5084` / `team_FtOe2aGUEBCClp33AUX3fjb2`.
- **`main`** = `4f6e0b26` (PRs #27/#28/#29 já integrados: Harvey, perfil de comunicação, módulos WhatsApp/voz).
- **WA-AKG (gateway WhatsApp)** rodando na VPS da França (`vps1euro`), atrás de auth, em `crm.argusprime.com.br/prospectra-whatsapp`.

## 2. PRs ABERTOS — revisar e mergear NESTA ORDEM (nada foi mergeado)
1. **#31** `feat/agendamento-reunioes` → main — agendamento estruturado: tabela `meetings` (migração 0009, aditiva), `src/lib/scheduling.ts` (ICS, slots, requestMeeting/confirmMeeting/cancelMeeting), hook no `handoff` do Harvey. 6 testes.
2. **#33** `feat/agendamento-ui` → base #31 — tela na Fila para o vendedor confirmar/cancelar reuniões (`confirmMeetingAction`/`cancelMeetingAction` + seção "Reuniões").
3. **#32** `feat/linkedin-automatico` → base #31 — execução automática de LinkedIn **gated** (off por padrão via `LINKEDIN_AUTOMATION_ENABLED`): tabela `linkedin_dispatches` (0010), `src/lib/linkedin/automation.ts` (`runLinkedinQueue`, executor plugável, sem retry em incerto). 4 testes.
- **#30** `chore/deploy-helpers` → main — script de instalação do Helpin standalone + status. **OBSOLETO** pela decisão da seção 4 (Helpin será nativo, não standalone); pode fechar sem merge.
- Suíte local: **89 testes verdes**, typecheck limpo. Único check do repo é o preview da Vercel.
- Cuidado de migração: o snapshot do drizzle estava dessincronizado; ao gerar migração, **reduza o SQL para só a tabela nova** (o runtime usa só o `.sql` + `_journal.json`). As 0009/0010 já foram reduzidas assim.

## 3. Para ficar FUNCIONAL ponta a ponta (ações do proprietário / infra)
- **Vercel (precisa reautorizar acesso da integração ao team):** definir, sem apagar as existentes:
  - Agendamento: `MEETING_SCHEDULER_URL` (link de calendário; e-mail usa Office 365 já configurado). **Com isso o agendamento funciona end-to-end sem VPS.**
  - WhatsApp: `WA_AKG_BASE_URL`, `WA_AKG_API_KEY` (de `/etc/prospectra-wa-akg/integration.env` na VPS, root).
  - Voz: `VOICESTUDIO_BASE_URL`, `VOICESTUDIO_API_KEY`, `VOICESTUDIO_ENGINE` (de `/etc/prospectra-voice/integration.env`).
  - Só depois de validar: `VOICE_AUTOMATION_ENABLED=true`, `LINKEDIN_AUTOMATION_ENABLED=true`.
- **VPS (`VPS-905340.ssh.vps1euro.fr`):** SSH estava com timeout; só o console web do provedor funcionava. Proprietário fez upgrade de RAM.
  - Voz: instalar/validar motor PT-BR (candidato MOSS-TTS-Nano; **OmniVoice é não-comercial, não usar**), subir `voice-worker` (`pnpm build:voice-worker && pnpm start:voice-worker`), validar geração + envio Ogg/Opus.
  - WhatsApp: parear número real e validar envio/recebimento.
- **LinkedIn automático:** o worker `runLinkedinQueue` existe mas **não há executor** e não é chamado por nada. Para funcionar precisa: (a) um `LinkedInExecutor` real (agente de navegador na VM — ver PR #9), (b) um worker/cron chamando `runLinkedinQueue`, (c) ligar o flag. Sem isso, continua assistido. **Risco de ToS/ban do LinkedIn** — decisão do proprietário.

## 4. HELPIN — decisão nova do proprietário (NÃO instalar standalone)
O Helpin **não** terá DNS próprio nem rodará como stack ao lado. Será **fundido nativamente** no Prospectra+ (Next.js/Neon, no Vercel), **reimplementando** as capacidades — **não copiar código** (Helpin é **AGPL-3.0**; copiar contamina o produto comercial). Decisões do proprietário:
- Módulos: **chat + inbox de suporte primeiro**, depois **tudo** (central de ajuda, docs, projetos).
- CRM: **mesclar os dois** (trazer contatos/campos do CRM do Helpin para o modelo do Prospectra+, preservando leads/cadências/Harvey atuais).
- Participantes do chat: **os dois** (cliente do parceiro ↔ equipe **e** usuário do Prospectra+ ↔ suporte Argus).
- Canal de entrada: **ambos** — widget web (origin-allowlisted) **e** WhatsApp (reusar WA-AKG).
- Realtime no Vercel: começar com **polling/SSE** (serverless não segura websocket longo); upgrade depois.

Sequência sugerida (1 PR nativo por item, revisado, sem merge sem ok):
1. Inbox + conversas (tabelas `support_conversations`/`support_messages` ligadas a `leads`) + responder (server action), com testes.
2. Entrada: widget web (rota pública origin-allowlisted) + ingestão de WhatsApp via WA-AKG na mesma inbox.
3. Central de ajuda (artigos + busca pgvector no Neon).
4. Merge do CRM (contatos/campos do Helpin no modelo).
5. Docs / Projetos.

## 5. O que o Codex deve fazer AGORA (ordem)
1. Revisar e mergear #31 → #33 → #32 (fechar #30). Após cada merge em `main`, acompanhar o build/preview da Vercel até verde.
2. Reautorizar a integração Vercel e setar as env vars da seção 3 (sem apagar as atuais). Deploy. Confirmar `MEETING_SCHEDULER_URL` → agendamento ponta a ponta.
3. Na VPS (com a RAM nova): validar/instalar motor de voz e worker; parear WhatsApp; só então ligar os flags.
4. Iniciar o programa Helpin nativo pela seção 4, incremento 1.

## 6. Convenções técnicas
- Node 22+, pnpm 10.25, Next 16, Drizzle + Postgres (Neon) / PGlite em teste.
- Testes: `pnpm test` (vitest, PGlite migra de `drizzle/`). Rodar targeted ao iterar; suíte completa antes de subir. `pnpm run typecheck`.
- Migração nova: adicionar tabela em `src/db/schema.ts`, `pnpm db:generate`, **reduzir o `.sql` gerado para só o novo** (o generate incha por drift de snapshot), manter a entrada em `drizzle/meta/_journal.json`.
- Começar toda branch de `origin/main` fresco; `main` exige branch atualizada antes do merge.

# Handoff Codex — Prospectra+ (estado + próximos passos)

> Regra do dono: **commit direto no `main`, sem branch/PR**. Antes de cada push:
> `pnpm run typecheck` + `pnpm vitest run` verdes. Cada push publica na Vercel
> (sem trava de CI) — produção: `prospectra.argusprime.com.br`. Enums de passo/evento
> são `text` (sem migração ao adicionar valor). Migrações: editar schema → `pnpm db:generate`.

> **Atualizado em 30/10/2026** — Helpin fase 6 entregue (schema + atributos + SLA + horário +
> auto-resposta + CSAT + relatórios + webhooks + auditoria). Ver "O que entrou nesta entrega".
> **Agenda nativa entregue no mesmo dia** (o cal.com saiu de cena) — ver "Entrega de 30/10 (noite)".

## Já no `main` / produção (não refazer)
- App, login, CRM/leads, **importação de leads** (CSV/URLs), cadência assistida (Fila do dia).
- IA de texto **Z.AI/GLM**. **DISC** (inferência + **em massa** no cron).
- **Campanha multicanal**: passos react/comment/invite/message (LinkedIn), **email**, **whatsapp**, **voz**, **imagem/informativo**, **ligação assistida**; **flow builder arrastável**.
- **LinkedIn automático**: executor HTTP (`src/lib/linkedin/http-executor.ts`) + chamada no cron (gated) + **worker VPS** (`infra/linkedin/`). Hoje roda **assistido** até ligar a infra.
- **Voz**: `queueVoiceDelivery` + `scripts/voice-worker.ts` (drena fila, gera no Voice Studio, envia pelo AKG, conclui a ação).
- **Heartbeat** do cron: `.github/workflows/tick.yml` (chama `/api/cron` a cada 5 min).
- **Helpin nativo**: inbox (web+WhatsApp+interno), 2 públicos (customer/product), central de ajuda, merge de CRM, **etiquetas**, **notas internas + @menções** (nunca vazam pro cliente), **times de atendimento** (rotear + visibilidade por time). Papéis: owner/manager/sdr/closer.
- **Helpin fase 6 (30/10)**: atributos personalizados, SLA, horário + auto-resposta, CSAT, relatórios, webhooks e auditoria — detalhes abaixo.

## O que entrou nesta entrega (30/10/2026)

**Schema** — `drizzle/0021_helpin_fase6_sla_atributos.sql` (aditiva ✅): `leads.attributes` (jsonb),
`lead_attribute_defs`, `support_sla_policies`, `support_schedules`, `support_prechat_forms`,
`automation_rules`, `audit_log`, `webhook_endpoints` + colunas em `support_conversations`
(`sla_due_at`, `resolved_at`, `auto_replied`, `csat_rating`, `csat_comment`, `csat_sent_at`).

**Módulos** (`src/lib/`): `lead-attributes.ts`, `support-sla.ts`, `support-schedule.ts`,
`support-csat.ts`, `support-reports.ts`, `audit.ts`, `webhooks.ts`.

**APIs**: `/api/leads/attributes` (+`/[id]`), `/api/support/sla`, `/api/support/schedule`,
`/api/support/csat`, `/api/support/reports`, `/api/support/audit`, `/api/support/webhooks` (+`/[id]`).

**Telas** (pt-BR, responsivas): `/atendimento` (SLA, horário, auto-resposta, webhooks, auditoria),
`/relatorios` (volume, 1ª resposta, SLA, resolução, CSAT, agentes, times), `/leads/atributos`.
Entradas no menu lateral ✅.

**Wiring no fluxo real** (`src/lib/support.ts`): conversa nova ganha `sla_due_at` ✅; fora do horário
a auto-resposta entra como mensagem de sistema ✅ e marca `auto_replied` ✅; fechar a conversa grava
`resolved_at` ✅; responder/fechar disparam webhook ✅ e trilha de auditoria ✅.

**Assinatura de webhook**: `X-Prospectra-Event` + `X-Prospectra-Signature: t=<ts>,v1=<hmac-sha256>`
(HMAC de `<timestamp>.<corpo>` com o segredo do endpoint ✅). Só `https` (ou `http://localhost`) ✅.

**Testes**: `tests/helpin-fase6.test.ts` — 21 casos ✅ (horário, SLA, webhooks, persistência ✅).

## Entrega de 30/10 (tarde) — voz, agenda e LinkedIn

**Voz (`/voz`)** — página nova para clonar a própria voz ✅:
- `VoiceStudioGateway.transcribe()` ✅ (novo, em `src/lib/voice/voicestudio.ts` ✅): manda a
  gravação ao `POST /transcribe` ✅ do Voice Studio ✅ e devolve o texto ✅ — o MOSS-TTS-Nano
  exige o texto exato do áudio ✅, sem isso o clone sai torto ✅.
- O formulário ✅ fica em `src/app/(app)/voz/` ✅ com o botão **"Transcrever automaticamente"** ✅.
- O perfil ✅ é vinculado **só à conta do usuário** ✅ (`voice_profiles` ✅, chave org+user ✅) ✅.
- `registerVoiceAction` (WhatsApp) ✅ continua válido ✅ — a página nova é o caminho descobrível ✅.

**Agenda (cal.diy)** — ⚠️ **SUBSTITUÍDO pela agenda nativa** (entrega de 30/10, noite).
O bloco abaixo descreve o estado antigo; o que vale agora está em "Entrega de 30/10 (noite)":
- `src/lib/agenda.ts` ✅: `agendaStatus()` ✅ (sonda `POST /api/auth/setup` ✅ com corpo vazio ✅ —
  400 = já tem admin ✅, 422 = ainda não tem ✅) ✅ e `createAgendaAdmin()` ✅ ✅.
- `AgendaSetupCard` ✅ aparece no **Painel** (primeiro acesso ✅) ✅ e em **/admin** ✅ ✅.
- O nginx ✅ libera `/api/auth/setup` **apenas para o loopback** ✅ (`allow 127.0.0.1; allow ::1; deny all;` ✅) ✅
  — publicamente continua 403 ✅ ✅. O Prospectra (na mesma máquina) ✅ cria o admin ✅ ✅.
- **Estado real**: a agenda **já tem** admin ✅ (`atintilio` ✅, criado em 29/10 ✅) ✅.

**LinkedIn** — automático ligado no backend ✅, liberado por operação ✅:
- `orgs.linkedin_enabled` ✅ (migration `0022` ✅ ✅) ✅ + toggle em `/admin` ✅ ✅.
- `LINKEDIN_AUTOMATION_ENABLED=true` ✅ no backend ✅ (VPS ✅ e Vercel ✅ ✅) ✅ — o interruptor geral ✅ ✅.
- A fila só despacha para operações com o flag ligado ✅ (`runLinkedinQueue` ✅ filtra por
  `orgs.linkedin_enabled` ✅ ✅) ✅ — o interruptor geral **e** o por operação ✅ ✅.

## Entrega de 30/10 (noite) — **agenda nativa** (o cal.com saiu de cena)

A agenda deixou de ser um app separado e virou **um módulo dentro do Prospectra**: mesmo banco
(Neon), mesma sessão, mesma operação, lead vinculado à reserva. Documentação completa em
**`docs/AGEND-NATIVA.md`**.

**Schema** — `drizzle/0023_agenda_nativa.sql` ✅: `agenda_event_types`, `agenda_availability`,
`agenda_blackouts`, `agenda_links` + colunas novas em `meetings` (`event_type_id`, `link_id`,
`attendee_name/email/phone`, `end_time`, `timezone`, `location`, `cancel_token`, `notes`,
`confirmed_at`, `cancelled_at`, `reminder_sent_at`); `meetings.lead_id` ficou **nullable** e
`source` ganhou `'agenda'`. Dois índices novos: `meetings_no_double_booking`
(`org_id,user_id,scheduled_at` quando `status IN ('requested','confirmed')`) e
`meetings_one_open_per_lead`.

**Módulos** (`src/lib/`):
- `agenda-slots.ts` ✅ — cálculo dos horários livres, **puro** (sem banco, sem `date-fns`/`luxon`:
  fuso resolvido com `Intl.DateTimeFormat(..., { timeZone }).formatToParts`). Respeita
  antecedência, janelas semanais, bloqueios, reservas existentes e **buffer** entre reuniões.
- `agenda-booking.ts` ✅ — tipos de reunião, disponibilidade, **links rastreados**, reservas
  públicas e cancelamento. `bookPublic` **recalcula** a grade no servidor (nunca confia no
  horário do navegador) e o índice unique barra reserva dupla.
- `agenda.ts` ✅ — reexporta os dois acima; as funções do cal.diy (`agendaStatus`,
  `createAgendaAdmin`) foram removidas ✅.

**APIs** (`src/app/api/agenda/**`, todas JSON, entrada validada com `zod`):
- públicas (sem sessão): `GET /event`, `GET /slots`, `POST /book`, `POST /cancel`;
- internas (sessão, `orgId` **nunca** do cliente): `GET|POST /event-types`,
  `PATCH /event-types/[id]`, `POST /event-types/[id]/availability`, `GET /bookings`,
  `POST /links`.

**Telas** (pt-BR, responsivas): `/agenda` (tipos de reunião, disponibilidade, gerar link,
próximas reservas, confirmar/cancelar), `/agendamento/[slug]` (grade pública + reserva),
`/agendamento/cancelar` (cancelamento por token), `/agendamento` (entrada do domínio).
Item **"Agenda"** no menu lateral ✅ e card "Agenda" no Painel/Admin ✅ (substituindo o card
do cal.diy).

**Infra** ✅: vhost novo versionado em `infra/prospectra/nginx/agenda.argusprime.com.br.nginx`
e **aplicado na VPS em 30/10** — `agenda.argusprime.com.br` passou a servir
`127.0.0.1:3100` (o app) em vez de `127.0.0.1:3102` (cal.com). `nginx -t` passou sem warning;
o vhost antigo ficou **preservado** em `/etc/nginx/sites-available/prospectra-agenda` (rollback
em um comando, documentado). O serviço `prospectra-agenda` (cal.com) **continua rodando** —
perdeu só o vhost público — e o banco dele está **vazio** (0 evento, 0 reserva).

**Variáveis**: `AGENDA_PUBLIC_URL` ✅ em uso (`https://agenda.argusprime.com.br`).
`AGENDA_BASE_URL` (endereço interno do cal.com) ficou **obsoleta** — nada mais lê; pode ser
removida do `/etc/prospectra-plus/app.env` depois de publicar a release.

**Testes**: `tests/agenda-slots.test.ts` ✅ e `tests/agenda-booking.test.ts` ✅.

> ⚠️ **Falta publicar a release** — a release que está na VPS é a `a84c904` (sem as rotas da
> agenda), então `/agenda` e `/agendamento/*` respondem **404** até você publicar o `main`.


## Próximos passos — CÓDIGO (Codex)
Expansão do Helpin, na ordem. Cada tela nova **responsiva no mobile**.

**Fase A:**
- [x] Atributos personalizados do contato/lead (campos custom por operação) — **entregue 30/10** ✅.
- [ ] Mostrar/editar os atributos no **detalhe do lead** (a lib `mergeLeadAttributes` já grava em
      `leads.attributes`; falta a tela que consome ✅) e exportar CSV com as colunas extras ✅.

**Fase B — atendimento:**
- [x] Horário de atendimento + **autorresposta** — **entregue 30/10** ✅ (fora do horário entra a
      auto-resposta ✅; "dentro do horário, a IA responde pela base de conhecimento" **ainda falta** ✅).
- [x] SLA / prazos de resposta no fluxo — **entregue 30/10** ✅ (prazo na criação da conversa ✅,
      relatório de cumprimento ✅; falta **avisar o agente antes do estouro** ✅).
- [ ] Formulário pré-chat — a **tabela** `support_prechat_forms` existe ✅ e o widget já captura
      nome/e-mail ✅; falta a tela de configuração e o widget renderizar os campos ✅.
- [x] CSAT (pesquisa de satisfação ao fim da conversa) — **entregue 30/10** ✅ (widget pergunta ✅,
      API pública ✅, resumo ✅, entra no relatório ✅).

**Fase C — inteligência:**
- [ ] Automação: regras/gatilhos + roteamento + respostas por condição. A tabela `automation_rules`
      existe ✅ e os gatilhos previstos são `conversation_created`, `conversation_replied`,
      `sla_breached`, `conversation_closed`, `csat_received` ✅ — falta o **motor** ✅.
- [ ] Chatbot / IA auto-resolver usando a base de conhecimento (fundir com o fluxo do Helpin).

**Fase D — alcance/visão:**
- [ ] Canal de **e-mail** no Helpin (receber/responder e-mail na inbox).
- [x] Relatórios/analytics (agente, CSAT, volume, SLA) — **entregue 30/10** ✅.
- [x] Webhooks / audit log — **entregue 30/10** ✅ (5 eventos ✅ + trilha de auditoria ✅).

**Fora de escopo (decisão do dono):** respostas rápidas (canned); Instagram/Facebook/Telegram; ligação **automática** por WhatsApp (gateway não disca; discagem automática é robocall — manter **assistida**).

## Próximos passos — INFRA (dono/VPS; não é código)
O que falta pra ficar **100% operacional** (o que já está no ar está marcado ✅):
1. **WhatsApp**: WA-AKG no ar ✅ (`https://crm.argusprime.com.br/prospectra-whatsapp` ✅, envs na Vercel ✅) — falta **parear o número** escaneando o QR na tela **WhatsApp** do app ✅ → liga Harvey + WhatsApp/voz/imagem ✅.
2. **Voz**: Voice Studio no ar ✅ (`https://voice.argusprime.com.br` ✅, 401 sem chave ✅, 200 com chave ✅, motor MOSS-TTS-Nano ✅) — falta `VOICE_AUTOMATION_ENABLED=true` depois da **validação à mão** ✅ e o profile de voz com **referência PT-BR** ✅ (hoje é a demo em inglês ✅).
3. **LinkedIn automático**: `infra/linkedin` pronto na VPS ✅ — falta `LINKEDIN_AUTOMATION_ENABLED=true` + `LINKEDIN_WORKER_URL/KEY` ✅ (decisão do dono, risco de termos de uso ✅) e **revalidar os seletores** no site vivo ✅.
4. **Agendamento**: **agenda nativa** ✅ — o domínio `https://agenda.argusprime.com.br` já serve o app do Prospectra ✅ (vhost trocado em 30/10 ✅, cal.com sem vhost público ✅). Falta: **publicar a release** ✅ (as rotas `/agenda` e `/agendamento/*` só existem depois disso ✅), criar o **primeiro tipo de reunião** ✅ e gerar o link ✅, e apontar `MEETING_SCHEDULER_URL` ✅ na Vercel para a página do tipo de reunião ✅. Passo a passo em `docs/AGEND-NATIVA.md` §4 ✅.
5. **Cal.com — desligar depois de validar**: serviço `prospectra-agenda` ainda ativo em `127.0.0.1:3102` ✅ (banco vazio: 0 evento, 0 reserva ✅). Após validar a agenda nativa: `systemctl disable --now prospectra-agenda` + remover `AGENDA_BASE_URL` do `app.env` + `systemctl restart prospectra-plus` ✅. Detalhes e rollback em `docs/AGEND-NATIVA.md` §5 ✅.
6. **Heartbeat**: rodando na VPS ✅ (cron de 5 min ✅, `/api/cron` 200 ✅) — o secret no GitHub é opcional ✅ (o schedule do GitHub é throttled a 1×/dia ✅).
7. **Domínio**: o swap do domínio principal da Vercel para a implantação nativa na VPS ✅ já está feito ✅ (`prospectra.argusprime.com.br` ✅ na VPS ✅). Falta validar Microsoft 365 e saldo do Z.AI ✅. O WA-AKG mora **dentro** do vhost `argus-crm` ✅ — mover para um vhost próprio **antes** de qualquer re-deploy do CRM ✅.
8. **Auto-cura da migration**: `scripts/migrate-repair.mjs` só recria o schema quando as 3 tabelas
   centrais faltam **e** o ledger do drizzle existe ✅; desliga com `PROSPERTA_DB_REPAIR=0` ✅.

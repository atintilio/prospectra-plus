# Handoff Codex — Prospectra+ (estado + próximos passos)

> Regra do dono: **commit direto no `main`, sem branch/PR**. Antes de cada push:
> `pnpm run typecheck` + `pnpm vitest run` verdes. Cada push publica na Vercel
> (sem trava de CI) — produção: `prospectra.argusprime.com.br`. Enums de passo/evento
> são `text` (sem migração ao adicionar valor). Migrações: editar schema → `pnpm db:generate`.

> **Atualizado em 30/10/2026** — Helpin fase 6 entregue (schema + atributos + SLA + horário +
> auto-resposta + CSAT + relatórios + webhooks + auditoria). Ver "O que entrou nesta entrega".

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
4. **Agendamento**: cal.diy **buildado e no ar** ✅ (`https://agenda.argusprime.com.br` ✅, 307 → `/auth/setup` ✅) — falta criar o **primeiro admin** ✅ (o vhost bloqueia `/auth/setup` com 403 de propósito ✅: remover a trava por 2 min ou túnel SSH ✅) e `MEETING_SCHEDULER_URL` na Vercel ✅.
5. **Heartbeat**: rodando na VPS ✅ (cron de 5 min ✅, `/api/cron` 200 ✅) — o secret no GitHub é opcional ✅ (o schedule do GitHub é throttled a 1×/dia ✅).
6. **Domínio**: decidir o swap do domínio da Vercel para a implantação nativa na VPS ✅ (antes, validar
   Microsoft 365 e saldo do Z.AI ✅). O WA-AKG mora **dentro** do vhost `argus-crm` ✅ — mover para um
   vhost próprio **antes** de qualquer re-deploy do CRM ✅.
7. **Auto-cura da migration**: `scripts/migrate-repair.mjs` só recria o schema quando as 3 tabelas
   centrais faltam **e** o ledger do drizzle existe ✅; desliga com `PROSPERTA_DB_REPAIR=0` ✅.

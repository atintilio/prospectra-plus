# Handoff Codex — Prospectra+ (estado + próximos passos)

> Regra do dono: **commit direto no `main`, sem branch/PR**. Antes de cada push:
> `pnpm run typecheck` + `pnpm vitest run` verdes. Cada push publica na Vercel
> (sem trava de CI) — produção: `prospectra.argusprime.com.br`. Enums de passo/evento
> são `text` (sem migração ao adicionar valor). Migrações: editar schema → `pnpm db:generate`.

## Já no `main` / produção (não refazer)
- App, login, CRM/leads, **importação de leads** (CSV/URLs), cadência assistida (Fila do dia).
- IA de texto **Z.AI/GLM**. **DISC** (inferência + **em massa** no cron).
- **Campanha multicanal**: passos react/comment/invite/message (LinkedIn), **email**, **whatsapp**, **voz**, **imagem/informativo**, **ligação assistida**; **flow builder arrastável**.
- **LinkedIn automático**: executor HTTP (`src/lib/linkedin/http-executor.ts`) + chamada no cron (gated) + **worker VPS** (`infra/linkedin/`). Hoje roda **assistido** até ligar a infra.
- **Voz**: `queueVoiceDelivery` + `scripts/voice-worker.ts` (drena fila, gera no Voice Studio, envia pelo AKG, conclui a ação).
- **Heartbeat** do cron: `.github/workflows/tick.yml` (chama `/api/cron` a cada 5 min).
- **Helpin nativo**: inbox (web+WhatsApp+interno), 2 públicos (customer/product), central de ajuda, merge de CRM, **etiquetas**, **notas internas + @menções** (nunca vazam pro cliente), **times de atendimento** (rotear + visibilidade por time). Papéis: owner/manager/sdr/closer.

## Próximos passos — CÓDIGO (Codex)
Expansão do Helpin, na ordem. Cada tela nova **responsiva no mobile**.

**Fase A (falta 1):**
- [ ] Atributos personalizados do contato/lead (campos custom por operação).

**Fase B — atendimento:**
- [ ] Horário de atendimento + **autorresposta** (dentro do horário, se a IA responder pela base de conhecimento, resolve; senão, responde no próximo dia útil).
- [ ] SLA / prazos de resposta no fluxo.
- [ ] Formulário pré-chat (reaproveitar o widget atual: hoje já captura nome/e-mail).
- [ ] CSAT (pesquisa de satisfação ao fim da conversa).

**Fase C — inteligência:**
- [ ] Automação: regras/gatilhos + roteamento + respostas por condição.
- [ ] Chatbot / IA auto-resolver usando a base de conhecimento (fundir com o fluxo do Helpin).

**Fase D — alcance/visão:**
- [ ] Canal de **e-mail** no Helpin (receber/responder e-mail na inbox).
- [ ] Relatórios/analytics (agente, CSAT, volume, SLA).
- [ ] Webhooks / audit log.

**Fora de escopo (decisão do dono):** respostas rápidas (canned); Instagram/Facebook/Telegram; ligação **automática** por WhatsApp (gateway não disca; discagem automática é robocall — manter **assistida**).

## Próximos passos — INFRA (dono/VPS; não é código)
Isso é o que falta pra ficar **100% operacional**:
1. **WhatsApp**: subir o WA-AKG na VPS (`infra/wa-akg`) + na Vercel `WA_AKG_BASE_URL` (HTTPS, sem `/api`) e `WA_AKG_API_KEY`; **parear o número** escaneando o QR na tela **WhatsApp** do app. → liga Harvey + WhatsApp/voz/imagem.
2. **Voz**: subir o engine do Voice Studio na VPS + `VOICESTUDIO_BASE_URL/API_KEY/ENGINE` + `VOICE_AUTOMATION_ENABLED=true`; rodar `pnpm build:voice-worker && pnpm start:voice-worker` (systemd). → liga voz.
3. **LinkedIn automático**: rodar `infra/linkedin` na VPS com `LI_AT` + `PROXY_URL`; na Vercel `LINKEDIN_AUTOMATION_ENABLED=true` + `LINKEDIN_WORKER_URL` + `LINKEDIN_WORKER_KEY`; **revalidar os seletores** do LinkedIn no site vivo.
4. **Agendamento**: cal.diy no ar em `agenda.argusprime.com.br` + `MEETING_SCHEDULER_URL` na Vercel.
5. **Heartbeat**: secret `CRON_SECRET` no GitHub (= o da Vercel) → cadência/DISC/voz/LinkedIn giram a cada 5 min.

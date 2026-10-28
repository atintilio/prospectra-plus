# Handoff para o Codex — Prospectra+ (LinkedIn automático, Agendamento, Harvey, Helpin)

> Estado base: `main` com PRs #40 (Z.AI/GLM), #41 (DISC automático), #42 (stack consolidada)
> mergeados. PR **#43** (campanha multicanal e-mail + WhatsApp) aberto — assuma-o
> mergeado. App no ar na Vercel: `prospectra.argusprime.com.br`.
>
> Regras do projeto (valem para o Codex): mudança mínima e correta; nada de serviço
> pago obrigatório ligado sozinho; local-first; segredos nunca no código (só env na
> Vercel/VPS); teste que falha-antes/passa-depois; não inventar delays nem limites —
> reusar os limites por usuário (`users.dailyInvites`, `users.dailyMessages`).
> Não mergear sem revisão. O dono merga no GitHub.

---

## 0. Mapa dos encaixes que já existem (NÃO reescrever)

| Área | Arquivo | O que já faz |
|---|---|---|
| Cadência multicanal | `src/lib/cadence.ts` → `runScheduler` | gera ações; **auto-envia** e-mail (`sendSupportMail`) e WhatsApp (`sendWhatsAppCommand`); incerto fica pendente, sem reenvio |
| LinkedIn automático (base) | `src/lib/linkedin/automation.ts` | `runLinkedinQueue`, `LinkedInExecutor`, `LinkedInWorkItem`, `linkedinAutomationEnabled` — **pronto, mas nunca é chamado** |
| Recibo/idempotência LinkedIn | tabela `linkedin_dispatches` | claim único por ação; não duplica |
| WhatsApp gateway | `src/lib/whatsapp/akg.ts` → `AkgGateway`, `akgConfig`, `status/connect/qr` | envia texto, consulta sessão, QR de pareamento |
| WhatsApp envio idempotente | `src/lib/whatsapp/commands.ts` → `sendWhatsAppCommand` | recibo durável + limite diário |
| Harvey | `src/lib/harvey-operations.ts`, `src/lib/harvey.ts` | perfil, aprovação, outbox, inbound, fila, handoff, opt-out |
| Harvey rotas | `src/app/api/harvey/inbound`, `/tick` | webhook + tick |
| Agendamento | `src/lib/scheduling.ts` | `requestMeeting`, `confirmMeeting`, `cancelMeeting`, `buildIcs`, `nextBusinessSlots`, `meetingSchedulerLink` |
| Suporte/Helpin | `src/lib/support.ts`, `src/app/api/support/{widget,whatsapp}`, página `suporte` | widget web + canal WhatsApp de suporte |
| Cron | `src/app/api/cron/route.ts` | roda `runScheduler` + `runHarveyQueue` (protegido por `CRON_SECRET`) |

Envs já usadas no código: `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `DATABASE_URL`/`POSTGRES_URL`,
`CRON_SECRET`, `HARVEY_WEBHOOK_SECRET`, `SUPPORT_WEBHOOK_SECRET`, `MEETING_SCHEDULER_URL`,
`WA_AKG_BASE_URL`, `WA_AKG_API_KEY`, `VOICESTUDIO_*`, `VOICE_AUTOMATION_ENABLED`,
`LINKEDIN_AUTOMATION_ENABLED`, `PUBLIC_APP_URL`, `BLOB_READ_WRITE_TOKEN`, `MASTER_USER_EMAIL`.

---

## 1. LinkedIn automático (caminho não oficial) — a construir

### Decisão de arquitetura (reusar o que existe)
A Vercel é serverless e **não roda navegador headless persistente**. A execução headless
(cookie `li_at` 24/7 + proxy residencial) **mora na VPS**. Mas toda a lógica de fila,
limites diários, claim idempotente e avanço da cadência **já está pronta** em
`runLinkedinQueue`. Então **não** reescreva a fila na VPS. Em vez disso:

1. Implemente um `LinkedInExecutor` que é um **cliente HTTP** para um worker na VPS.
   `dispatch(item)` faz `POST /linkedin/dispatch` com o `LinkedInWorkItem` e devolve
   `{ state: 'sent' | 'unknown', providerId? }`.
2. **Chame `runLinkedinQueue`** no cron (hoje ele não é chamado em lugar nenhum).
3. O worker da VPS recebe **um item por vez**, executa no navegador headless e responde
   `sent`/`unknown`. Incerto nunca é reenviado (a fila já garante isso).

Isso mantém segredos (cookie, proxy) **só na VPS**, e o app nunca vê o `li_at`.

### Passo a passo

**a) Executor HTTP (novo arquivo `src/lib/linkedin/http-executor.ts`)**
```ts
import 'server-only';
import type { LinkedInExecutor, LinkedInWorkItem } from './automation';

// Config só por env; sem env → sem executor (no-op, fluxo assistido segue).
export function linkedinExecutor(): LinkedInExecutor | undefined {
  const baseUrl = process.env.LINKEDIN_WORKER_URL?.trim();
  const key = process.env.LINKEDIN_WORKER_KEY?.trim();
  if (!baseUrl || !key) return undefined;
  const url = new URL(baseUrl);                 // exigir HTTPS, sem query/credenciais
  if (url.protocol !== 'https:' || url.username || url.search) throw Error('LINKEDIN_WORKER_URL inválida.');
  return {
    async dispatch(item: LinkedInWorkItem) {
      try {
        const res = await fetch(`${url.origin}${url.pathname.replace(/\/$/, '')}/dispatch`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) return { state: 'unknown' };
        const data = (await res.json()) as { state?: string; providerId?: string };
        return data.state === 'sent'
          ? { state: 'sent', providerId: data.providerId }
          : { state: 'unknown' };            // 'unknown' = nunca reenvia automaticamente
      } catch { return { state: 'unknown' }; }
    },
  };
}
```

**b) Ligar no cron** (`src/app/api/cron/route.ts`), só quando habilitado:
```ts
import { runLinkedinQueue, linkedinAutomationEnabled } from '@/lib/linkedin/automation';
import { linkedinExecutor } from '@/lib/linkedin/http-executor';
// ...dentro do GET, depois do runScheduler:
const linkedin = linkedinAutomationEnabled()
  ? await runLinkedinQueue(db, { executor: linkedinExecutor() })
  : null;
return Response.json({ ...r, harvey, linkedin });
```
> Cron do plano Hobby é **diário**. Para cadência de minutos, use um cron externo
> (QStash/cron-job.org/GitHub Actions) batendo em `/api/cron` com o `CRON_SECRET`.
> **Não** criar polling dentro do app.

**c) Worker na VPS (serviço novo, fora deste repo ou em `infra/linkedin/`)**
- Node + Playwright (Chromium headless). Sessão por conta usando o cookie `li_at`
  (injetado via `context.addCookies`), **um contexto por usuário**.
- Proxy **residencial** por `browser.newContext({ proxy })` — um IP estável por conta.
- Endpoint `POST /dispatch` autenticado por `Authorization: Bearer <LINKEDIN_WORKER_KEY>`:
  - `type: 'react'` → abrir post, curtir.
  - `type: 'comment'` → comentar `body` no post do lead.
  - `type: 'invite'` → enviar convite com nota `body` (≤300 chars, já cortado na cadência).
  - `type: 'message'` → mensagem direta `body` após conexão.
  - devolver `{ state: 'sent', providerId }` **só** com confirmação visível na UI;
    qualquer dúvida → `{ state: 'unknown' }` (a cadência deixa pendente p/ a Fila).
- **Humanização / segurança da conta** (recomendações, ajuste fino é do dono):
  - respeitar os limites que já vêm do app: `users.dailyInvites`, `users.dailyMessages`
    (a fila já corta por eles) — **não** inventar outros no worker.
  - jitter aleatório entre ações (ex.: 40–180s), pausas longas fora do horário comercial,
    *warm-up* progressivo em conta nova, parar no primeiro CAPTCHA/checkpoint e devolver
    `unknown`.
  - 1 sessão por conta; nunca paralelizar ações da mesma conta.
- Env do worker (na VPS, nunca no app): `LINKEDIN_WORKER_KEY`, `LI_AT_<conta>`,
  `PROXY_URL_<conta>`.

**d) Ativar**: setar na Vercel `LINKEDIN_AUTOMATION_ENABLED=true`,
`LINKEDIN_WORKER_URL=https://...`, `LINKEDIN_WORKER_KEY=...`. Sem isso, tudo segue assistido.

**e) Testes**: `tests/linkedin-automation.test.ts` já cobre a fila com executor fake.
Adicione um teste do `linkedinExecutor` (mock `fetch`) mapeando `200+{state:'sent'}`→`sent`
e `500`/exceção→`unknown`.

> ⚠️ **Risco (ToS):** automação não oficial do LinkedIn viola o §8.2 dos Termos e pode
> levar a restrição/banimento da conta. É decisão do dono. O design acima isola o risco
> (segredos só na VPS, 1 IP/conta, limites, incerto nunca reenvia), mas não o elimina.

---

## 2. Agendamento — o que falta para completar

**Já existe:** registro durável (`requestMeeting`, 1 reunião aberta/lead), `confirmMeeting`
(grava horário, avança lead p/ `meeting`, loga `meeting_booked`), `cancelMeeting`,
`.ics` RFC-5545 (`buildIcs`), horários comerciais (`nextBusinessSlots`), link público
(`MEETING_SCHEDULER_URL` via `meetingSchedulerLink`). O Harvey já chama `requestMeeting` e
inclui o link no e-mail de handoff.

**Falta (mínimo para “completo”):**
1. **Setar `MEETING_SCHEDULER_URL`** na Vercel (Calendly/cal.com/Outlook Bookings).
2. **Enviar o `.ics`** no `confirmMeeting`: `buildIcs` existe mas não é disparado. Gerar o
   convite e mandar pelo Office 365 já integrado (`src/lib/mailer.ts`) para lead + vendedor.
3. **UI de confirmação**: tela/ação que lista reuniões `requested`, mostra
   `nextBusinessSlots(...)` e chama `confirmMeeting`. (A lógica existe; falta o botão.)
4. (Opcional) disponibilidade real do calendário do vendedor em vez da heurística
   `nextBusinessSlots` — só se o dono quiser integrar Graph/Calendar.

**Teste:** `confirmMeeting` envia `.ics` uma vez e é idempotente; `requestMeeting` não cria
duas reuniões abertas para o mesmo lead (já há base em `tests/scheduling.test.ts`).

---

## 3. Harvey — o que falta para operar

**Já existe (completo em código):** perfil comercial, aprovação (dá a Harvey a posse
exclusiva do lead e para a cadência), outbox, `processHarveyInbound`, `runHarveyQueue`,
handoff por tópico, opt-out, pedido de reunião. Webhook assinado por `HARVEY_WEBHOOK_SECRET`.

**Falta para funcionar de verdade (infra, não código):**
1. **Parear o número na VPS (WA-AKG):** setar `WA_AKG_BASE_URL` (HTTPS, **sem** `/api`) e
   `WA_AKG_API_KEY`; abrir a página do WhatsApp no app e escanear o **QR** (`AkgGateway.connect/qr/status`).
   Sem sessão `CONNECTED`, Harvey não envia nem recebe.
2. **Configurar o webhook de inbound** no WA-AKG apontando para
   `${PUBLIC_APP_URL}/api/harvey/inbound` com o `HARVEY_WEBHOOK_SECRET`
   (há `AkgGateway.configureWebhook`).
3. **Tick frequente:** `/api/harvey/tick` processa lembretes/outbox. Inbound já é tempo real
   via webhook; os lembretes precisam de um cron externo batendo no tick (minutos), porque o
   cron da Vercel Hobby é diário.
4. Conferir `MASTER_USER_EMAIL`/acessos e `aiEnabled` ligado na operação.

**Teste:** já há cobertura forte (`tests/harvey*.test.ts`): entrega incerta nunca reenvia,
handoff humano, estilo de comunicação congelado. Nada novo necessário; só a infra acima.

---

## 4. Helpin / Suporte — o que falta

**Já existe:** `src/lib/support.ts`, widget web (`/api/support/widget`), canal WhatsApp de
suporte (`/api/support/whatsapp`), página `suporte`, segredo `SUPPORT_WEBHOOK_SECRET`.
Ou seja, o **chat + inbox** da fusão já está no ar — sem DNS separado, nativo no Prospectra+.

**Falta (reimplementar nativo, sem copiar código AGPL):**
1. **Dois públicos**: cliente↔equipe (suporte do cliente final) e usuário↔Argus (suporte do
   produto). Hoje o canal é único — separar por tipo de conversa/fila.
2. **Dois canais unificados**: widget web **+** WhatsApp já existem; garantir que as duas
   entradas caem na **mesma** inbox/thread por contato.
3. **Módulos além do chat**: tickets/estados, base de conhecimento, atribuição, histórico.
   Priorizar na ordem: inbox unificada → tickets → base de conhecimento.
4. **Identidade visual preservada** (regra do dono): cores, símbolos, fontes do Prospectra+;
   nada de substituir o visual por outro produto.

**Teste:** `tests/support*.test.ts` como base; adicionar: mesma thread para web+WhatsApp do
mesmo contato; isolamento por operação (multi-tenant) como no resto do app.

---

## 5. Ordem recomendada para o Codex

1. **Parear WhatsApp na VPS** (desbloqueia Harvey **e** o canal WhatsApp da campanha de uma vez).
2. **LinkedIn automático** (executor HTTP + chamada no cron + worker na VPS).
3. **Agendamento**: setar URL + enviar `.ics` no confirm + tela de confirmação.
4. **Helpin**: inbox unificada (web+WhatsApp) → tickets → base de conhecimento.

Cada item vira **um PR** a partir de `origin/main` fresco, com teste falha-antes/passa-depois,
`pnpm run typecheck` e `pnpm vitest run` verdes. O dono merga no GitHub.

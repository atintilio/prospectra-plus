# Integração Prospectra+ ↔ worker Go (automação LinkedIn)

O Prospectra **não** executa ações no LinkedIn; ele entrega a ação ao worker **Go** (login/cookies/proxy/Playwright ficam no Go) e recebe o resultado por webhook. O lado do Prospectra está pronto e testado; falta o worker Go expor o endpoint por-lead e os callbacks abaixo.

## 1. Prospectra → Go: enfileirar ação por-lead

`src/lib/go/queue.ts` (`pushDueActionsToGo`, chamado pelo `/api/cron` quando `LINKEDIN_AUTOMATION_ENABLED=true`) faz:

```
POST {GO_BASE_URL}/acoes
Header: x-go-secret: {GO_SECRET}
{
  "tarefa_id":   "<actionId uuid do Prospectra>",
  "conta_id":    "<linkedin_accounts.providerId = id da conta no Go>",
  "tipo":        "invite" | "message" | "comment" | "react",
  "profile_url": "<lead.linkedinUrl>",
  "texto":       "<corpo da ação (nota do convite / mensagem / comentário)>",
  "webhook_url": "{PUBLIC_APP_URL}/api/dispatch"
}
-> 200/201 { "tarefa_id": "...", "status": "enfileirada" }
```

Idempotência: ao enfileirar, o Prospectra grava `tarefa_id` em `actions.providerId`; a mesma ação não é reenviada.

## 2. Go → Prospectra: webhook de resultado e eventos

Tudo em `POST {PUBLIC_APP_URL}/api/dispatch` com header `X-Dispatch-Secret: {DISPATCH_SECRET}` (`src/lib/dispatch.ts`):

```jsonc
// resultado da ação
{ "kind": "action", "state": "sent" | "unknown", "actionId": "<tarefa_id>", "providerId": "<id no Go>" }
// aceite / resposta / reunião observados pelo Go (avança a cadência sozinho)
{ "kind": "event", "event": "accepted" | "replied" | "meeting", "leadId": "<uuid>" }
// estado da conta, incluindo checkpoint/2FA
{ "kind": "account", "accountId": "<uuid>", "orgId": "<uuid>",
  "status": "connected"|"expired"|"blocked"|"disconnected"|"checkpoint",
  "error": "...", "screenshotUrl": "https://..." }
```

Regras já implementadas no Prospectra:
- `sent` → ação concluída, evento registrado, estágio do lead avança, próximo passo agendado.
- `unknown` → permanece pendente, **sem reenvio automático** (só humano resolve).
- `accepted` → libera passos "após aceite"; `replied`/`meeting` → encerram a cadência.
- `checkpoint` → conta marcada como `blocked` com a verificação 2FA em `lastError`.

## 3. Vínculo de conta

A conta conectada em **Go LinkedIn** guarda `providerId`. Esse `providerId` deve ser o `conta_id` que o worker Go entende (cookies+proxy no Go). O Prospectra nunca guarda cookies do LinkedIn.

## 4. Variáveis (.env da VPS)

```
GO_BASE_URL=https://go.interno...     # backend do worker Go (HTTPS, sem /api no fim)
GO_SECRET=...                         # enviado em x-go-secret
LINKEDIN_AUTOMATION_ENABLED=true                       # liga a entrega automática (padrão: false = assistido)
DISPATCH_SECRET=...                   # valida os webhooks do Go
PUBLIC_APP_URL=https://prospectra.argusprime.com.br
```

## 5. O que falta no worker Go (referência enviada: busca-por-keyword)

A referência atual faz `POST /campanhas {conta_id, keywords, limit}` (busca + convites). Para a cadência por-lead é preciso **acrescentar** ao worker:
1. `POST /acoes` recebendo uma ação por-lead (seção 1) e enfileirando no Redis.
2. Executar a ação no `profile_url` conforme `tipo` (invite/message/comment/react).
3. Chamar `webhook_url` com `kind:"action"` ao concluir.
4. Observar aceite/resposta e chamar `kind:"event"`; em 2FA, `kind:"account"` com `screenshotUrl`.

import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import { ACTION_EVENT, advanceStageForAction, continueFlowAfterAction, markOutcome, queueIntelligenceForInvite } from './cadence';
import { setAccountStatus } from './linkedin';

// Contrato do worker (Go/py): POST /dispatch { state: "sent" | "unknown", providerId?, actionId? }
// - "sent": o provedor aceitou a execução durávelmente (recebido antes da prova de entrega).
//   O servidor marca a ação como feita e avança a cadência do lead.
// - "unknown": o resultado é incerto (ex.: timeout). A ação NUNCA é reenviada automaticamente:
//   ela permanece pendente marcada como "unknown" e só um humano resolve na Fila do dia.
// Autenticação: header X-Dispatch-Secret comparado a DISPATCH_SECRET.

export type DispatchInput = {
  state: 'sent' | 'unknown';
  providerId?: string;
  actionId?: string;
  note?: string;
};

export class DispatchError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function dispatchSecretConfigured(): boolean {
  return Boolean(process.env.DISPATCH_SECRET?.trim());
}

export function checkDispatchSecret(headerValue: string | null): boolean {
  const expected = process.env.DISPATCH_SECRET?.trim();
  if (!expected) return false; // sem segredo configurado, o endpoint fica fechado
  return headerValue?.trim() === expected;
}

export async function applyDispatch(db: DB, input: DispatchInput, now = new Date()): Promise<{ actionId: string; status: string; dispatchState: string; reenqueued: false }> {
  if (input.state !== 'sent' && input.state !== 'unknown') throw new DispatchError('state deve ser "sent" ou "unknown".');
  if (!input.actionId) throw new DispatchError('Informe o actionId da ação recebida.');

  const [action] = await db.select().from(schema.actions).where(eq(schema.actions.id, input.actionId));
  if (!action) throw new DispatchError('Ação não encontrada.', 404);

  if (input.state === 'sent') {
    if (action.status !== 'pending') {
      // Idempotente: repetir o recibo de "sent" não duplica evento.
      const [latest] = await db.select({ dispatchState: schema.actions.dispatchState, status: schema.actions.status }).from(schema.actions).where(eq(schema.actions.id, action.id));
      return { actionId: action.id, status: latest?.status ?? action.status, dispatchState: latest?.dispatchState ?? action.dispatchState, reenqueued: false };
    }
    await db.update(schema.actions)
      .set({ status: 'done', dispatchState: 'sent', providerId: input.providerId ?? action.providerId, executedAt: now })
      .where(eq(schema.actions.id, action.id));
    const eventType = ACTION_EVENT[action.type];
    if (eventType) {
      await db.insert(schema.events).values({ orgId: action.orgId, userId: action.userId, campaignId: action.campaignId, leadId: action.leadId, type: eventType, at: now });
      if (action.type === 'invite') await queueIntelligenceForInvite(db, { orgId: action.orgId, userId: action.userId, leadId: action.leadId });
    }
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, action.leadId));
    if (lead) {
      const stage = advanceStageForAction(lead.stage, action.type);
      await db.update(schema.leads).set({ stage, lastActivityAt: now }).where(eq(schema.leads.id, lead.id));
    }
    await continueFlowAfterAction(db, action, now);
    return { actionId: action.id, status: 'done', dispatchState: 'sent', reenqueued: false };
  }

  // unknown: mantém pendente, marca estado e registra o motivo; sem reenvio automático.
  await db.update(schema.actions)
    .set({ dispatchState: 'unknown', providerId: input.providerId ?? action.providerId, body: input.note ?? action.body })
    .where(eq(schema.actions.id, action.id));
  return { actionId: action.id, status: action.status, dispatchState: 'unknown', reenqueued: false };
}

// ---------------------------------------------------------------------------
// Laço de retorno (inbound) do worker de automação (Go).
//
// Além de reportar o resultado de uma ação ("action"), o worker observa o que
// acontece na conta e avisa o Prospectra. O servidor então avança a cadência
// SOZINHO, sem depender de alguém marcar na mão:
//   - "accepted": o convite foi aceito  -> libera os passos "após aceite".
//   - "replied" : o lead respondeu      -> encerra a cadência do lead.
//   - "meeting" : reunião marcada        -> encerra a cadência do lead.
// E também o estado da conta LinkedIn ("account"), incluindo checkpoint/2FA.
//
// Formato (header X-Dispatch-Secret obrigatório em todos):
//   { "kind": "action",  "state": "sent"|"unknown", "actionId": "...", "providerId"?: "..." }
//   { "kind": "event",   "event": "accepted"|"replied"|"meeting", "leadId": "<uuid>" }
//   { "kind": "account", "accountId": "<uuid>", "orgId": "<uuid>",
//                        "status": "connected"|"expired"|"blocked"|"disconnected"|"checkpoint",
//                        "error"?: "...", "screenshotUrl"?: "https://..." }
// Sem "kind", o corpo é tratado como "action" (compatível com o contrato anterior).
// ---------------------------------------------------------------------------

const LEAD_EVENTS = ['accepted', 'replied', 'meeting'] as const;
type LeadEvent = (typeof LEAD_EVENTS)[number];

const leadEventSchema = z.object({
  kind: z.literal('event'),
  event: z.enum(LEAD_EVENTS),
  leadId: z.string().uuid('leadId inválido.'),
}).strict();

const ACCOUNT_STATUSES = ['connected', 'expired', 'blocked', 'disconnected', 'checkpoint'] as const;
const accountStatusSchema = z.object({
  kind: z.literal('account'),
  accountId: z.string().uuid('accountId inválido.'),
  orgId: z.string().uuid('orgId inválido.'),
  status: z.enum(ACCOUNT_STATUSES),
  error: z.string().trim().max(500).optional(),
  screenshotUrl: z.string().trim().url().max(2000).optional(),
}).strict();

/** Aceite/resposta/reunião observados pelo worker: avança a cadência do lead automaticamente. */
export async function applyLeadEvent(db: DB, input: { event: LeadEvent; leadId: string }, now = new Date()): Promise<{ leadId: string; event: LeadEvent; stage: schema.LeadStage }> {
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, input.leadId));
  if (!lead) throw new DispatchError('Lead não encontrado.', 404);
  const { stage } = await markOutcome(db, lead.orgId, lead.ownerId, input.leadId, input.event, now);
  return { leadId: input.leadId, event: input.event, stage };
}

/** Estado passivo da conta LinkedIn (callback do worker), incluindo checkpoint/2FA. */
export async function applyAccountStatus(db: DB, input: z.infer<typeof accountStatusSchema>, now = new Date()): Promise<{ accountId: string; status: schema.LinkedInStatus }> {
  // Não há coluna dedicada para o screenshot do checkpoint: guardamos no lastError,
  // que a tela Go LinkedIn já exibe. 'checkpoint' é tratado como conta bloqueada até o 2FA.
  const status: schema.LinkedInStatus = input.status === 'checkpoint' ? 'blocked' : input.status;
  const error = input.status === 'checkpoint'
    ? `checkpoint/2FA pendente.${input.screenshotUrl ? ` Verificação: ${input.screenshotUrl}` : ''}`
    : input.error ?? null;
  const account = await setAccountStatus(db, input.accountId, input.orgId, status, error, now);
  if (!account) throw new DispatchError('Conta não encontrada.', 404);
  return { accountId: account.id, status: account.status };
}

/** Roteia o corpo recebido pelo endpoint conforme "kind" (compatível com o contrato anterior). */
export async function receiveDispatch(db: DB, body: unknown, now = new Date()): Promise<Record<string, unknown>> {
  const kind = (body as { kind?: unknown })?.kind;
  if (kind === 'event') {
    const parsed = leadEventSchema.safeParse(body);
    if (!parsed.success) throw new DispatchError(parsed.error.issues[0]?.message ?? 'Evento inválido.');
    return { ok: true, ...(await applyLeadEvent(db, parsed.data, now)) };
  }
  if (kind === 'account') {
    const parsed = accountStatusSchema.safeParse(body);
    if (!parsed.success) throw new DispatchError(parsed.error.issues[0]?.message ?? 'Status de conta inválido.');
    return { ok: true, ...(await applyAccountStatus(db, parsed.data, now)) };
  }
  // "action" (padrão): resultado de uma ação enfileirada.
  const { state, providerId, note, actionId } = (body ?? {}) as { state?: string; providerId?: string; note?: string; actionId?: string };
  if (state !== 'sent' && state !== 'unknown') throw new DispatchError('state deve ser "sent" ou "unknown".');
  return { ok: true, ...(await applyDispatch(db, { state, providerId, note, actionId }, now)) };
}

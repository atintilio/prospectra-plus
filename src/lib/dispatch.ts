import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import { ACTION_EVENT, addDays } from './cadence';

function advanceStage(current: schema.LeadStage, target: schema.LeadStage): schema.LeadStage {
  const order: schema.LeadStage[] = ['new', 'invited', 'connected', 'replied', 'meeting', 'won'];
  if (current === 'lost' || current === 'do_not_contact') return current;
  if (target === 'lost' || target === 'do_not_contact') return target;
  return order.indexOf(target) > order.indexOf(current) ? target : current;
}

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
    }
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, action.leadId));
    if (lead) {
      const stage = advanceStage(lead.stage, 'invited');
      await db.update(schema.leads).set({ stage, lastActivityAt: now }).where(eq(schema.leads.id, lead.id));
    }
    await advanceEnrollment(db, action, now);
    return { actionId: action.id, status: 'done', dispatchState: 'sent', reenqueued: false };
  }

  // unknown: mantém pendente, marca estado e registra o motivo; sem reenvio automático.
  await db.update(schema.actions)
    .set({ dispatchState: 'unknown', providerId: input.providerId ?? action.providerId, body: input.note ?? action.body })
    .where(eq(schema.actions.id, action.id));
  return { actionId: action.id, status: action.status, dispatchState: 'unknown', reenqueued: false };
}

async function advanceEnrollment(db: DB, action: typeof schema.actions.$inferSelect, now: Date) {
  const row = await db.select({ enr: schema.enrollments, camp: schema.campaigns }).from(schema.enrollments)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, action.campaignId))
    .where(and(eq(schema.enrollments.id, action.enrollmentId), inArray(schema.enrollments.state, ['running', 'waiting_accept']))).limit(1);
  const { enr, camp } = row[0] ?? {};
  if (!enr || !camp) return;
  const nextIndex = enr.stepIndex + 1;
  const next = camp.steps[nextIndex];
  if (!next) {
    await db.update(schema.enrollments).set({ stepIndex: nextIndex, state: 'done' }).where(eq(schema.enrollments.id, enr.id));
  } else {
    await db.update(schema.enrollments).set({ stepIndex: nextIndex, state: 'running', nextRunAt: addDays(now, next.delayDays) }).where(eq(schema.enrollments.id, enr.id));
  }
}

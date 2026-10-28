import 'server-only';
import { and, eq, gte } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import { completeAction } from '@/lib/cadence';

// Execução automática de LinkedIn — DESLIGADA por padrão.
// O Prospectra+ é assistido por decisão do proprietário. Este módulo é a base para a
// execução automática: quando o usuário liga LINKEDIN_AUTOMATION_ENABLED e fornece um
// executor (o agente dele na VM / gateway próprio — nenhum serviço pago é ativado aqui),
// as ações pendentes da Fila passam a ser despachadas automaticamente, com recibo durável
// e respeitando os limites diários. Um resultado incerto NUNCA é reenviado automaticamente.

export type LinkedInWorkItem = {
  id: string;
  type: 'react' | 'comment' | 'invite' | 'message';
  leadLinkedinUrl: string;
  leadName: string;
  body: string;
};

export type LinkedInExecutor = {
  dispatch(item: LinkedInWorkItem): Promise<{ state: 'sent' | 'unknown'; providerId?: string }>;
};

export function linkedinAutomationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LINKEDIN_AUTOMATION_ENABLED === 'true';
}

// Quais tipos consomem limite diário, e contra qual contador do usuário.
const LIMITED: Record<string, 'invite' | 'message' | null> = { invite: 'invite', message: 'message', react: null, comment: null };
const LIMIT_EVENT = { invite: 'invite_sent', message: 'message_sent' } as const;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function sentTodayCount(db: DB, orgId: string, userId: string, type: 'invite' | 'message', since: Date): Promise<number> {
  const rows = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(and(eq(schema.events.orgId, orgId), eq(schema.events.userId, userId), eq(schema.events.type, LIMIT_EVENT[type]), gte(schema.events.at, since)));
  return rows.length;
}

export type LinkedinQueueResult = { processed: number; dispatched: number; uncertain: number; skipped: number };

/**
 * Despacha ações pendentes da Fila via LinkedIn automático, quando habilitado.
 * No-op (não altera nada) quando o recurso está desligado ou sem executor:
 * o fluxo assistido permanece idêntico.
 */
export async function runLinkedinQueue(
  db: DB,
  deps: { executor?: LinkedInExecutor; now?: Date; maxActions?: number; orgId?: string } = {},
): Promise<LinkedinQueueResult> {
  const result: LinkedinQueueResult = { processed: 0, dispatched: 0, uncertain: 0, skipped: 0 };
  if (!deps.executor || !linkedinAutomationEnabled()) return result;

  const now = deps.now ?? new Date();
  const since = startOfUtcDay(now);
  const limit = Math.min(Math.max(1, deps.maxActions ?? 20), 50);

  const conds = [eq(schema.actions.status, 'pending')];
  if (deps.orgId) conds.push(eq(schema.actions.orgId, deps.orgId));
  const pending = await db
    .select({ action: schema.actions, lead: schema.leads, user: schema.users })
    .from(schema.actions)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.actions.leadId))
    .innerJoin(schema.users, eq(schema.users.id, schema.actions.userId))
    .where(and(...conds))
    .orderBy(schema.actions.dueDate)
    .limit(limit);

  // Quanto resta de cada contador diário por usuário, nesta execução.
  const remaining = new Map<string, { invite: number; message: number }>();

  for (const row of pending) {
    result.processed++;
    const { action, lead, user } = row;
    const counter = LIMITED[action.type];

    if (counter) {
      let left = remaining.get(user.id);
      if (!left) {
        left = {
          invite: Math.max(0, user.dailyInvites - (await sentTodayCount(db, action.orgId, user.id, 'invite', since))),
          message: Math.max(0, user.dailyMessages - (await sentTodayCount(db, action.orgId, user.id, 'message', since))),
        };
        remaining.set(user.id, left);
      }
      if (left[counter] <= 0) { result.skipped++; continue; } // limite diário: fica pendente para o próximo dia
    }

    // Recibo de despacho: claim idempotente. Se outro processo já pegou, não duplica.
    const [claim] = await db
      .insert(schema.linkedinDispatches)
      .values({ orgId: action.orgId, userId: user.id, actionId: action.id, type: action.type })
      .onConflictDoNothing()
      .returning({ id: schema.linkedinDispatches.id });
    if (!claim) { result.skipped++; continue; }

    let outcome: { state: 'sent' | 'unknown'; providerId?: string };
    try {
      outcome = await deps.executor.dispatch({ id: action.id, type: action.type, leadLinkedinUrl: lead.linkedinUrl, leadName: lead.fullName, body: action.body });
    } catch {
      outcome = { state: 'unknown' };
    }

    if (outcome.state === 'sent') {
      // Reusa a conclusão da Fila: registra o evento, avança o estágio e agenda o próximo passo.
      await completeAction(db, action.orgId, user.id, action.id, 'done', undefined, now);
      await db.update(schema.linkedinDispatches).set({ state: 'sent', providerId: outcome.providerId ?? null }).where(eq(schema.linkedinDispatches.id, claim.id));
      result.dispatched++;
      if (counter) remaining.get(user.id)![counter]--;
    } else {
      // Incerto: nunca reenviar automaticamente. O recibo único impede um novo claim.
      await db.update(schema.linkedinDispatches).set({ state: 'unknown' }).where(eq(schema.linkedinDispatches.id, claim.id));
      result.uncertain++;
    }
  }

  return result;
}

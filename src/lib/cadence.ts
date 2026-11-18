import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import type { EventType, LeadStage } from '@/db/schema';
import { fillTemplate } from './template';
import { queueLeadAnalysis } from './intelligence/jobs';
import { graphOf, nodeById, outEdge, TRIGGER_ID, type FlowGraph, type FlowNode } from './flow';

// Motor de fluxo das campanhas (estilo n8n, modo assistido).
// - A campanha é um grafo: gatilho → ações → condições (ramificações).
// - O scheduler percorre o grafo de cada inscrição vencida e cria as "ações" na Fila do dia.
// - O usuário marca a ação como feita/pulada; resultados do lead (aceite, resposta, reunião, venda)
//   movem ou encerram o fluxo. Resposta encerra; aceite libera passos condicionados.
// - Campanhas antigas (lista linear de passos) são lidas como um fluxo linear equivalente.

export type Generator = (args: { step: { type: FlowNode['action']; template: string; useAi: boolean }; lead: typeof schema.leads.$inferSelect; brief: string }) => Promise<string>;

export const defaultGenerator: Generator = async ({ step, lead }) => fillTemplate(step.template ?? '', lead);

export function dayString(d: Date, tz = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400_000);
}

const STAGE_ORDER: LeadStage[] = ['new', 'invited', 'connected', 'replied', 'meeting', 'won'];
const STOP_STAGES: LeadStage[] = ['replied', 'meeting', 'won', 'lost', 'do_not_contact'];

function advanceStage(current: LeadStage, target: LeadStage): LeadStage {
  if (current === 'lost' || current === 'do_not_contact') return current;
  if (target === 'lost' || target === 'do_not_contact') return target;
  return STAGE_ORDER.indexOf(target) > STAGE_ORDER.indexOf(current) ? target : current;
}

function hasAccepted(lead: { stage: LeadStage }): boolean {
  return lead.stage === 'connected' || lead.stage === 'replied' || lead.stage === 'meeting' || lead.stage === 'won';
}

async function logEvent(db: DB, e: { orgId: string; userId?: string | null; campaignId?: string | null; leadId?: string | null; type: EventType; at?: Date }) {
  await db.insert(schema.events).values({ ...e, at: e.at ?? new Date() });
}

/** Nós de ação do grafo na ordem em que foram criados (para migrar inscrições antigas). */
function actionNodeIds(graph: FlowGraph): string[] {
  return graph.nodes.filter((n) => n.type === 'action').map((n) => n.id);
}

/** Inscreve leads numa campanha. Ignora quem já está num fluxo ativo no mesmo parceiro. */
export async function enrollLeads(db: DB, orgId: string, campaignId: string, leadIds: string[], now = new Date()) {
  if (!leadIds.length) return { added: 0, skipped: 0 };
  const [camp] = await db.select({ id: schema.campaigns.id }).from(schema.campaigns)
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.orgId, orgId)));
  if (!camp) return { added: 0, skipped: leadIds.length };
  const eligible = await db.select({ id: schema.leads.id }).from(schema.leads)
    .where(and(eq(schema.leads.orgId, orgId), inArray(schema.leads.id, leadIds), sql`${schema.leads.stage} not in ('do_not_contact','lost','won')`));
  let added = 0;
  for (const { id } of eligible) {
    const res = await db.insert(schema.enrollments)
      .values({ orgId, campaignId, leadId: id, nodeId: TRIGGER_ID, nextRunAt: now })
      .onConflictDoNothing()
      .returning({ id: schema.enrollments.id });
    added += res.length;
  }
  return { added, skipped: leadIds.length - added };
}

type WalkCtx = {
  db: DB;
  graph: FlowGraph;
  enr: typeof schema.enrollments.$inferSelect;
  camp: typeof schema.campaigns.$inferSelect;
  lead: typeof schema.leads.$inferSelect;
  aiEnabled: boolean;
  now: Date;
  generate: Generator;
};

/** Cria a ação de um nó e estaciona a inscrição aguardando a execução humana. */
async function createFlowAction(ctx: WalkCtx, node: FlowNode): Promise<'created' | 'stopped'> {
  const { db, enr, camp, lead, aiEnabled, now } = ctx;
  if (STOP_STAGES.includes(lead.stage)) {
    await db.update(schema.enrollments).set({ state: 'stopped', nodeId: node.id }).where(eq(schema.enrollments.id, enr.id));
    return 'stopped';
  }
  if (node.condition === 'accepted' && !hasAccepted(lead)) {
    await db.update(schema.enrollments).set({ state: 'waiting_accept', nodeId: node.id }).where(eq(schema.enrollments.id, enr.id));
    return 'stopped';
  }
  const type = node.action!;
  let body = '';
  if (type === 'invite' || type === 'message' || type === 'comment') {
    const step = { type, template: node.template ?? '', useAi: !!node.useAi };
    body = step.useAi && aiEnabled ? await ctx.generate({ step, lead, brief: camp.aiBrief }).catch(() => fillTemplate(step.template, lead)) : fillTemplate(step.template, lead);
    if (type === 'invite') body = body.slice(0, 300); // limite da nota de convite do LinkedIn
  }
  await db.insert(schema.actions).values({
    orgId: enr.orgId, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id,
    userId: camp.assignedTo ?? camp.ownerId, stepIndex: enr.stepIndex, type, body,
    dueDate: dayString(ctx.now),
  }).onConflictDoNothing();
  // aguardando execução humana: o fluxo só segue quando a ação for concluída
  await db.update(schema.enrollments).set({ stepIndex: enr.stepIndex + 1, nodeId: node.id, state: 'running', nextRunAt: addDays(ctx.now, 3650) })
    .where(eq(schema.enrollments.id, enr.id));
  return 'created';
}

/**
 * Percorre o grafo a partir de startNodeId.
 * due=false: chegada nova (após concluir ação) — waitDays agenda o futuro.
 * due=true: o scheduler acordou a inscrição (nextRunAt vencido) — a espera já passou.
 */
async function walkFlow(ctx: WalkCtx, startNodeId: string, due: boolean): Promise<{ processed: boolean; created: boolean }> {
  const { db, graph, enr, lead, now } = ctx;
  let currentId: string | undefined = startNodeId;
  for (let guard = 0; guard < 100 && currentId; guard++) {
    const node = nodeById(graph, currentId);
    if (!node) break;

    if (node.type === 'trigger') {
      currentId = outEdge(graph, node.id)?.to;
      continue;
    }

    if (node.type === 'branch') {
      const yes = node.if === 'accepted' ? hasAccepted(lead) : false;
      const edge = yes ? outEdge(graph, node.id, 'yes') : (outEdge(graph, node.id, 'no') ?? outEdge(graph, node.id, 'yes'));
      if (!edge) {
        // sem saída pela condição atendida: paridade com o modelo antigo (aguardar aceite)
        if (!yes) {
          await db.update(schema.enrollments).set({ state: 'waiting_accept', nodeId: node.id }).where(eq(schema.enrollments.id, enr.id));
          return { processed: true, created: false };
        }
        await db.update(schema.enrollments).set({ state: 'done', nodeId: node.id }).where(eq(schema.enrollments.id, enr.id));
        return { processed: true, created: false };
      }
      currentId = edge.to;
      continue;
    }

    // nó de ação
    const waitDays = node.waitDays ?? 0;
    if (!due && waitDays > 0) {
      await db.update(schema.enrollments).set({ nodeId: node.id, state: 'running', nextRunAt: addDays(now, waitDays) })
        .where(eq(schema.enrollments.id, enr.id));
      return { processed: true, created: false };
    }
    const res = await createFlowAction(ctx, node);
    return { processed: true, created: res === 'created' };
  }
  await db.update(schema.enrollments).set({ state: 'done' }).where(eq(schema.enrollments.id, enr.id));
  return { processed: true, created: false };
}

/** Gera as ações vencidas. Idempotente: rodar duas vezes não duplica ações. */
export async function runScheduler(db: DB, opts: { orgId?: string; now?: Date; generate?: Generator } = {}) {
  const now = opts.now ?? new Date();
  const generate = opts.generate ?? defaultGenerator;
  const conds = [eq(schema.enrollments.state, 'running'), lte(schema.enrollments.nextRunAt, now), eq(schema.campaigns.status, 'active')];
  if (opts.orgId) conds.push(eq(schema.enrollments.orgId, opts.orgId));
  const due = await db
    .select({ enr: schema.enrollments, camp: schema.campaigns, lead: schema.leads, aiEnabled: schema.orgs.aiEnabled })
    .from(schema.enrollments)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.enrollments.orgId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.enrollments.campaignId))
    .innerJoin(schema.leads, eq(schema.leads.id, schema.enrollments.leadId))
    .where(and(...conds))
    .limit(500);

  let created = 0;
  for (const { enr, camp, lead, aiEnabled } of due) {
    const graph = graphOf(camp);
    let startId = enr.nodeId;
    if (!startId) {
      // inscrição antiga: mapeia o índice do passo para o nó equivalente do fluxo derivado
      const ids = actionNodeIds(graph);
      startId = ids[enr.stepIndex] ?? TRIGGER_ID;
      if (!ids[enr.stepIndex]) {
        await db.update(schema.enrollments).set({ state: 'done' }).where(eq(schema.enrollments.id, enr.id));
        continue;
      }
    }
    const r = await walkFlow({ db, graph, enr, camp, lead, aiEnabled, now, generate }, startId, true);
    created += r.created ? 1 : 0;
  }
  return { processed: due.length, created };
}

const ACTION_EVENT: Record<string, EventType> = { invite: 'invite_sent', message: 'message_sent', react: 'reaction_sent', comment: 'comment_sent' };
export { ACTION_EVENT };

/** Estágio do lead após uma ação concluída: só convite avança para "invited". */
export function advanceStageForAction(current: LeadStage, type: string): LeadStage {
  return type === 'invite' ? advanceStage(current, 'invited') : current;
}

/**
 * Para cada convite enviado, enfileira a análise de inteligência comercial do lead.
 * Falha em silêncio por design: demo, limite diário ou lead indisponível nunca podem parar o fluxo comercial.
 */
export async function queueIntelligenceForInvite(db: DB, invite: { orgId: string; userId: string; leadId: string }) {
  try {
    await queueLeadAnalysis(db, { orgId: invite.orgId, userId: invite.userId }, invite.leadId, crypto.randomUUID());
  } catch { /* análise é opcional: o envio comercial segue */ }
}

/** Continua o fluxo após a conclusão de uma ação (fila humana ou recibo do worker). */export async function continueFlowAfterAction(db: DB, action: typeof schema.actions.$inferSelect, now: Date, generate?: Generator) {
  const [camp] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, action.campaignId));
  const [enr] = await db.select().from(schema.enrollments).where(eq(schema.enrollments.id, action.enrollmentId));
  if (!camp || !enr) return;
  if (!['running', 'waiting_accept'].includes(enr.state)) return;
  const graph = graphOf(camp);
  const currentNodeId = enr.nodeId ?? actionNodeIds(graph)[action.stepIndex];
  const nextEdge = currentNodeId ? outEdge(graph, currentNodeId) : undefined;
  if (!nextEdge) {
    await db.update(schema.enrollments).set({ state: 'done' }).where(eq(schema.enrollments.id, enr.id));
    return;
  }
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, action.leadId));
  if (!lead) return;
  const [aiRow] = await db.select({ aiEnabled: schema.orgs.aiEnabled }).from(schema.orgs).where(eq(schema.orgs.id, orgId0(action))).limit(1);
  await walkFlow({ db, graph, enr, camp, lead, aiEnabled: aiRow?.aiEnabled ?? false, now, generate: generate ?? defaultGenerator }, nextEdge.to, false);
}

function orgId0(action: typeof schema.actions.$inferSelect): string {
  return action.orgId;
}

/** Conclui (ou pula) uma ação da fila e segue o fluxo a partir do nó atual. */
export async function completeAction(db: DB, orgId: string, userId: string, actionId: string, outcome: 'done' | 'skipped', body?: string, now = new Date(), opts: { generate?: Generator } = {}) {
  const [row] = await db.select({ action: schema.actions, enr: schema.enrollments, camp: schema.campaigns, lead: schema.leads })
    .from(schema.actions)
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.actions.enrollmentId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .innerJoin(schema.leads, eq(schema.leads.id, schema.actions.leadId))
    .where(and(eq(schema.actions.id, actionId), eq(schema.actions.orgId, orgId)));
  if (!row) throw new Error('Ação não encontrada');
  if (row.action.status !== 'pending') return row.action;
  // Campanha automática: o envio é do robô (worker Go). O humano não conclui aqui (evita duplicar).
  if (row.camp.mode === 'automatico') throw new Error('Ação de campanha automática: o envio é feito pelo robô.');

  await db.update(schema.actions).set({ status: outcome, executedAt: now, ...(body !== undefined ? { body } : {}) }).where(eq(schema.actions.id, actionId));
  if (outcome === 'done') {
    await logEvent(db, { orgId, userId, campaignId: row.camp.id, leadId: row.lead.id, type: ACTION_EVENT[row.action.type], at: now });
    if (row.action.type === 'invite') await queueIntelligenceForInvite(db, { orgId, userId, leadId: row.lead.id });
    const stage = advanceStageForAction(row.lead.stage, row.action.type);
    await db.update(schema.leads).set({ stage, lastActivityAt: now }).where(eq(schema.leads.id, row.lead.id));
  }
  await continueFlowAfterAction(db, row.action, now, opts.generate);
  return row.action;
}

export type Outcome = 'accepted' | 'replied' | 'meeting' | 'won' | 'lost' | 'do_not_contact';
const OUTCOME_STAGE: Record<Outcome, LeadStage> = { accepted: 'connected', replied: 'replied', meeting: 'meeting', won: 'won', lost: 'lost', do_not_contact: 'do_not_contact' };
const OUTCOME_EVENT: Partial<Record<Outcome, EventType>> = { accepted: 'invite_accepted', replied: 'reply_received', meeting: 'meeting_booked', won: 'deal_won', lost: 'deal_lost' };

/** Registra um resultado do lead. Aceite libera passos "após aceite"; resposta encerra o fluxo. */
export async function markOutcome(db: DB, orgId: string, userId: string | null, leadId: string, outcome: Outcome, now = new Date()) {
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, orgId)));
  if (!lead) throw new Error('Lead não encontrado');
  const stage = advanceStage(lead.stage, OUTCOME_STAGE[outcome]);
  await db.update(schema.leads).set({ stage, lastActivityAt: now }).where(eq(schema.leads.id, leadId));
  const ev = OUTCOME_EVENT[outcome];
  const [enr] = await db.select().from(schema.enrollments)
    .where(and(eq(schema.enrollments.leadId, leadId), eq(schema.enrollments.orgId, orgId), inArray(schema.enrollments.state, ['running', 'waiting_accept'])));
  if (ev) await logEvent(db, { orgId, userId, leadId, campaignId: enr?.campaignId ?? null, type: ev, at: now });
  if (!enr) return { stage };
  if (outcome === 'accepted') {
    if (enr.state === 'waiting_accept') {
      await db.update(schema.enrollments).set({ state: 'running', nextRunAt: now }).where(eq(schema.enrollments.id, enr.id));
    }
  } else {
    await db.update(schema.enrollments).set({ state: 'stopped' }).where(eq(schema.enrollments.id, enr.id));
    await db.update(schema.actions).set({ status: 'skipped' })
      .where(and(eq(schema.actions.enrollmentId, enr.id), eq(schema.actions.status, 'pending')));
  }
  return { stage };
}

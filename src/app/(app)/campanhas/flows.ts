import { and, asc, count, desc, eq } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import type { CampaignFlow, LinkedFlow } from './editor';

/**
 * Leitura de fluxos para a tela de campanha (vínculo campanha ↔ fluxo, RF7).
 *
 * O fluxo é o MODELO da cadência: a campanha aponta para ele e o motor existente
 * (src/lib/cadence.ts) executa as etapas. Tudo aqui é filtrado pela operação:
 * fluxo de outra operação não aparece, não pode ser vinculado nem executado.
 */

/** Fluxos da operação, com a contagem de etapas (para o seletor). */
export async function listCampaignFlows(db: DB, orgId: string): Promise<CampaignFlow[]> {
  const rows = await db.select({
    id: schema.flows.id,
    name: schema.flows.name,
    status: schema.flows.status,
    stepCount: count(schema.flowSteps.id),
  }).from(schema.flows)
    .leftJoin(schema.flowSteps, eq(schema.flowSteps.flowId, schema.flows.id))
    .where(eq(schema.flows.orgId, orgId))
    .groupBy(schema.flows.id, schema.flows.name, schema.flows.status)
    .orderBy(desc(schema.flows.updatedAt));
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status, stepCount: Number(r.stepCount) }));
}

/** Fluxo vinculado à campanha, com as etapas que a cadência vai executar. */
export async function loadLinkedFlow(db: DB, orgId: string, flowId: string | null): Promise<LinkedFlow | null> {
  if (!flowId) return null;
  const [flow] = await db.select({ id: schema.flows.id, name: schema.flows.name }).from(schema.flows)
    .where(and(eq(schema.flows.id, flowId), eq(schema.flows.orgId, orgId))).limit(1);
  if (!flow) return null;
  const steps = await db.select({
    id: schema.flowSteps.id,
    type: schema.flowSteps.type,
    delayDays: schema.flowSteps.delayDays,
    condition: schema.flowSteps.condition,
    template: schema.flowSteps.template,
    useAi: schema.flowSteps.useAi,
    subject: schema.flowSteps.subject,
    mediaUrl: schema.flowSteps.mediaUrl,
    name: schema.flowSteps.name,
  }).from(schema.flowSteps)
    .where(eq(schema.flowSteps.flowId, flow.id))
    .orderBy(asc(schema.flowSteps.position), asc(schema.flowSteps.id));
  return { id: flow.id, name: flow.name, steps };
}

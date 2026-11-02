import { countDistinct, desc, eq } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';

/**
 * Leitura da lista de fluxos da operação.
 *
 * As contagens (blocos do fluxo e campanhas que o usam) vêm de subqueries
 * correlacionadas: a referência à tabela externa precisa ser **qualificada**
 * (`"flows".id`), senão o Postgres resolve `"id"` contra a tabela da subquery
 * e a contagem volta sempre zero.
 *
 * Os dois `count` são `countDistinct`: com dois joins, a contagem simples
 * contaria o produto cartesiano (blocos × campanhas).
 */
export type FluxoLista = {
  id: string;
  name: string;
  description: string;
  status: string;
  updatedAt: Date;
  steps: number;
  campaigns: number;
};

export async function listFlows(db: DB, orgId: string): Promise<FluxoLista[]> {
  const rows = await db.select({
    id: schema.flows.id,
    name: schema.flows.name,
    description: schema.flows.description,
    status: schema.flows.status,
    updatedAt: schema.flows.updatedAt,
    steps: countDistinct(schema.flowSteps.id),
    campaigns: countDistinct(schema.campaigns.id),
  }).from(schema.flows)
    .leftJoin(schema.flowSteps, eq(schema.flowSteps.flowId, schema.flows.id))
    .leftJoin(schema.campaigns, eq(schema.campaigns.flowId, schema.flows.id))
    .where(eq(schema.flows.orgId, orgId))
    .groupBy(schema.flows.id)
    .orderBy(desc(schema.flows.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    updatedAt: r.updatedAt,
    steps: Number(r.steps),
    campaigns: Number(r.campaigns),
  }));
}

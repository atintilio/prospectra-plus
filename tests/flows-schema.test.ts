import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { seedOrg, testDb } from './helpers';

/** O driver do teste devolve a lista de linhas em formatos diferentes. */
function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === 'object' && 'rows' in result) {
    const value = (result as { rows?: unknown }).rows;
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  }
  return [];
}

/**
 * FASE F1 do PRD de fluxo nativo: as tabelas `flows` e `flow_steps` existem com
 * os defaults e os índices do §4, e a campanha aponta para o fluxo.
 */
describe('schema do fluxo nativo', () => {
  it('cria fluxo e etapa com os valores padrão do PRD', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);

    const [flow] = await db.insert(schema.flows).values({ orgId: org.id, name: 'Cadência padrão', createdBy: user.id }).returning();
    expect(flow.status).toBe('draft');
    expect(flow.description).toBe('');
    expect(flow.aiBrief).toBe('');
    expect(flow.assignedTo).toBeNull();
    expect(flow.createdAt).toBeInstanceOf(Date);
    expect(flow.updatedAt).toBeInstanceOf(Date);

    const [step] = await db.insert(schema.flowSteps).values({
      flowId: flow.id, orgId: org.id, position: 0, type: 'invite',
    }).returning();
    expect(step.position).toBe(0);
    expect(step.delayDays).toBe(0);
    expect(step.condition).toBe('always');
    expect(step.useAi).toBe(false);
    expect(step.template).toBe('');
    expect(step.subject).toBe('');
    expect(step.mediaUrl).toBe('');
    expect(step.name).toBe('');
    expect(step.createdAt).toBeInstanceOf(Date);
  });

  it('a etapa guarda a operação, para o gate e a execução não dependerem do join', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    const [flow] = await db.insert(schema.flows).values({ orgId: org.id, name: 'Fluxo A' }).returning();
    await db.insert(schema.flowSteps).values([
      { flowId: flow.id, orgId: org.id, position: 0, type: 'whatsapp' },
      { flowId: flow.id, orgId: org.id, position: 1, type: 'email' },
    ]);

    const daOperacao = await db.select().from(schema.flowSteps).where(eq(schema.flowSteps.orgId, org.id));
    expect(daOperacao).toHaveLength(2);
    expect(daOperacao.map((s) => s.position)).toEqual([0, 1]);

    // Fluxo de outra operação não aparece na consulta da operação.
    const { org: outra } = await seedOrg(db, 'Parceiro B');
    const daOutra = await db.select().from(schema.flowSteps).where(eq(schema.flowSteps.orgId, outra.id));
    expect(daOutra).toHaveLength(0);
  });

  it('campanha aponta para o fluxo e desvincula quando o fluxo é apagado', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    const [flow] = await db.insert(schema.flows).values({ orgId: org.id, name: 'Fluxo da campanha' }).returning();
    const [camp] = await db.insert(schema.campaigns).values({
      orgId: org.id, ownerId: user.id, name: 'Campanha com fluxo', status: 'active', flowId: flow.id,
    }).returning();
    expect(camp.flowId).toBe(flow.id);

    await db.delete(schema.flows).where(eq(schema.flows.id, flow.id));
    const [depois] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, camp.id));
    expect(depois.flowId).toBeNull();
  });

  it('apagar o fluxo apaga as etapas dele (cascade) e nada fica órfão', async () => {
    const db = await testDb();
    const { org } = await seedOrg(db);
    const [flow] = await db.insert(schema.flows).values({ orgId: org.id, name: 'Fluxo temporário' }).returning();
    await db.insert(schema.flowSteps).values([
      { flowId: flow.id, orgId: org.id, position: 0, type: 'react' },
      { flowId: flow.id, orgId: org.id, position: 1, type: 'comment' },
    ]);
    expect(await db.select().from(schema.flowSteps)).toHaveLength(2);

    await db.delete(schema.flows).where(eq(schema.flows.id, flow.id));
    expect(await db.select().from(schema.flowSteps)).toHaveLength(0);
  });

  it('os índices do PRD existem', async () => {
    const db = await testDb();
    const nomes = rows(await db.execute(sql`
      select indexname from pg_indexes
      where tablename in ('flows', 'flow_steps') and schemaname = 'public'
    `)).map((r) => String(r.indexname));
    expect(nomes).toContain('flows_org_updated_idx');
    expect(nomes).toContain('flow_steps_flow_position_idx');
    expect(nomes).toContain('flow_steps_org_idx');
  });

  it('a coluna nova da campanha é a mesma que o drizzle conhece', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db);
    const [camp] = await db.insert(schema.campaigns).values({
      orgId: org.id, ownerId: user.id, name: 'Sem fluxo', status: 'draft',
    }).returning();
    expect(camp.flowId).toBeNull();
  });
});

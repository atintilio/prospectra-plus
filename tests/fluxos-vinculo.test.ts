import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DB } from '@/db';
import type { Ctx } from '@/lib/auth';
import * as schema from '@/db/schema';
import { seedOrg, testDb } from './helpers';

// Vínculo campanha ↔ fluxo (RF7): a action filtra pela operação da sessão e
// só aceita fluxo da mesma operação.

const state = vi.hoisted(() => ({ db: null as unknown as DB, ctx: null as unknown as Ctx }));
vi.mock('@/db', async (original) => ({ ...(await original<typeof import('@/db')>()), getDb: async () => state.db }));
vi.mock('@/lib/auth', () => ({
  requireOrg: async () => state.ctx,
  requireUser: async () => state.ctx,
  requireAdmin: async () => state.ctx,
  canManage: () => true,
  normalizeEmail: (e: string) => e,
  issueAccessLink: async () => 'token',
  switchOrg: async () => {},
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: () => {} }));

import { setCampaignFlowAction } from '@/app/(app)/actions';
import { listCampaignFlows, loadLinkedFlow } from '@/app/(app)/campanhas/flows';

async function setup() {
  const db = (state.db = await testDb());
  const { org, user } = await seedOrg(db);
  const other = await seedOrg(db, 'Parceiro B');
  state.ctx = { user, org, role: 'owner', sessionId: 'test' } as unknown as Ctx;
  const [camp] = await db.insert(schema.campaigns).values({
    orgId: org.id, ownerId: user.id, name: 'C1', status: 'draft', steps: [{ id: 's1', type: 'invite', delayDays: 0, condition: 'always', template: 'oi', useAi: false }],
  }).returning();
  const [flow] = await db.insert(schema.flows).values({ orgId: org.id, name: 'Fluxo A', status: 'active' }).returning();
  const [flowB] = await db.insert(schema.flows).values({ orgId: other.org.id, name: 'Fluxo B', status: 'active' }).returning();
  const [campB] = await db.insert(schema.campaigns).values({ orgId: other.org.id, ownerId: other.user.id, name: 'C2', status: 'draft', steps: [] }).returning();
  return { db, org, user, other, camp, flow, flowB, campB };
}

describe('vínculo campanha ↔ fluxo', () => {
  it('vincula um fluxo da mesma operação e desvincula depois', async () => {
    const { db, camp, flow } = await setup();
    const r = await setCampaignFlowAction(camp.id, flow.id);
    expect(r.error).toBeUndefined();
    expect(r.ok).toContain('Fluxo A');
    expect((await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, camp.id)))[0].flowId).toBe(flow.id);
    // A trilha da operação registra o vínculo.
    const audit = await db.select().from(schema.auditLog);
    expect(audit.map((a) => a.action)).toContain('campaign.flow_linked');

    const r2 = await setCampaignFlowAction(camp.id, null);
    expect(r2.error).toBeUndefined();
    expect((await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, camp.id)))[0].flowId).toBeNull();
    expect((await db.select().from(schema.auditLog)).map((a) => a.action)).toContain('campaign.flow_unlinked');
  });

  it('não aceita fluxo de outra operação', async () => {
    const { db, camp, flowB } = await setup();
    const r = await setCampaignFlowAction(camp.id, flowB.id);
    expect(r.error).toBe('Fluxo inválido.');
    expect((await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, camp.id)))[0].flowId).toBeNull();
  });

  it('não mexe em campanha de outra operação', async () => {
    const { db, campB, flow } = await setup();
    const r = await setCampaignFlowAction(campB.id, flow.id);
    expect(r.error).toBe('Campanha não encontrada.');
    expect((await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campB.id)))[0].flowId).toBeNull();
  });

  it('recusa identificador inválido sem quebrar', async () => {
    const { camp } = await setup();
    expect((await setCampaignFlowAction(camp.id, 'nao-e-uuid')).error).toBe('Fluxo inválido.');
    expect((await setCampaignFlowAction('nao-e-uuid', null)).error).toBe('Campanha inválida.');
  });

  it('o seletor só mostra os fluxos da operação, com a contagem de etapas', async () => {
    const { db, org, flow } = await setup();
    await db.insert(schema.flowSteps).values([
      { flowId: flow.id, orgId: org.id, position: 0, type: 'invite', delayDays: 0, condition: 'always', template: 'oi' },
      { flowId: flow.id, orgId: org.id, position: 1, type: 'message', delayDays: 2, condition: 'always', template: 'oi' },
    ]);
    const list = await listCampaignFlows(db, org.id);
    expect(list.map((f) => f.name)).toEqual(['Fluxo A']);
    expect(list[0].stepCount).toBe(2);
  });

  it('o fluxo vinculado traz as etapas na ordem da posição', async () => {
    const { db, org, flow } = await setup();
    await db.insert(schema.flowSteps).values([
      { flowId: flow.id, orgId: org.id, position: 1, type: 'message', delayDays: 2, condition: 'always', template: 'segundo' },
      { flowId: flow.id, orgId: org.id, position: 0, type: 'invite', delayDays: 0, condition: 'always', template: 'primeiro' },
    ]);
    const linked = await loadLinkedFlow(db, org.id, flow.id);
    expect(linked?.name).toBe('Fluxo A');
    expect(linked?.steps.map((s) => s.template)).toEqual(['primeiro', 'segundo']);
    expect(linked?.steps[0].delayDays).toBe(0);
    expect(await loadLinkedFlow(db, org.id, null)).toBeNull();
  });
});

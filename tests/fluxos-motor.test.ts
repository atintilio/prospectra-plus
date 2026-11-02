import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { completeAction, enrollLeads, runScheduler } from '@/lib/cadence';
import { resolveSteps } from '@/lib/flows/resolve';
import { seedOrg, testDb } from './helpers';

// FASE F3 do PRD docs/PRD-2026-11-02-FLUXO-NATIVO.md: o fluxo é MODELO e a
// campanha é a EXECUÇÃO. A cadência é a mesma: com `campaigns.flow_id` as etapas
// vêm do fluxo; sem fluxo, vêm das próprias etapas da campanha.

const day = (n: number) => new Date(Date.UTC(2026, 9, 15 + n, 13));

const campaignSteps: schema.CampaignStep[] = [
  { id: 'c1', type: 'invite', delayDays: 0, condition: 'always', template: 'Convite da campanha, {nome}!', useAi: false },
  { id: 'c2', type: 'message', delayDays: 2, condition: 'always', template: 'Mensagem da campanha, {nome}!', useAi: false },
];

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const [lead] = await db.insert(schema.leads).values({
    orgId: org.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana Souza', company: 'Acme',
  }).returning();
  const [flow] = await db.insert(schema.flows).values({
    orgId: org.id, name: 'Fluxo padrão', status: 'active', createdBy: user.id,
  }).returning();
  // Etapas do fluxo gravadas fora de ordem: a ordem é a `position`, não a inserção.
  await db.insert(schema.flowSteps).values([
    { flowId: flow.id, orgId: org.id, position: 1, type: 'message', name: 'Follow-up', delayDays: 2, condition: 'always', template: 'Follow-up do fluxo, {nome}!' },
    { flowId: flow.id, orgId: org.id, position: 0, type: 'invite', name: 'Primeiro contato', delayDays: 0, condition: 'always', template: 'Convite do fluxo, {nome}!' },
  ]);
  return { db, org, user, lead, flow };
}

describe('motor da cadência com fluxo (campanha = execução)', () => {
  it('campanha com fluxo executa as etapas do fluxo, na ordem da posição', async () => {
    const { db, org, user, lead, flow } = await setup();
    const [camp] = await db.insert(schema.campaigns).values({
      orgId: org.id, ownerId: user.id, name: 'Com fluxo', status: 'active', steps: campaignSteps, flowId: flow.id,
    }).returning();

    // A resolução devolve as etapas do fluxo (ordenadas por position) no formato do motor.
    const steps = await resolveSteps(db, camp);
    expect(steps.map((s) => s.type)).toEqual(['invite', 'message']);
    expect(steps.map((s) => s.template)).toEqual(['Convite do fluxo, {nome}!', 'Follow-up do fluxo, {nome}!']);
    expect(steps[0].delayDays).toBe(0);
    expect(steps[1].delayDays).toBe(2);

    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    expect((await runScheduler(db, { now: day(0) })).created).toBe(1);
    const [a1] = await db.select().from(schema.actions);
    // O tipo e o corpo vêm do passo do FLUXO, não das etapas da campanha.
    expect(a1.type).toBe('invite');
    expect(a1.body).toBe('Convite do fluxo, Ana!');
    expect(a1.stepIndex).toBe(0);

    await completeAction(db, org.id, user.id, a1.id, 'done', undefined, day(0));
    // O segundo passo do fluxo vence depois da espera do próprio passo.
    expect((await runScheduler(db, { now: day(1) })).created).toBe(0);
    expect((await runScheduler(db, { now: day(2) })).created).toBe(1);
    const a2 = (await db.select().from(schema.actions).where(eq(schema.actions.stepIndex, 1)))[0];
    expect(a2.type).toBe('message');
    expect(a2.body).toBe('Follow-up do fluxo, Ana!');
    await completeAction(db, org.id, user.id, a2.id, 'done', undefined, day(2));
    expect((await db.select().from(schema.enrollments))[0].state).toBe('done');
  });

  it('campanha sem fluxo segue exatamente como antes (regressão)', async () => {
    const { db, org, user, lead } = await setup();
    const [camp] = await db.insert(schema.campaigns).values({
      orgId: org.id, ownerId: user.id, name: 'Sem fluxo', status: 'active', steps: campaignSteps,
    }).returning();

    const steps = await resolveSteps(db, camp);
    expect(steps.map((s) => s.id)).toEqual(['c1', 'c2']);

    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    expect((await runScheduler(db, { now: day(0) })).created).toBe(1);
    const [a1] = await db.select().from(schema.actions);
    expect(a1.type).toBe('invite');
    expect(a1.body).toBe('Convite da campanha, Ana!');
    await completeAction(db, org.id, user.id, a1.id, 'done', undefined, day(0));
    expect((await runScheduler(db, { now: day(2) })).created).toBe(1);
    const a2 = (await db.select().from(schema.actions).where(eq(schema.actions.stepIndex, 1)))[0];
    expect(a2.body).toBe('Mensagem da campanha, Ana!');
  });

  it('gate desligado: a etapa do fluxo não age e não vira tarefa na fila', async () => {
    const { db, org, user, lead } = await setup();
    // LinkedIn desligado na operação: convite não pode agir.
    await db.update(schema.orgs).set({ linkedinEnabled: false }).where(eq(schema.orgs.id, org.id));
    const [flow] = await db.insert(schema.flows).values({ orgId: org.id, name: 'Fluxo com gate', status: 'active' }).returning();
    await db.insert(schema.flowSteps).values([
      { flowId: flow.id, orgId: org.id, position: 0, type: 'invite', delayDays: 0, condition: 'always', template: 'Convite do fluxo, {nome}!' },
      { flowId: flow.id, orgId: org.id, position: 1, type: 'email', delayDays: 0, condition: 'always', template: 'E-mail do fluxo, {nome}!', subject: 'Oi {nome}' },
    ]);
    const [camp] = await db.insert(schema.campaigns).values({
      orgId: org.id, ownerId: user.id, name: 'Gate off', status: 'active', steps: campaignSteps, flowId: flow.id,
    }).returning();

    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    expect((await runScheduler(db, { now: day(0) })).created).toBe(0);
    // Nenhuma tarefa na fila: o passo bloqueado não virou ação.
    expect(await db.select().from(schema.actions)).toHaveLength(0);
    // A cadência avançou para o próximo passo do fluxo (o e-mail), pulando o de LinkedIn.
    const [enr] = await db.select().from(schema.enrollments);
    expect(enr.stepIndex).toBe(1);
    expect(enr.state).toBe('running');

    // O passo livre (e-mail) age normalmente.
    expect((await runScheduler(db, { now: day(0) })).created).toBe(1);
    const [a] = await db.select().from(schema.actions);
    expect(a.type).toBe('email');
    expect(a.body).toBe('E-mail do fluxo, Ana!');
  });

  it('fluxo de outra operação não entra na campanha', async () => {
    const { db, org, user } = await setup();
    const other = await seedOrg(db, 'Parceiro B');
    const [flowB] = await db.insert(schema.flows).values({ orgId: other.org.id, name: 'Fluxo B', status: 'active' }).returning();
    await db.insert(schema.flowSteps).values([
      { flowId: flowB.id, orgId: other.org.id, position: 0, type: 'invite', delayDays: 0, condition: 'always', template: 'Convite do outro, {nome}!' },
    ]);
    const [camp] = await db.insert(schema.campaigns).values({
      orgId: org.id, ownerId: user.id, name: 'Isolada', status: 'active', steps: campaignSteps, flowId: flowB.id,
    }).returning();
    // A campanha aponta (ilegal) para o fluxo de outra operação: nada é executado.
    const steps = await resolveSteps(db, camp);
    expect(steps).toEqual([]);
  });
});

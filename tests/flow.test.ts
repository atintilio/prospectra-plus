import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import type { FlowGraph } from '@/lib/flow';
import { completeAction, enrollLeads, markOutcome, runScheduler } from '@/lib/cadence';
import { seedOrg, testDb } from './helpers';

const day = (n: number) => new Date(Date.UTC(2026, 9, 15 + n, 13));

// Fluxo com ramificação estilo n8n: convite → condição (aceito?) → sim: mensagem A · não: reagir ao post
const branchGraph: FlowGraph = {
  nodes: [
    { id: 'trigger', type: 'trigger', pos: { x: 60, y: 200 } },
    { id: 'a1', type: 'action', action: 'invite', waitDays: 0, condition: 'always', template: 'Oi {nome}, vi seu trabalho na {empresa}.', useAi: false, pos: { x: 300, y: 80 } },
    { id: 'c1', type: 'branch', if: 'accepted', pos: { x: 540, y: 80 } },
    { id: 'a2', type: 'action', action: 'message', waitDays: 1, condition: 'always', template: 'Obrigado por aceitar, {nome}!', useAi: false, pos: { x: 780, y: 20 } },
    { id: 'a3', type: 'action', action: 'react', waitDays: 2, condition: 'always', template: '', useAi: false, pos: { x: 780, y: 160 } },
  ],
  edges: [
    { id: 'e1', from: 'trigger', to: 'a1' },
    { id: 'e2', from: 'a1', to: 'c1' },
    { id: 'e3', from: 'c1', to: 'a2', label: 'yes' },
    { id: 'e4', from: 'c1', to: 'a3', label: 'no' },
  ],
};

async function setup(graph?: FlowGraph) {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'Flow', status: 'active', steps: [], ...(graph ? { graph } : {}) }).returning();
  const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana Souza', company: 'Acme' }).returning();
  return { db, org, user, camp, lead };
}

describe('motor de fluxo (estilo n8n)', () => {
  it('ramificação: caminho "não" roda enquanto o convite não é aceito', async () => {
    const { db, org, user, camp, lead } = await setup(branchGraph);
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    expect((await runScheduler(db, { now: day(0) })).created).toBe(1); // convite
    const [invite] = await db.select().from(schema.actions).where(eq(schema.actions.type, 'invite'));
    await completeAction(db, org.id, user.id, invite.id, 'done', undefined, day(0));
    // condição: sem aceite → caminho "não" (reagir a post), com 2 dias de espera
    expect((await runScheduler(db, { now: day(1) })).created).toBe(0);
    expect((await runScheduler(db, { now: day(2) })).created).toBe(1);
    const reacts = await db.select().from(schema.actions).where(eq(schema.actions.type, 'react'));
    expect(reacts).toHaveLength(1);
    expect(reacts[0].stepIndex).toBe(1);
    // aceite depois não reexecuta o caminho "sim": a inscrição já seguiu pelo "não"
    await db.update(schema.leads).set({ stage: 'connected' }).where(eq(schema.leads.id, lead.id));
    expect((await runScheduler(db, { now: day(3) })).created).toBe(0);
  });

  it('campanha antiga sem grafo: passos lineares continuam funcionando (migração implícita)', async () => {
    const { db, org, user, camp, lead } = await setup();
    const steps: schema.CampaignStep[] = [
      { id: 's1', type: 'invite', delayDays: 0, condition: 'always', template: 'Oi {nome}.', useAi: false },
      { id: 's2', type: 'message', delayDays: 2, condition: 'accepted', template: 'Bem-vindo, {nome}!', useAi: false },
    ];
    await db.update(schema.campaigns).set({ steps }).where(eq(schema.campaigns.id, camp.id));
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    expect((await runScheduler(db, { now: day(0) })).created).toBe(1);
    const [invite] = await db.select().from(schema.actions).where(eq(schema.actions.type, 'invite'));
    await completeAction(db, org.id, user.id, invite.id, 'done', undefined, day(0));
    expect((await runScheduler(db, { now: day(1) })).created).toBe(0);
    await runScheduler(db, { now: day(2) });
    const [enr] = await db.select().from(schema.enrollments);
    expect(enr.state).toBe('waiting_accept'); // passo 2 aguarda aceite, como antes
    await markOutcome(db, org.id, user.id, lead.id, 'accepted', day(3));
    expect((await runScheduler(db, { now: day(3) })).created).toBe(1);
    const [msg] = await db.select().from(schema.actions).where(eq(schema.actions.type, 'message'));
    expect(msg.body).toBe('Bem-vindo, Ana!'); // {nome} vira primeiro nome
  });

  it('cada convite enviado enfileira a análise de inteligência comercial do lead', async () => {
    const { db, org, user, camp, lead } = await setup();
    const steps: schema.CampaignStep[] = [{ id: 's1', type: 'invite', delayDays: 0, condition: 'always', template: 'Oi {nome}.', useAi: false }];
    await db.update(schema.campaigns).set({ steps }).where(eq(schema.campaigns.id, camp.id));
    await enrollLeads(db, org.id, camp.id, [lead.id], day(0));
    await runScheduler(db, { now: day(0) });
    const [invite] = await db.select().from(schema.actions).where(eq(schema.actions.type, 'invite'));
    await completeAction(db, org.id, user.id, invite.id, 'done', undefined, day(0));
    const jobs = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.leadId, lead.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].orgId).toBe(org.id);
    expect(jobs[0].userId).toBe(user.id);
  });
});

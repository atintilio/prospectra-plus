import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { DispatchError, receiveDispatch } from '@/lib/dispatch';
import { seedOrg, testDb } from './helpers';

const steps: schema.CampaignStep[] = [
  { id: 's1', type: 'invite', delayDays: 0, condition: 'always', template: 'Oi {nome}.', useAi: false },
  { id: 's2', type: 'message', delayDays: 1, condition: 'accepted', template: 'Obrigado, {nome}!', useAi: false },
];

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const [camp] = await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'C1', status: 'active', steps }).returning();
  const [lead] = await db.insert(schema.leads).values({ orgId: org.id, ownerId: user.id, linkedinUrl: 'https://www.linkedin.com/in/ana', fullName: 'Ana Souza', company: 'Acme', stage: 'invited' }).returning();
  return { db, org, user, camp, lead };
}

const now = new Date(Date.UTC(2026, 10, 18, 13));

describe('dispatch inbound (laço automático do worker Go)', () => {
  it('aceite reportado pelo worker libera os passos "após aceite" sem intervenção humana', async () => {
    const { db, org, camp, lead } = await setup();
    const [enr] = await db.insert(schema.enrollments).values({ orgId: org.id, campaignId: camp.id, leadId: lead.id, stepIndex: 1, state: 'waiting_accept', nextRunAt: now }).returning();

    const res = await receiveDispatch(db, { kind: 'event', event: 'accepted', leadId: lead.id }, now);
    expect(res).toMatchObject({ ok: true, event: 'accepted', stage: 'connected' });

    const [updatedLead] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
    expect(updatedLead.stage).toBe('connected');
    const [updatedEnr] = await db.select().from(schema.enrollments).where(eq(schema.enrollments.id, enr.id));
    expect(updatedEnr.state).toBe('running');
    const [ev] = await db.select().from(schema.events).where(eq(schema.events.type, 'invite_accepted'));
    expect(ev).toBeTruthy();
  });

  it('resposta reportada encerra a cadência do lead e pula ações pendentes', async () => {
    const { db, org, user, camp, lead } = await setup();
    await db.update(schema.leads).set({ stage: 'connected' }).where(eq(schema.leads.id, lead.id));
    const [enr] = await db.insert(schema.enrollments).values({ orgId: org.id, campaignId: camp.id, leadId: lead.id, stepIndex: 1, state: 'running', nextRunAt: now }).returning();
    await db.insert(schema.actions).values({ orgId: org.id, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id, userId: user.id, stepIndex: 1, type: 'message', body: 'Oi', dueDate: '2026-11-18', status: 'pending' });

    const res = await receiveDispatch(db, { kind: 'event', event: 'replied', leadId: lead.id }, now);
    expect(res).toMatchObject({ ok: true, event: 'replied', stage: 'replied' });

    const [updatedEnr] = await db.select().from(schema.enrollments).where(eq(schema.enrollments.id, enr.id));
    expect(updatedEnr.state).toBe('stopped');
    const [action] = await db.select().from(schema.actions).where(and(eq(schema.actions.leadId, lead.id), eq(schema.actions.status, 'skipped')));
    expect(action).toBeTruthy();
  });

  it('status "checkpoint" marca a conta como bloqueada e guarda a verificação 2FA', async () => {
    const { db, org, user } = await setup();
    const [acc] = await db.insert(schema.linkedinAccounts).values({ orgId: org.id, userId: user.id, status: 'connected', providerId: 'go-1' }).returning();

    const res = await receiveDispatch(db, {
      kind: 'account', accountId: acc.id, orgId: org.id, status: 'checkpoint',
      screenshotUrl: 'https://bucket.s3.amazonaws.com/x.png',
    }, now);
    expect(res).toMatchObject({ ok: true, status: 'blocked' });

    const [updated] = await db.select().from(schema.linkedinAccounts).where(eq(schema.linkedinAccounts.id, acc.id));
    expect(updated.status).toBe('blocked');
    expect(updated.lastError).toContain('x.png');
  });

  it('isolamento: o worker não mexe em conta de outra organização', async () => {
    const { db, org, user } = await setup();
    const other = await seedOrg(db, 'Parceiro B');
    const [acc] = await db.insert(schema.linkedinAccounts).values({ orgId: org.id, userId: user.id, status: 'connected' }).returning();
    await expect(receiveDispatch(db, { kind: 'account', accountId: acc.id, orgId: other.org.id, status: 'blocked' }, now))
      .rejects.toBeInstanceOf(DispatchError);
  });

  it('evento inválido é recusado', async () => {
    const { db, lead } = await setup();
    await expect(receiveDispatch(db, { kind: 'event', event: 'won', leadId: lead.id }, now)).rejects.toBeInstanceOf(DispatchError);
  });

  it('compatibilidade: corpo sem "kind" continua tratado como resultado de ação', async () => {
    const { db, org, user, camp, lead } = await setup();
    const [enr] = await db.insert(schema.enrollments).values({ orgId: org.id, campaignId: camp.id, leadId: lead.id, stepIndex: 0, state: 'running', nextRunAt: now }).returning();
    const [action] = await db.insert(schema.actions).values({ orgId: org.id, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id, userId: user.id, stepIndex: 0, type: 'invite', body: 'Oi', dueDate: '2026-11-18', status: 'pending' }).returning();
    const res = await receiveDispatch(db, { state: 'sent', actionId: action.id, providerId: 'go-1' }, now);
    expect(res).toMatchObject({ ok: true, status: 'done', dispatchState: 'sent' });
  });
});

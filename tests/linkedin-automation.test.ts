import { test, expect, vi, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema, type DB } from '@/db';
import { runLinkedinQueue, type LinkedInExecutor } from '@/lib/linkedin/automation';

afterEach(() => { delete process.env.LINKEDIN_AUTOMATION_ENABLED; });

async function seedAction(db: DB, orgId: string, userId: string, type: 'invite' | 'message' = 'invite') {
  const [lead] = await db.insert(schema.leads).values({ orgId, ownerId: userId, linkedinUrl: `https://linkedin.com/in/${crypto.randomUUID()}`, fullName: 'Lead' }).returning();
  const [camp] = await db.insert(schema.campaigns).values({ orgId, ownerId: userId, name: 'C', status: 'active', steps: [{ id: 's0', type, delayDays: 0, condition: 'always', template: 'oi', useAi: false }] }).returning();
  const [enr] = await db.insert(schema.enrollments).values({ orgId, campaignId: camp.id, leadId: lead.id }).returning();
  const [action] = await db.insert(schema.actions).values({ orgId, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id, userId, stepIndex: 0, type, body: 'oi', dueDate: '2026-10-28' }).returning();
  return { lead, action };
}

const okExecutor = (): LinkedInExecutor => ({ dispatch: vi.fn(async () => ({ state: 'sent' as const, providerId: 'x' })) });

test('desligado por padrão: no-op, não chama o executor, ação fica pendente', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'LI A');
  const { action } = await seedAction(db, a.org.id, a.user.id);
  const exec = okExecutor();
  expect(await runLinkedinQueue(db, { executor: exec })).toEqual({ processed: 0, dispatched: 0, uncertain: 0, skipped: 0 });
  expect(exec.dispatch).not.toHaveBeenCalled();
  const [after] = await db.select().from(schema.actions).where(eq(schema.actions.id, action.id));
  expect(after.status).toBe('pending');
});

test('habilitado: despacha, conclui a ação, registra o evento e o recibo', async () => {
  process.env.LINKEDIN_AUTOMATION_ENABLED = 'true';
  const db = await testDb();
  const a = await seedOrg(db, 'LI B');
  const { lead, action } = await seedAction(db, a.org.id, a.user.id, 'invite');
  const res = await runLinkedinQueue(db, { executor: okExecutor() });
  expect(res.dispatched).toBe(1);
  const [after] = await db.select().from(schema.actions).where(eq(schema.actions.id, action.id));
  expect(after.status).toBe('done');
  const ev = await db.select().from(schema.events).where(and(eq(schema.events.leadId, lead.id), eq(schema.events.type, 'invite_sent')));
  expect(ev).toHaveLength(1);
  const [r] = await db.select().from(schema.linkedinDispatches).where(eq(schema.linkedinDispatches.actionId, action.id));
  expect(r.state).toBe('sent');
});

test('limite diário zera o despacho de convites; a ação permanece pendente', async () => {
  process.env.LINKEDIN_AUTOMATION_ENABLED = 'true';
  const db = await testDb();
  const a = await seedOrg(db, 'LI C');
  await db.update(schema.users).set({ dailyInvites: 0 }).where(eq(schema.users.id, a.user.id));
  const { action } = await seedAction(db, a.org.id, a.user.id, 'invite');
  const exec = okExecutor();
  const res = await runLinkedinQueue(db, { executor: exec });
  expect(res).toMatchObject({ dispatched: 0, skipped: 1 });
  expect(exec.dispatch).not.toHaveBeenCalled();
  const [after] = await db.select().from(schema.actions).where(eq(schema.actions.id, action.id));
  expect(after.status).toBe('pending');
});

test('resultado incerto não é reenviado automaticamente', async () => {
  process.env.LINKEDIN_AUTOMATION_ENABLED = 'true';
  const db = await testDb();
  const a = await seedOrg(db, 'LI D');
  const { action } = await seedAction(db, a.org.id, a.user.id, 'message');
  const exec: LinkedInExecutor = { dispatch: vi.fn(async () => ({ state: 'unknown' as const })) };
  await runLinkedinQueue(db, { executor: exec });
  await runLinkedinQueue(db, { executor: exec }); // segunda passada não deve reenviar
  expect(exec.dispatch).toHaveBeenCalledTimes(1);
  const [r] = await db.select().from(schema.linkedinDispatches).where(eq(schema.linkedinDispatches.actionId, action.id));
  expect(r.state).toBe('unknown');
  const [after] = await db.select().from(schema.actions).where(eq(schema.actions.id, action.id));
  expect(after.status).toBe('pending');
});

import { describe, expect, it } from 'vitest';
import { and, count, eq } from 'drizzle-orm';
import { schema } from '@/db';
import { seedLinkedIn, DEMO_LINKEDIN_EMAIL } from '@/lib/demo-linkedin';
import { seedOrg, testDb } from './helpers';

/** Momento fixo: o seed precisa ser determinístico. */
const NOW = new Date('2026-11-02T12:00:00.000Z');

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Demonstração · Atlas Consultoria');
  await db.update(schema.orgs).set({ isDemo: true }).where(eq(schema.orgs.id, org.id));
  const [lead] = await db
    .insert(schema.leads)
    .values({
      orgId: org.id,
      ownerId: user.id,
      fullName: 'Mariana Duarte',
      headline: 'CFO',
      company: 'Metalúrgica Vale do Sul',
      stage: 'invited',
      linkedinUrl: 'https://www.linkedin.com/in/mariana-duarte-demo',
    })
    .returning();
  return { db, org, user, leads: [{ id: lead.id, fullName: lead.fullName, company: lead.company, headline: lead.headline }] };
}

describe('seed de LinkedIn da demonstração', () => {
  it('cria o João da Silva com a conta conectada (simulada)', async () => {
    const { db, org } = await setup();
    const summary = await seedLinkedIn({ db, orgId: org.id, now: NOW, leads: [] });
    expect(summary.userId).toBeTruthy();

    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_LINKEDIN_EMAIL));
    expect(user?.name).toBe('João da Silva');
    expect(user?.status).toBe('active');

    const [conn] = await db
      .select()
      .from(schema.linkedinConnections)
      .where(eq(schema.linkedinConnections.orgId, org.id));
    expect(conn?.status).toBe('connected');
    expect(conn?.profileName).toBe('João da Silva');
    // Nenhum segredo em lugar nenhum: só o perfil, como manda o PRD.
    expect(conn?.providerId).toBe('demo-joao-silva');
  });

  it('é idempotente: rodar de novo não duplica', async () => {
    const { db, org, leads } = await setup();
    await seedLinkedIn({ db, orgId: org.id, now: NOW, leads });
    await seedLinkedIn({ db, orgId: org.id, now: NOW, leads });

    const [users] = await db.select({ n: count() }).from(schema.users).where(eq(schema.users.email, DEMO_LINKEDIN_EMAIL));
    expect(users?.n).toBe(1);
    const [conns] = await db.select({ n: count() }).from(schema.linkedinConnections).where(eq(schema.linkedinConnections.orgId, org.id));
    expect(conns?.n).toBe(1);
  });

  it('cria a campanha de LinkedIn e a fila pendente do João', async () => {
    const { db, org, leads } = await setup();
    const summary = await seedLinkedIn({ db, orgId: org.id, now: NOW, leads });
    expect(summary.pendingActions).toBe(1);

    const [camp] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, summary.campaignId));
    expect(camp?.name).toBe('Prospecção ativa · LinkedIn');
    expect(camp?.steps?.map((s) => s.type)).toContain('invite');

    const pending = await db
      .select()
      .from(schema.actions)
      .where(and(eq(schema.actions.orgId, org.id), eq(schema.actions.userId, summary.userId)));
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('pending');
  });

  it('liga o LinkedIn na operação de demonstração (é simulação)', async () => {
    const { db, org } = await setup();
    await seedLinkedIn({ db, orgId: org.id, now: NOW, leads: [] });
    const [row] = await db.select({ on: schema.orgs.linkedinEnabled }).from(schema.orgs).where(eq(schema.orgs.id, org.id));
    expect(row?.on).toBe(true);
  });
});

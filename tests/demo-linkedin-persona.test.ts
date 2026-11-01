import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@/db';
import { ensureDemo } from '@/lib/demo';
import { DEMO_LINKEDIN_EMAIL } from '@/lib/demo-linkedin';
import { seedOrg, testDb } from './helpers';

describe('a demo tem a persona do LinkedIn', () => {
  it('cria a conta simulada do João da Silva e ele é membro da operação', async () => {
    const db = await testDb();
    const { user } = await seedOrg(db, 'Real');
    const orgId = await ensureDemo(db, user);

    const [conn] = await db
      .select()
      .from(schema.linkedinConnections)
      .where(eq(schema.linkedinConnections.orgId, orgId));
    expect(conn?.profileName).toBe('João da Silva');
    expect(conn?.status).toBe('connected');

    const [membership] = await db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.orgId, orgId));
    expect(membership).toBeTruthy();

    const [joao] = await db.select().from(schema.users).where(eq(schema.users.email, DEMO_LINKEDIN_EMAIL));
    expect(joao?.status).toBe('active');
  });

  it('rodar o seed de novo não duplica a campanha do João', async () => {
    const db = await testDb();
    const { user } = await seedOrg(db, 'Real');
    const orgId = await ensureDemo(db, user);
    await ensureDemo(db, user);

    const camps = await db
      .select()
      .from(schema.campaigns)
      .where(eq(schema.campaigns.orgId, orgId));
    expect(camps.filter((c) => c.name === 'Prospecção ativa · LinkedIn')).toHaveLength(1);
    expect(camps).toHaveLength(4);
  });
});

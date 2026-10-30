import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema, type DB } from '@/db';
import { ensureMasterOrg } from '@/lib/membership';

describe('admin master sem operação (banco recriado)', () => {
  it('cria a operação e a equipe de dono quando não existe nada', async () => {
    const db = await testDb();
    const [user] = await db.insert(schema.users)
      .values({ email: 'dono@exemplo.com', name: 'Dono', status: 'active', platformRole: 'admin' }).returning();

    const orgId = await ensureMasterOrg(db, user.id);

    const [membership] = await db.select().from(schema.memberships)
      .where(eq(schema.memberships.userId, user.id));
    expect(membership.orgId).toBe(orgId);
    expect(membership.role).toBe('owner');

    const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId));
    expect(org.name).toBe('Argus Prime');
    expect(org.isDemo).toBe(false);
    expect(org.active).toBe(true);
  });

  it('não duplica a equipe quando o master já tem operação', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Parceiro X');
    await db.update(schema.users).set({ platformRole: 'admin' }).where(eq(schema.users.id, user.id));

    const orgId = await ensureMasterOrg(db, user.id);
    expect(orgId).toBe(org.id);

    const teams = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, user.id));
    expect(teams).toHaveLength(1);
  });

  it('reaproveita a operação existente em vez de criar outra', async () => {
    const db = await testDb();
    const [user] = await db.insert(schema.users)
      .values({ email: 'mestre@exemplo.com', name: 'Mestre', status: 'active', platformRole: 'admin' }).returning();
    const [org] = await db.insert(schema.orgs).values({ name: 'Argus Prime', seats: 10, searchCreditsMonth: 100 }).returning();

    const orgId = await ensureMasterOrg(db, user.id);
    expect(orgId).toBe(org.id);

    const all = await db.select().from(schema.orgs);
    expect(all).toHaveLength(1);
  });

  it('deixa o time de demonstração intacto', async () => {
    const db = await testDb();
    const [user] = await db.insert(schema.users)
      .values({ email: 'demo@exemplo.com', name: 'Demo', status: 'active', platformRole: 'admin' }).returning();
    const [demo] = await db.insert(schema.orgs).values({ name: 'Demonstração', isDemo: true }).returning();

    const orgId = await ensureMasterOrg(db, user.id);
    expect(orgId).not.toBe(demo.id);

    const [membership] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, user.id));
    expect(membership.orgId).toBe(orgId);
  });
});

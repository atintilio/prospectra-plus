import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import * as schema from '../src/db/schema';
import { ensureTeam } from '../src/lib/membership';
import { seedOrg, testDb } from './helpers';

test('conta migrada do v1 sem equipe entra no parceiro do dono', async () => {
  const db = await testDb();
  const { org } = await seedOrg(db, 'Argus');
  const [u] = await db.insert(schema.users).values({ email: 'moises@x.com', name: 'Moisés', status: 'active' }).returning();
  expect(await ensureTeam(db, u.id, 'admin')).toBe(true);
  const [m] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, u.id));
  expect(m.orgId).toBe(org.id);
  expect(m.role).toBe('manager');
  expect(await ensureTeam(db, u.id, 'admin')).toBe(false);
});

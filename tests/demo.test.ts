import { count, eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import * as schema from '../src/db/schema';
import { ensureDemo, findDemoOrg } from '../src/lib/demo';
import { seedOrg, testDb } from './helpers';

test('demo é criada uma vez, isolada e completa', async () => {
  const db = await testDb();
  const { user, org: prod } = await seedOrg(db, 'Real');
  const id = await ensureDemo(db, user);
  expect(await ensureDemo(db, user)).toBe(id);
  expect(await findDemoOrg(db, user.id)).toBe(id);
  const n = async (t: any) => (await db.select({ n: count() }).from(t).where(eq(t.orgId, id)))[0].n;
  expect(await n(schema.leads)).toBeGreaterThan(20);
  expect(await n(schema.campaigns)).toBe(3);
  expect(await n(schema.actions)).toBeGreaterThan(5);
  expect(await n(schema.events)).toBeGreaterThan(300);
  expect((await db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.orgId, prod.id)))[0].n).toBe(0);
});

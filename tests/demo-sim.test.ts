import { count, eq } from 'drizzle-orm';
import { expect, test } from 'vitest';
import * as schema from '../src/db/schema';
import { ensureDemo } from '../src/lib/demo';
import { addSearchResults, searchDemoLeads, seedFeed, simulateCycle } from '../src/lib/demo-sim';
import { seedOrg, testDb } from './helpers';

test('busca simulada, piloto automático e adicionar leads', async () => {
  const db = await testDb();
  const { user } = await seedOrg(db, 'Real');
  const orgId = await ensureDemo(db, user);
  await seedFeed(db, orgId);
  const feedN = async () => (await db.select({ n: count() }).from(schema.simFeed).where(eq(schema.simFeed.orgId, orgId)))[0].n;
  const before = await feedN();
  expect(before).toBeGreaterThan(8);
  const r = await simulateCycle(db, orgId);
  expect(r.sent).toBeGreaterThan(0);
  expect(await feedN()).toBeGreaterThan(before);
  const found = searchDemoLeads('CFO indústria Santa Catarina');
  expect(found.length).toBe(8);
  expect(found[0].headline).toMatch(/CFO|Diretor|CEO|Controller|Gerente|Head|Sócio/);
  expect(await addSearchResults(db, orgId, user.id, found.slice(0, 3).map((f) => f.linkedinUrl), 'x')).toBe(3);
  expect(await addSearchResults(db, orgId, user.id, found.slice(0, 3).map((f) => f.linkedinUrl), 'x')).toBe(0);
});

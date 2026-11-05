import { expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { ensureDemo } from '@/lib/demo';
import { demoExists } from '@/lib/demo-reset';
import { DEMO_DISPLAY_NAME, displayOrgName } from '@/lib/demo-name';
import { testDb, seedOrg } from './helpers';

/**
 * Botão de demonstração no topo (decisão do dono em 05/11/2026):
 * - fora da demonstração, o botão só aparece para quem já tem operação de demo;
 * - dentro da demonstração, o nome exibido é o rótulo genérico (o nome fictício
 *   da empresa continua no banco, mas ninguém o vê).
 */

test('o nome exibido da demo é "Ambiente de demonstração" (o banco não muda)', async () => {
  const db = await testDb();
  const { user } = await seedOrg(db, 'Real');
  const demoId = await ensureDemo(db, user);
  const [demoOrg] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, demoId));
  expect(demoOrg.name).toBe('Demonstração · Atlas Consultoria'); // nome no banco: intacto
  expect(displayOrgName(demoOrg)).toBe(DEMO_DISPLAY_NAME);
  expect(displayOrgName({ name: 'Argus Prime', isDemo: false })).toBe('Argus Prime');
});

test('o botão de demo aparece só para quem já tem operação de demonstração', async () => {
  const db = await testDb();
  const { user } = await seedOrg(db, 'Parceiro');
  expect(await demoExists(db, user.id)).toBe(false);
  await ensureDemo(db, user);
  expect(await demoExists(db, user.id)).toBe(true);
});

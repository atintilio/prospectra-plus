import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type { DB } from '@/db';

export async function testDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return db as unknown as DB;
}

/**
 * Cria uma operação de teste com o dono ativo.
 *
 * O LinkedIn vem **ligado** por padrão: convites e mensagens são o canal
 * principal do produto e o gate é testado à parte (tests/campaign-features.test.ts).
 */
export async function seedOrg(db: DB, name = 'Parceiro A') {
  const [org] = await db.insert(schema.orgs).values({ name, linkedinEnabled: true }).returning();
  const [user] = await db.insert(schema.users).values({ email: `${name.replace(/\W/g, '').toLowerCase()}@x.com`, name, status: 'active' }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: user.id, role: 'owner' });
  return { org, user };
}

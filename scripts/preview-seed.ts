/** Seed local de PREVIEW (não é usado em produção): cria usuário demo + ambiente de demonstração. */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import type { DB } from '../src/db';
import { hashPassword } from '../src/lib/crypto';
import { ensureDemo, findDemoOrg } from '../src/lib/demo';

export async function main() {
  const path = process.env.PREVIEW_DB || '.data/preview.db';
  const raw = drizzle(new PGlite(path), { schema });
  await migrate(raw, { migrationsFolder: 'drizzle' });
  const db = raw as unknown as DB;

  const email = 'preview@prospectra.dev';
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) {
    [user] = await db.insert(schema.users).values({
      email, name: 'Preview', status: 'active',
      passwordHash: await hashPassword('prospectra2026'),
    }).returning();
  } else {
    await db.update(schema.users).set({ status: 'active', passwordHash: await hashPassword('prospectra2026') }).where(eq(schema.users.id, user.id));
  }
  const existingDemo = await findDemoOrg(db, user.id);
  const orgId = existingDemo ?? (await ensureDemo(db, { id: user.id, name: user.name }));
  console.log('PREVIEW_OK', user.email, orgId);
}

// Direto via tsx: roda. Sob vitest: o teste importa e aguarda o main() explicitamente.
if (!process.env.VITEST) main();

import 'server-only';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzlePg<typeof schema>>;

const globalForDb = globalThis as unknown as { __prospectraDb?: Promise<DB> };

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL não configurada');
  if (url.startsWith('pglite://')) {
    // Banco local de desenvolvimento/testes (Postgres em WebAssembly).
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const client = new PGlite(url.slice('pglite://'.length));
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: 'drizzle' });
    return db as unknown as DB;
  }
  const client = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return drizzlePg(client, { schema });
}

export function getDb(): Promise<DB> {
  globalForDb.__prospectraDb ??= create();
  return globalForDb.__prospectraDb;
}

export { schema };

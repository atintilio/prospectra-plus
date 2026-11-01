import 'server-only';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzlePg<typeof schema>>;

const globalForDb = globalThis as unknown as { __prospectraDb?: Promise<DB> };

/**
 * URL do banco.
 *
 * No Node (VPS) vem da env var. No Cloudflare Workers vem do binding
 * HYPERDRIVE (a senha nunca fica no codigo nem no Worker).
 */
async function resolveUrl(): Promise<string> {
  try {
    const mod = (await import('@opennextjs/cloudflare')) as {
      getCloudflareContext?: () => { env?: Record<string, { connectionString?: string } | undefined> };
    };
    const hyper = mod.getCloudflareContext?.()?.env?.HYPERDRIVE;
    if (hyper?.connectionString) return hyper.connectionString;
  } catch {
    // Fora do Cloudflare (Node/VPS): segue com a env var.
  }
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL não configurada');
  return url;
}

async function create(): Promise<DB> {
  const url = await resolveUrl();
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

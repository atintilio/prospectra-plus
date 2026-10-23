// Aplica as migrações do banco antes do build (Vercel). Sem DATABASE_URL, apenas avisa.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { syncUsers } from './user-sync.mjs';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url || url.startsWith('pglite://')) {
  console.log('[migrate] sem DATABASE_URL de Postgres; pulando migrações.');
  process.exit(0);
}
const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
if (process.env.BLOB_READ_WRITE_TOKEN) {
  const { get } = await import('@vercel/blob');
  const blob = await get('prospectra/auth.json', { access: 'private', useCache: false });
  if (!blob) throw new Error('Account migration source unavailable; deployment stopped.');
  const source = JSON.parse(await new Response(blob.stream).text());
  if (!Array.isArray(source.users)) throw new Error('Invalid account migration source.');
  const total = await client.begin(async tx => syncUsers(async (query, params) => Array.from(await tx.unsafe(query, params)), source.users, process.env.MASTER_USER_EMAIL));
  console.log(`[migrate] ${total} contas incorporadas; credenciais e bloqueios existentes preservados.`);
}
await client.end();
console.log('[migrate] banco atualizado.');


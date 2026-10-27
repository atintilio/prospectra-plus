// Aplica as migrações do banco antes do build (Vercel ou VPS). Sem DATABASE_URL, apenas avisa.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { syncUsers } from './user-sync.mjs';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url || url.startsWith('pglite://')) {
  console.log('[migrate] sem DATABASE_URL de Postgres; pulando migrações.');
  process.exit(0);
}
const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
const legacyAuthFile = process.env.LEGACY_AUTH_FILE || '/etc/prospectra/auth.json';
try {
  const raw = await readFile(legacyAuthFile, 'utf8');
  const source = JSON.parse(raw);
  if (!Array.isArray(source.users)) throw new Error('Invalid account migration source.');
  const total = await client.begin(async tx => syncUsers(async (query, params) => Array.from(await tx.unsafe(query, params)), source.users, process.env.MASTER_USER_EMAIL));
  console.log(`[migrate] ${total} contas incorporadas de ${legacyAuthFile}; credenciais e bloqueios existentes preservados.`);
} catch (e) {
  if (e.code === 'ENOENT') {
    console.log(`[migrate] ${legacyAuthFile} não encontrado; pulando incorporação de usuários legados.`);
  } else {
    console.error(`[migrate] falha ao ler ${legacyAuthFile}:`, e instanceof Error ? e.message : String(e));
  }
}
await client.end();
console.log('[migrate] banco atualizado.');


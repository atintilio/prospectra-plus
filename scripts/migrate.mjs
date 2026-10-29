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

// Auto-cura: o ledger de migrações pode sobreviver a um banco recriado/limpo
// (o schema `drizzle` e a tabela `__drizzle_migrations` continuam lá, mas as
// tabelas do app somem). Nesse estado o drizzle acha que já aplicou tudo e
// não recria nada — e a aplicação quebra com "relation "users" does not
// exist" em toda rota que toca o banco. Detectamos a inconsistência e
// zeramos o schema para as migrações rodarem de novo do zero.
const CORE_TABLES = ['users', 'orgs', 'leads'];
const [missing] = await client`
  select count(*)::int as faltando
  from unnest(${CORE_TABLES}) as t(nome)
  where to_regclass('public.' || t.nome) is null
`;
if (missing.faltando > 0) {
  console.log(`[migrate] ${missing.faltando} de ${CORE_TABLES.length} tabelas ausentes; recriando o schema do zero.`);
  await client`drop schema if exists drizzle cascade`;
  await client`drop schema if exists public cascade`;
  await client`create schema public`;
  await client`grant usage on schema public to public`;
  await client`grant all on schema public to public`;
}

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


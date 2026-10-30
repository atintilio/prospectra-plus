// Aplica as migrações do banco antes do build (Vercel). Sem DATABASE_URL, apenas avisa.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { syncUsers } from './user-sync.mjs';
import { decideRepair } from './migrate-repair.mjs';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url || url.startsWith('pglite://')) {
  console.log('[migrate] sem DATABASE_URL de Postgres; pulando migrações.');
  process.exit(0);
}
const client = postgres(url, { max: 1 });

// Auto-cura: o ledger de migracoes pode sobreviver a um banco recriado/limpo
// (o schema `drizzle` e a tabela `__drizzle_migrations` continuam la, mas as
// tabelas do app somem). Nesse estado o drizzle acha que ja aplicou tudo e nao
// recria nada — e a aplicacao quebra com 'relation "users" does not exist'.
//
// A correcao recria o schema do zero, entao ela SO pode rodar no estado
// quebrado, nunca num banco em uso: as tres tabelas centrais tem que estar
// TODAS ausentes e o ledger tem que existir. Estado parcial aborta sem apagar
// nada. PROSPERTA_DB_REPAIR=0 desliga a auto-cura.
const [state] = await client`
  select
    (select count(*)::int from (values ('users'), ('orgs'), ('leads')) as t(nome)
      where to_regclass('public.' || t.nome) is null) as faltando,
    (select to_regclass('drizzle.__drizzle_migrations') is not null) as tem_ledger
`;
const decision = decideRepair({
  faltando: state.faltando,
  tem_ledger: state.tem_ledger,
  autoCura: process.env.PROSPERTA_DB_REPAIR !== '0',
});
if (decision.acao === 'abortar') {
  throw new Error(`[migrate] ${decision.motivo}`);
}
if (decision.acao === 'recriar') {
  console.log(`[migrate] ${decision.motivo}; recriando o schema do zero.`);
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


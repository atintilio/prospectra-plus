// Aplica as migrações do banco antes do build (Vercel). Sem DATABASE_URL, apenas avisa.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url || url.startsWith('pglite://')) {
  console.log('[migrate] sem DATABASE_URL de Postgres; pulando migrações.');
  process.exit(0);
}
const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
await client.end();
console.log('[migrate] banco atualizado.');

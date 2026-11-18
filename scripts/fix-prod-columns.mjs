// Conserto direto de schema drift em produção, SEM o migrador do drizzle.
// Lê o SQL de 0016 e roda cada statement de forma tolerante (ignora "já existe").
// Prova no fim: lista as colunas reais de orgs/leads. Força IPv4 por conta própria.
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error('DATABASE_URL não configurada'); process.exit(1); }

const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 10 });

const raw = await readFile('drizzle/0016_schema_compat2.sql', 'utf8');
const stmts = raw.split('--> statement-breakpoint')
  .map((s) => s.replace(/--.*$/gm, '').trim())
  .filter(Boolean);

let ok = 0, skip = 0;
for (const stmt of stmts) {
  try { await sql.unsafe(stmt); ok++; console.log('OK   ', stmt.slice(0, 60).replace(/\s+/g, ' ')); }
  catch (e) { skip++; console.log('SKIP ', (e.message || '').slice(0, 70)); }
}

const cols = await sql.unsafe("select table_name, column_name from information_schema.columns where table_name in ('orgs','leads','org_settings') order by table_name, column_name");
const byTable = {};
for (const c of cols) (byTable[c.table_name] ??= []).push(c.column_name);
console.log('\n--- colunas atuais ---');
for (const t of Object.keys(byTable)) console.log(t + ':', byTable[t].join(', '));
console.log(`\napplied=${ok} skipped=${skip}`);
console.log('plan_id em orgs?', (byTable.orgs || []).includes('plan_id') ? 'SIM' : 'NÃO');

await sql.end();

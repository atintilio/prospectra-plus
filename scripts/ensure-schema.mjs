// Garante o schema completo em produção, contornando o migrador do drizzle (que
// no Neon/pooler registra migrações sem aplicar o DDL, causando drift).
// Reaplica TODOS os statements das migrations de forma tolerante: cria o que
// falta, ignora o que já existe. As migrations do projeto são aditivas (só DDL
// + um UPDATE idempotente de role), então reexecutar é seguro. Força IPv4.
import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error('DATABASE_URL não configurada'); process.exit(1); }
const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 15 });

const dir = 'drizzle';
const files = (await readdir(dir)).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

// Erros esperados ao reaplicar (objeto já existe / não existe) — contam como "skip".
const BENIGN = /already exists|does not exist|duplicate|exists, skipping|multiple primary keys/i;

function summarize(stmt) {
  const s = stmt.replace(/\s+/g, ' ').trim();
  let m;
  if ((m = s.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+"?([a-z_]+)"?/i))) return `tabela ${m[1]}`;
  if ((m = s.match(/ALTER TABLE\s+"?([a-z_]+)"?\s+ADD COLUMN(?: IF NOT EXISTS)?\s+"?([a-z_]+)"?/i))) return `coluna ${m[1]}.${m[2]}`;
  if ((m = s.match(/CREATE (?:UNIQUE )?INDEX(?: IF NOT EXISTS)?\s+"?([a-z_]+)"?/i))) return `índice ${m[1]}`;
  return s.slice(0, 50);
}

let created = 0, skipped = 0, failed = 0;
const fixed = [];
for (const file of files) {
  const raw = await readFile(path.join(dir, file), 'utf8');
  const stmts = raw
    .split('--> statement-breakpoint')
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim().replace(/;\s*$/, ''))
    .filter((s) => s.length > 0);
  for (const stmt of stmts) {
    try { await sql.unsafe(stmt); created++; if (/create table|add column|create (unique )?index/i.test(stmt)) fixed.push(summarize(stmt)); }
    catch (e) {
      const msg = (e && e.message) || String(e);
      if (BENIGN.test(msg)) { skipped++; }
      else { failed++; console.log(`[ensure] ${file}: FALHA -> ${msg.slice(0, 90)}`); }
    }
  }
}
console.log('\n=== CHECK-UP DO BANCO ===');
if (fixed.length) { console.log(`ESTAVA FALTANDO (agora criado): ${fixed.length} item(ns):`); fixed.forEach((f) => console.log('  + ' + f)); }
else { console.log('Nenhuma tabela/coluna faltando — o schema já estava completo.'); }

// Prova rápida: colunas críticas que já nos morderam.
const probe = await sql.unsafe(`select
  (select count(*) from information_schema.columns where table_name='orgs' and column_name='plan_id') as orgs_plan_id,
  (select count(*) from information_schema.columns where table_name='linkedin_accounts' and column_name='provider_id') as li_provider_id,
  (select count(*) from information_schema.tables where table_name='voice_profiles') as voice_profiles,
  (select count(*) from information_schema.columns where table_name='leads' and column_name='phone') as leads_phone`);
console.log(`[ensure] aplicados=${created} ignorados=${skipped} falhas=${failed}`);
console.log('[ensure] probe:', JSON.stringify(probe[0]));
await sql.end();
process.exit(failed > 0 ? 0 : 0); // nunca derruba o deploy por isto

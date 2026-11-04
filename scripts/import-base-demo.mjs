/**
 * Importa a base comercial de 100 leads (docs/base-demo.csv) na operação de
 * DEMONSTRAÇÃO do Prospectra+.
 *
 * Uso (na VPS):
 *   set -a; . /etc/prospectra-plus/app.env; set +a
 *   node scripts/import-base-demo.mjs
 *
 * Caminho de código reusado do app:
 * - leitura do CSV: src/lib/leads-import.ts (leadsFromCsv) — mesma normalização
 *   de URL e mesma deduplicação que o importador de /leads usa;
 * - gravação: onConflictDoNothing no índice único leads_org_url_uq, exatamente
 *   como `insertLeads` em src/app/(app)/actions.ts faz.
 *
 * O que NÃO acontece aqui: nenhuma campanha, evento, fluxo ou membership é
 * criado, nenhuma outra tabela é tocada e nada é enviado para fora — a única
 * escrita é a inserção em `leads`.
 *
 * Idempotente: a chave natural é `linkedin_url` (índice único
 * leads_org_url_uq, por org). Rodar de novo não duplica nada: os perfis que
 * já estão na base são apenas contados e ignorados.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema.ts';
import { leadsFromCsv, normalizeLinkedinUrl, parseCsv } from '../src/lib/leads-import.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PADRAO = path.join(ROOT, 'docs', 'base-demo.csv');
const TAG = 'base demo'; // etiqueta da lista (docs/DEMO.md)
const CHUNK = 200; // mesmo tamanho de lote do importador do app

/** Colunas de e-mail/telefone: o CSV traz, e o schema tem (`leads.email`, `leads.phone`). */
const H_EMAIL = ['email', 'e-mail', 'e mail', 'correio eletronico'];
const H_PHONE = ['telefone', 'phone', 'celular', 'tel', 'whatsapp', 'contato'];

/** Mesma busca do app (src/lib/leads-import.ts): nome exato primeiro, depois "contém". */
function findCol(headers, keys) {
  const h = headers.map((x) => x.trim().toLowerCase());
  for (const k of keys) { const i = h.indexOf(k); if (i >= 0) return i; }
  for (const k of keys) { const i = h.findIndex((x) => x.includes(k)); if (i >= 0) return i; }
  return -1;
}

/**
 * E-mail e telefone por perfil (o `leadsFromCsv` do app devolve só os campos
 * de perfil). A chave é a URL normalizada — a mesma que vai para o banco.
 */
function contatosDoCsv(texto) {
  const rows = parseCsv(texto.replace(/^﻿/, ''));
  if (rows.length < 2) return new Map();
  const [headers, ...data] = rows;
  const iEmail = findCol(headers, H_EMAIL);
  const iPhone = findCol(headers, H_PHONE);
  const out = new Map();
  for (const r of data) {
    const bruto = r.find((v) => /linkedin\.com\//i.test(v ?? '')) ?? '';
    const url = normalizeLinkedinUrl(bruto);
    if (!url) continue;
    out.set(url, {
      email: (iEmail >= 0 ? r[iEmail] ?? '' : '').trim(),
      phone: (iPhone >= 0 ? r[iPhone] ?? '' : '').trim(),
    });
  }
  return out;
}

function csvDoArgumento() {
  const arg = process.argv[2];
  if (!arg) return CSV_PADRAO;
  return path.resolve(ROOT, arg);
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('DATABASE_URL não configurada (use: set -a; . /etc/prospectra-plus/app.env; set +a).');
  }
  if (url.startsWith('pglite://')) {
    throw new Error('Este script fala com Postgres (DATABASE_URL). Para o banco local use o app.');
  }

  const csvPath = csvDoArgumento();
  const texto = readFileSync(csvPath, 'utf-8');

  // 1) leitura com o mesmo parser do app
  const { leads, invalid } = leadsFromCsv(texto);
  const contatos = contatosDoCsv(texto);
  if (!leads.length) throw new Error(`Nenhum lead válido em ${csvPath}.`);

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  try {
    // 2) a org de demonstração: a mais recente entre as que têm is_demo = true
    const [org] = await db
      .select({ id: schema.orgs.id, name: schema.orgs.name, createdAt: schema.orgs.createdAt })
      .from(schema.orgs)
      .where(eq(schema.orgs.isDemo, true))
      .orderBy(desc(schema.orgs.createdAt))
      .limit(1);
    if (!org) throw new Error('Nenhuma operação de demonstração (orgs.is_demo = true) no banco.');

    // 3) responsável: o dono da operação de demonstração (como no import do app)
    const [dono] = await db
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.role, 'owner')))
      .limit(1);

    const antes = await db
      .select({ n: schema.leads.id })
      .from(schema.leads)
      .where(eq(schema.leads.orgId, org.id));
    const totalAntes = antes.length;

    // 4) o que já existe na base (chave natural: linkedin_url)
    const urls = leads.map((l) => l.linkedinUrl);
    const existentes = new Set();
    for (let i = 0; i < urls.length; i += CHUNK) {
      const achados = await db
        .select({ linkedinUrl: schema.leads.linkedinUrl })
        .from(schema.leads)
        .where(and(eq(schema.leads.orgId, org.id), inArray(schema.leads.linkedinUrl, urls.slice(i, i + CHUNK))));
      for (const a of achados) existentes.add(a.linkedinUrl);
    }

    // 5) inserção do que falta (ON CONFLICT DO NOTHING: nunca duplica)
    const aInserir = leads
      .filter((l) => !existentes.has(l.linkedinUrl))
      .map((l) => {
        const c = contatos.get(l.linkedinUrl) ?? { email: '', phone: '' };
        return {
          orgId: org.id,
          ownerId: dono?.userId ?? null,
          linkedinUrl: l.linkedinUrl,
          fullName: l.fullName,
          headline: l.headline,
          company: l.company,
          location: l.location,
          tag: TAG,
          source: 'import',
          stage: 'new',
          email: c.email,
          phone: c.phone,
        };
      });

    let inseridos = 0;
    for (let i = 0; i < aInserir.length; i += CHUNK) {
      const res = await db
        .insert(schema.leads)
        .values(aInserir.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .returning({ id: schema.leads.id });
      inseridos += res.length;
    }

    const [depois] = await db
      .select({ n: count() })
      .from(schema.leads)
      .where(eq(schema.leads.orgId, org.id));

    console.log('[import-base-demo] operação de demonstração:', `${org.name} (${org.id})`);
    console.log('[import-base-demo] csv:', csvPath);
    console.log(`[import-base-demo] leads no csv: ${leads.length}${invalid ? ` (${invalid} linha(s) sem perfil válido)` : ''}`);
    console.log(`[import-base-demo] novos na base: ${inseridos}`);
    console.log(`[import-base-demo] já existiam: ${existentes.size}`);
    console.log(`[import-base-demo] total de leads da org: ${totalAntes} -> ${depois.n}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[import-base-demo] falha:', error?.message ?? error);
  process.exit(1);
});

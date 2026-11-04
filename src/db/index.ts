import 'server-only';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

export type DB = ReturnType<typeof drizzlePg<typeof schema>>;

const globalForDb = globalThis as unknown as { __prospectraDb?: Promise<DB> };

/**
 * URL do banco.
 *
 * No Node (VPS) vem da env var. No Cloudflare Workers vem do binding
 * HYPERDRIVE (a senha nunca fica no codigo nem no Worker).
 */
/**
 * URL do Postgres.
 *
 * - Node (VPS): env var `DATABASE_URL`.
 * - Cloudflare Workers: o runtime nao faz I/O de TCP, entao o postgres.js fica
 *   pendurado. No Worker a conexao vem pelo driver WebSocket do Neon
 *   (`@neondatabase/serverless`), que fala `wss://` direto com o Neon.
 */
async function resolveUrl(): Promise<string> {
  try {
    const mod = (await import('@opennextjs/cloudflare')) as unknown as {
      getCloudflareContext?: () => { env?: Record<string, { connectionString?: string } | undefined> };
    };
    const env = mod.getCloudflareContext?.()?.env;
    // `NEON_DATABASE_URL` e um secret (texto). O Hyperdrive seria um objeto com
    // `.connectionString`; aceitamos os dois formatos.
    const raw = env?.NEON_DATABASE_URL as unknown;
    const url = typeof raw === 'string' ? raw : (raw as { connectionString?: string } | undefined)?.connectionString;
    if (url) return url;
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
  // No Cloudflare Workers: driver WebSocket do Neon (o postgres.js nao tem I/O de TCP la).
  // Usa-se `Client` (uma conexao) e nao `Pool`: o app usa transacoes, que o driver
  // HTTP do Neon nao suporta, e o Client nao mantem conexoes extras no isolate.
  if (isCloudflareWorker()) {
    const { Client, neonConfig } = await import('@neondatabase/serverless');
    const { drizzle: drizzleNeon } = await import('drizzle-orm/neon-serverless');
    // No runtime do Worker o WebSocket global e o unico transporte possivel.
    neonConfig.webSocketConstructor = WebSocket;
    const client = new Client(url);
    // O driver do Neon nao abre a conexao sozinha no Worker: sem este
    // `connect()` explicito a primeira consulta fica pendurada para sempre
    // (o runtime cancela o request com "your Worker's code had hung").
    await client.connect();
    return drizzleNeon(client, { schema }) as unknown as DB;
  }

  const client = postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  return drizzlePg(client, { schema });
}

/** Rodando no Cloudflare Workers? (o runtime nao implementa TCP) */
function isCloudflareWorker(): boolean {
  return typeof WebSocket !== 'undefined' && typeof globalThis !== 'undefined'
    && (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent?.includes('Cloudflare-Workers') === true;
}

export function getDb(): Promise<DB> {
  // No Cloudflare Workers o runtime proibe reutilizar I/O entre requests
  // ("Cannot perform I/O on behalf of a different request"): o client do banco
  // precisa ser criado por request. No Node/VPS o processo e unico e o singleton
  // continua correto (e evita abrir conexao a cada chamada).
  if (isCloudflareWorker()) return create();
  globalForDb.__prospectraDb ??= create();
  return globalForDb.__prospectraDb;
}

const globalForRead = globalThis as unknown as { __prospectraReadDb?: Promise<DB> };

/**
 * URL do endpoint HTTP do Neon.
 *
 * O driver HTTP fala com o endpoint DIRETO do banco (`ep-xxx.<region>.neon.tech`),
 * nao com o pooler (`ep-xxx-pooler...`): o pooler so aceita o protocolo
 * WebSocket. E o `channel_binding=require` (SCRAM) quebra o handshake HTTP.
 */
function toHttpUrl(url: string): string {
  return url
    .replace('-pooler', '')
    .replace(/([?&])channel_binding=require(&?)/, (_, a: string, b: string) => (b ? a : ''))
    .replace(/[?&]$/, '');
}

/**
 * Conexao de LEITURA — driver HTTP do Neon.
 *
 * Por que existe: o driver WebSocket mantem UMA sessao com o banco, entao
 * varias leituras "em paralelo" (`Promise.all`) ficam NA FILA da mesma sessao:
 * o tempo da tela vira a soma de todas as consultas. O driver HTTP faz uma
 * requisicao por consulta, de modo que as leituras correm de verdade em
 * paralelo e nao existe custo de conectar a cada request.
 *
 * Limite conhecido: o driver HTTP nao suporta transacoes. Os caminhos que
 * gravam continuam usando `getDb()` (WebSocket); aqui so entra leitura.
 */
async function createRead(): Promise<DB> {
  let url: string;
  try {
    url = await resolveUrl();
  } catch {
    // Sem URL configurada (ambiente de teste com banco injetado): segue o driver normal.
    return create();
  }
  const { neon } = await import('@neondatabase/serverless');
  const { drizzle: drizzleHttp } = await import('drizzle-orm/neon-http');
  const httpDb = drizzleHttp(neon(toHttpUrl(url)), { schema }) as unknown as DB;
  // Sanidade: se o endpoint HTTP nao responder, cai no driver WebSocket
  // (lento, mas correto) em vez de derrubar a tela.
  try {
    await httpDb.execute(sql`select 1`);
    return httpDb;
  } catch {
    return create();
  }
}

/** Conexao de leitura (consultas paralelas). Nao use em caminhos com transacao. */
export function getReadDb(): Promise<DB> {
  // No Node/VPS o processo e unico: o client HTTP (sem estado de I/O) pode
  // ser reaproveitado. No Worker o driver HTTP e so `fetch`, entao tambem
  // pode ser reaproveitado entre requests.
  globalForRead.__prospectraReadDb ??= createRead();
  return globalForRead.__prospectraReadDb;
}

export { schema };

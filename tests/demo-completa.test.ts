import { count, eq, sql } from 'drizzle-orm';
import { expect, test } from 'vitest';
import * as schema from '../src/db/schema';
import { ensureDemo, findDemoOrg } from '../src/lib/demo';
import { resetDemo } from '../src/lib/demo-reset';
import { seedIntel } from '../src/lib/demo-intel';
import { seedOrg, testDb } from './helpers';

/** O pglite devolve array; o postgres-js devolve { rows }. */
function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === 'object' && 'rows' in result) {
    const value = (result as { rows?: unknown }).rows;
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  }
  return [];
}

/** Contagem por org numa tabela do drizzle. */
async function n(db: Awaited<ReturnType<typeof testDb>>, table: any, orgId: string): Promise<number> {
  const rows = await db.select({ n: count() }).from(table).where(eq(table.orgId, orgId));
  return Number(rows[0]?.n ?? 0);
}

test('a demo popula a suíte inteira (agenda, voz, suporte, inteligência)', async () => {
  const db = await testDb();
  const { user } = await seedOrg(db, 'Real');
  const id = await ensureDemo(db, user);

  // CRM (já existia)
  expect(await n(db, schema.leads, id)).toBeGreaterThan(20);
  expect(await n(db, schema.campaigns, id)).toBe(3);

  // agenda nativa
  expect(await n(db, schema.agendaEventTypes, id)).toBe(2);
  expect(await n(db, schema.agendaAvailability, id)).toBeGreaterThan(10);
  expect(await n(db, schema.agendaLinks, id)).toBe(2);
  expect(await n(db, schema.agendaBlackouts, id)).toBe(1);
  expect(await n(db, schema.meetings, id)).toBe(3);

  // voz
  expect(await n(db, schema.voiceProfiles, id)).toBe(1);
  expect(await n(db, schema.voiceJobs, id)).toBe(2);

  // suporte
  expect(await n(db, schema.supportTeams, id)).toBe(2);
  expect(await n(db, schema.supportConversations, id)).toBe(6);
  const mensagens = await db
    .select({ n: count() })
    .from(schema.supportMessages)
    .innerJoin(schema.supportConversations, eq(schema.supportConversations.id, schema.supportMessages.conversationId))
    .where(eq(schema.supportConversations.orgId, id));
  expect(Number(mensagens[0]?.n ?? 0)).toBeGreaterThan(10);
  expect(await n(db, schema.supportSlaPolicies, id)).toBeGreaterThanOrEqual(1);
  expect(await n(db, schema.helpArticles, id)).toBe(4);
  expect(await n(db, schema.tasks, id)).toBe(3);

  // inteligência e comercial
  expect(await n(db, schema.commercialProfiles, id)).toBe(1);
  expect(await n(db, schema.intelligenceJobs, id)).toBe(3);
  expect(await n(db, schema.harveyConversations, id)).toBe(2);
  expect(await n(db, schema.harveyInboundJobs, id)).toBe(1);
  expect(await n(db, schema.automationRules, id)).toBe(2);
  expect(await n(db, schema.auditLog, id)).toBe(5);
  expect(await n(db, schema.webhookEndpoints, id)).toBe(1);
  expect(await n(db, schema.leadAttributeDefs, id)).toBe(2);
});

test('a demo é idempotente: rodar de novo não duplica nada', async () => {
  const db = await testDb();
  const { user } = await seedOrg(db, 'Real');
  const id = await ensureDemo(db, user);

  const antes = {
    comunicacao: Number(rows(await db.execute(sql`
      select count(*)::int as total from lead_communication_profiles where org_id = ${id}
    `))[0]?.total ?? 0),
    jobs: await n(db, schema.intelligenceJobs, id),
    harvey: await n(db, schema.harveyConversations, id),
    mensagens: await db
      .select({ n: count() })
      .from(schema.supportMessages)
      .innerJoin(schema.supportConversations, eq(schema.supportConversations.id, schema.supportMessages.conversationId))
      .where(eq(schema.supportConversations.orgId, id))
      .then((rows) => Number(rows[0]?.n ?? 0)),
    reservas: await n(db, schema.meetings, id),
  };
  expect(antes.comunicacao).toBe(4);

  // segunda execução dos módulos (como o reset faria)
  const leads = await db
    .select({ id: schema.leads.id, fullName: schema.leads.fullName, company: schema.leads.company, headline: schema.leads.headline, stage: schema.leads.stage, ownerId: schema.leads.ownerId })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, id));
  const members = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, id));
  const ctx = {
    orgId: id,
    userId: user.id,
    userIds: members.map((m) => m.userId).filter((uid) => uid !== user.id),
    leads: leads.map((l) => ({
      id: l.id,
      fullName: l.fullName,
      company: l.company,
      headline: l.headline,
      stage: l.stage,
      ownerId: l.ownerId ?? user.id,
    })),
    now: new Date(),
    rand: () => 0.5,
  };
  await seedIntel(db, ctx);

  const depois = {
    comunicacao: Number(rows(await db.execute(sql`
      select count(*)::int as total from lead_communication_profiles where org_id = ${id}
    `))[0]?.total ?? 0),
    jobs: await n(db, schema.intelligenceJobs, id),
    harvey: await n(db, schema.harveyConversations, id),
    mensagens: await db
      .select({ n: count() })
      .from(schema.supportMessages)
      .innerJoin(schema.supportConversations, eq(schema.supportConversations.id, schema.supportMessages.conversationId))
      .where(eq(schema.supportConversations.orgId, id))
      .then((rows) => Number(rows[0]?.n ?? 0)),
    reservas: await n(db, schema.meetings, id),
  };
  expect(depois).toEqual(antes);
});

test('recriar a demo apaga a antiga e devolve a mesma base', async () => {
  const db = await testDb();
  const { user } = await seedOrg(db, 'Real');
  const id = await ensureDemo(db, user);

  // uma tabela da org de produção não pode ser tocada
  const { org: prod } = await seedOrg(db, 'Prod');
  await db.insert(schema.leads).values({
    orgId: prod.id,
    ownerId: user.id,
    linkedinUrl: 'https://www.linkedin.com/in/lead-real',
    fullName: 'Lead Real',
    company: 'Empresa Real',
  });

  const novo = await resetDemo(db, user);
  expect(novo).not.toBe(id);
  expect(await findDemoOrg(db, user.id)).toBe(novo);

  // a demo voltou com tudo
  expect(await n(db, schema.agendaEventTypes, novo)).toBe(2);
  expect(await n(db, schema.supportConversations, novo)).toBe(6);
  expect(await n(db, schema.intelligenceJobs, novo)).toBe(3);

  // a org antiga foi apagada
  expect(await n(db, schema.leads, id)).toBe(0);
  expect(await n(db, schema.leads, prod.id)).toBe(1);
});

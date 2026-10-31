import { and, eq, sql } from 'drizzle-orm';
import { expect, test } from 'vitest';
import * as schema from '../src/db/schema';
import type { DB } from '../src/db';
import { ensureDemo } from '../src/lib/demo';
import { seedIntel, type DemoSeedCtx, type DemoSeedLead } from '../src/lib/demo-intel';
import { seedOrg, testDb } from './helpers';

/** Gerador determinístico (o mesmo do seed da demo). */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

async function dbLeads(db: DB, orgId: string) {
  return db
    .select({
      id: schema.leads.id,
      fullName: schema.leads.fullName,
      company: schema.leads.company,
      headline: schema.leads.headline,
      stage: schema.leads.stage,
      ownerId: schema.leads.ownerId,
    })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, orgId));
}

async function demoContext(db: DB, orgId: string, userId: string): Promise<DemoSeedCtx> {
  const rows = await dbLeads(db, orgId);
  const leads: DemoSeedLead[] = rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    company: row.company,
    headline: row.headline,
    stage: row.stage,
    ownerId: row.ownerId,
  }));
  return { orgId, userId, userIds: [], leads, now: new Date('2026-10-30T12:00:00.000Z'), rand: rng(42) };
}

test('a demo da inteligência comercial fica completa e idempotente', async () => {
  const db = await testDb();
  const { user, org: prod } = await seedOrg(db, 'Operação Real');
  const orgId = await ensureDemo(db, user);
  const ctx = await demoContext(db, orgId, user.id);

  const summary = await seedIntel(db, ctx);

  // --- Perfil comercial (chave org + vendedor) ---
  const [profile] = await db.select().from(schema.commercialProfiles).where(eq(schema.commercialProfiles.orgId, orgId));
  expect(profile).toBeTruthy();
  expect(profile.userId).toBe(user.id);
  expect(profile.sellerName).toBe('Ana Beltrão');
  expect(profile.companyName).toBe('Atlas Consultoria Tributária');
  expect(profile.sellerPhone).toBe('+5548999990001');
  expect(profile.offers).toHaveLength(2);
  expect(profile.offers[0].name).toBeTruthy();
  expect(profile.offers[0].description.length).toBeGreaterThan(10);
  expect(profile.strategy.length).toBeGreaterThan(20);
  expect(summary.commercialProfile).toBe(true);

  // --- Perfis de comunicação (tabela fora do schema do drizzle) ---
  const communicationRows = await db.execute(sql`
    SELECT lead_id, source, evidence_label, profile_type, preferences
    FROM lead_communication_profiles WHERE org_id = ${orgId}
  `);
  const profiles = (Array.isArray(communicationRows) ? communicationRows : (communicationRows as { rows: unknown[] }).rows) as Array<{
    lead_id: string;
    source: string;
    evidence_label: string;
    profile_type: string | null;
    preferences: { preferredChannel?: string; preferredFormat?: string; notes?: string };
  }>;
  expect(profiles).toHaveLength(4);
  for (const row of profiles) {
    expect(['manual', 'observational_quiz', 'inferred']).toContain(row.source);
    expect(['declared', 'estimate']).toContain(row.evidence_label);
    expect(row.profile_type).toBeTruthy();
    expect(row.preferences.notes?.length ?? 0).toBeGreaterThan(10);
  }
  expect(new Set(profiles.map((row) => row.lead_id)).size).toBe(4);

  // --- Jobs de inteligência: 2 concluídos (formato exato da tela) + 1 na fila ---
  const jobs = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.orgId, orgId));
  expect(jobs).toHaveLength(3);
  const completed = jobs.filter((job) => job.state === 'completed');
  const queued = jobs.filter((job) => job.state === 'queued');
  expect(completed).toHaveLength(2);
  expect(queued).toHaveLength(1);
  expect(queued[0].result).toBeNull();
  for (const job of completed) {
    const result = job.result;
    expect(result).toBeTruthy();
    if (!result) continue;
    expect(Object.keys(result).sort()).toEqual(
      ['factors', 'hot', 'priority', 'priorityAvailable', 'score', 'unavailableFactors'].sort(),
    );
    expect(typeof result.score).toBe('number');
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(result.priority);
    expect(typeof result.hot).toBe('boolean');
    expect(result.priorityAvailable).toBe(true);
    expect(Object.keys(result.factors).sort()).toEqual([
      'company_size',
      'data_completeness',
      'digital_presence',
      'email_validity',
      'osint_risk',
      'position_seniority',
    ]);
    for (const value of Object.values(result.factors)) {
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(result.unavailableFactors).toEqual([]);
    // A prioridade é coerente com a pontuação (mesma regra do executor real).
    const score = result.score;
    expect(result.priority).toBe(score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW');
    expect(result.hot).toBe(result.priority === 'HIGH');
    expect(job.completedAt).toBeTruthy();
  }
  // Os jobs apontam para leads reais da demo.
  const leadIds = new Set((await dbLeads(db, orgId)).map((lead) => lead.id));
  for (const job of jobs) expect(leadIds.has(job.leadId)).toBe(true);

  // --- Conversas do Harvey ---
  const conversations = await db.select().from(schema.harveyConversations).where(eq(schema.harveyConversations.orgId, orgId));
  expect(conversations).toHaveLength(2);
  const active = conversations.find((row) => row.state === 'active');
  const handoff = conversations.find((row) => row.state === 'handoff');
  expect(active?.turns).toBeGreaterThanOrEqual(2);
  expect(active?.turns).toBeLessThanOrEqual(3);
  expect(handoff?.summary.length ?? 0).toBeGreaterThan(10);
  expect(handoff?.recipients.length ?? 0).toBeGreaterThan(0);
  for (const conversation of conversations) {
    expect(conversation.profile.sellerName).toBe('Ana Beltrão');
    expect(conversation.profile.companyName).toBe('Atlas Consultoria Tributária');
    expect(conversation.profile.sellerPhone).toBe('+5548999990001');
    expect(conversation.profile.strategy.length).toBeGreaterThan(20);
    expect(conversation.profile.offers).toHaveLength(2);
    expect(Object.keys(conversation.profile).sort()).toEqual([
      'companyName',
      'offers',
      'sellerName',
      'sellerPhone',
      'strategy',
    ]);
    // Telefone fictício — nunca o número do dono.
    expect(conversation.phone).toMatch(/^\+555199999\d{4}$/);
    expect(conversation.phone).not.toBe('+5548999990001');
    expect(leadIds.has(conversation.leadId)).toBe(true);
  }

  // --- Mensagem recebida em conferência e inbox do vendedor ---
  const inbound = await db.select().from(schema.harveyInboundJobs).where(eq(schema.harveyInboundJobs.orgId, orgId));
  expect(inbound).toHaveLength(1);
  expect(inbound[0].state).toBe('review');
  expect(inbound[0].text.length).toBeGreaterThan(10);
  expect(inbound[0].error?.length ?? 0).toBeGreaterThan(5);
  expect(inbound[0].phone).toMatch(/^\+555199999\d{4}$/);

  const sellerInbox = await db.select().from(schema.harveySellerInbox).where(eq(schema.harveySellerInbox.orgId, orgId));
  expect(sellerInbox).toHaveLength(1);
  expect(sellerInbox[0].text.length).toBeGreaterThan(10);
  expect(sellerInbox[0].conversationId).toBe(handoff?.id);

  // --- Automações, auditoria e webhook ---
  const rules = await db.select().from(schema.automationRules).where(eq(schema.automationRules.orgId, orgId));
  expect(rules).toHaveLength(2);
  expect(rules.every((rule) => rule.active)).toBe(true);
  expect(rules.map((rule) => rule.trigger).sort()).toEqual(['conversation_created', 'conversation_replied']);

  const audit = await db.select().from(schema.auditLog).where(eq(schema.auditLog.orgId, orgId));
  expect(audit).toHaveLength(5);
  expect(audit.map((row) => row.action)).toContain('campaign.created');
  expect(audit.map((row) => row.action)).toContain('sla_policy.updated');
  expect(audit.every((row) => row.actorUserId === user.id)).toBe(true);

  const hooks = await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.orgId, orgId));
  expect(hooks).toHaveLength(1);
  expect(hooks[0].url).toBe('https://exemplo.invalid/hook');
  expect(hooks[0].events).toContain('support.message.received');
  expect(hooks[0].secret.length).toBeGreaterThan(16);

  // --- Atributos de lead (definições + preenchimento) ---
  const defs = await db.select().from(schema.leadAttributeDefs).where(eq(schema.leadAttributeDefs.orgId, orgId));
  expect(defs).toHaveLength(2);
  expect(defs.map((row) => row.key).sort()).toEqual(['porte_empresa', 'regime_tributario']);
  const filled = await db
    .select({ attributes: schema.leads.attributes })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, orgId), eq(schema.leads.ownerId, user.id)));
  const withAttributes = filled.filter((row) => Object.keys((row.attributes ?? {}) as Record<string, unknown>).includes('porte_empresa'));
  expect(withAttributes.length).toBeGreaterThanOrEqual(4);

  // --- Isolamento: a operação de produção não foi tocada ---
  const [prodProfile] = await db.select().from(schema.commercialProfiles).where(eq(schema.commercialProfiles.orgId, prod.id));
  expect(prodProfile).toBeUndefined();

  // --- Idempotência: rodar de novo não duplica nada ---
  const before = {
    jobs: jobs.length,
    conversations: conversations.length,
    rules: rules.length,
    audit: audit.length,
    hooks: hooks.length,
    defs: defs.length,
  };
  const second = await seedIntel(db, ctx);
  expect(second).toEqual(summary);
  expect((await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.orgId, orgId))).length).toBe(before.jobs);
  expect((await db.select().from(schema.harveyConversations).where(eq(schema.harveyConversations.orgId, orgId))).length).toBe(before.conversations);
  expect((await db.select().from(schema.automationRules).where(eq(schema.automationRules.orgId, orgId))).length).toBe(before.rules);
  expect((await db.select().from(schema.auditLog).where(eq(schema.auditLog.orgId, orgId))).length).toBe(before.audit);
  expect((await db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.orgId, orgId))).length).toBe(before.hooks);
  expect((await db.select().from(schema.leadAttributeDefs).where(eq(schema.leadAttributeDefs.orgId, orgId))).length).toBe(before.defs);
  const profilesAgain = await db.execute(sql`
    SELECT count(*)::int AS total FROM lead_communication_profiles WHERE org_id = ${orgId}
  `);
  const total = Array.isArray(profilesAgain)
    ? Number((profilesAgain[0] as { total: number }).total)
    : Number((profilesAgain as { rows: Array<{ total: number }> }).rows[0].total);
  expect(total).toBe(4);
  const inboundAgain = await db.select().from(schema.harveyInboundJobs).where(eq(schema.harveyInboundJobs.orgId, orgId));
  const sellerAgain = await db.select().from(schema.harveySellerInbox).where(eq(schema.harveySellerInbox.orgId, orgId));
  expect(inboundAgain).toHaveLength(1);
  expect(sellerAgain).toHaveLength(1);
});

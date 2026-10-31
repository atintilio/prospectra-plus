import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@/db';
import { ensureDemo } from '@/lib/demo';
import { seedSupport, type DemoCtx } from '@/lib/demo-support';
import { conversationThread, listInbox, listOrgLabels } from '@/lib/support';
import { minutesRemaining } from '@/lib/support-sla';
import { csatSummary } from '@/lib/support-csat';
import { seedOrg, testDb } from './helpers';

/** Gerador determinístico (mesmo do demo.ts). */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

/** Org de demonstração: dono + equipe fictícia + os leads usados pelas conversas. */
async function setupDemo() {
  const db = await testDb();
  const [org] = await db.insert(schema.orgs).values({ name: 'Demonstração · Atlas Consultoria', isDemo: true, seats: 8 }).returning();
  const [owner] = await db.insert(schema.users).values({ email: 'dono@demo.invalid', name: 'Ana Beltrão', status: 'active' }).returning();
  const mates = await db.insert(schema.users).values([
    { email: `demo-${org.id}-1@demo.invalid`, name: 'Bruna Lacerda', status: 'disabled' },
    { email: `demo-${org.id}-2@demo.invalid`, name: 'Caio Mendonça', status: 'disabled' },
    { email: `demo-${org.id}-3@demo.invalid`, name: 'Isadora Veiga', status: 'disabled' },
  ]).returning();
  await db.insert(schema.memberships).values([
    { orgId: org.id, userId: owner.id, role: 'owner' },
    { orgId: org.id, userId: mates[0].id, role: 'manager' },
    { orgId: org.id, userId: mates[1].id, role: 'sdr' },
    { orgId: org.id, userId: mates[2].id, role: 'closer' },
  ]);
  const leads = await db.insert(schema.leads).values([
    { orgId: org.id, ownerId: owner.id, linkedinUrl: 'https://www.linkedin.com/in/mariana-duarte-demo', fullName: 'Mariana Duarte', headline: 'CFO', company: 'Metalúrgica Vale do Sul', stage: 'meeting' },
    { orgId: org.id, ownerId: mates[1].id, linkedinUrl: 'https://www.linkedin.com/in/andre-souza-demo', fullName: 'André Souza', headline: 'Sócio', company: 'Souza & Rocha Contadores', stage: 'connected' },
    { orgId: org.id, ownerId: owner.id, linkedinUrl: 'https://www.linkedin.com/in/patricia-lemos-demo', fullName: 'Patrícia Lemos', headline: 'Gerente Tributária', company: 'Rede Farmaviva', stage: 'meeting' },
    { orgId: org.id, ownerId: mates[0].id, linkedinUrl: 'https://www.linkedin.com/in/camila-ferraz-demo', fullName: 'Camila Ferraz', headline: 'Head de Controladoria', company: 'Transportes Rota Sul', stage: 'replied' },
    { orgId: org.id, ownerId: mates[2].id, linkedinUrl: 'https://www.linkedin.com/in/eduardo-matsuda-demo', fullName: 'Eduardo Matsuda', headline: 'CEO', company: 'AgroNorte Insumos', stage: 'replied' },
  ]).returning();

  const ctx: DemoCtx = {
    orgId: org.id,
    userId: owner.id,
    userIds: mates.map((m) => m.id),
    leads: leads.map((l) => ({
      id: l.id, fullName: l.fullName, company: l.company, headline: l.headline, stage: l.stage, ownerId: l.ownerId ?? owner.id,
    })),
    now: new Date('2026-10-29T13:00:00.000Z'),
    rand: rng(42),
  };
  return { db, org, owner, mates, leads, ctx };
}

describe('seed de demonstração — suporte (Helpin)', () => {
  it('cria times, conversas, mensagens, SLA, horário, pré-chat, artigos, docs e tarefas', async () => {
    const { db, org, owner, ctx } = await setupDemo();
    const summary = await seedSupport(db, ctx);

    expect(summary.conversations).toBe(6);
    expect(summary.messages).toBeGreaterThanOrEqual(15);
    expect(summary.teams).toBe(2);
    expect(summary.teamMembers).toBe(5);
    expect(summary.slaPolicies).toBe(1);
    expect(summary.schedules).toBe(1);
    expect(summary.prechatForms).toBe(1);
    expect(summary.helpArticles).toBe(4);
    expect(summary.docs).toBe(3);
    expect(summary.tasks).toBe(3);

    // times de atendimento + membros
    const teams = await db.select().from(schema.supportTeams).where(eq(schema.supportTeams.orgId, org.id));
    expect(teams.map((t) => t.name).sort()).toEqual(['Atendimento comercial', 'Suporte técnico']);
    const teamMembers = await db.select().from(schema.supportTeamMembers);
    expect(teamMembers).toHaveLength(5);

    // conversas: canais, audiências e status coerentes com o schema real
    const conversations = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.orgId, org.id));
    expect(conversations).toHaveLength(6);
    expect(conversations.filter((c) => c.channel === 'web')).toHaveLength(3);
    expect(conversations.filter((c) => c.channel === 'whatsapp')).toHaveLength(2);
    expect(conversations.filter((c) => c.channel === 'internal')).toHaveLength(1);
    expect(conversations.filter((c) => c.audience === 'product')).toHaveLength(1);
    expect(conversations.filter((c) => c.status === 'closed')).toHaveLength(2);
    expect(conversations.filter((c) => c.status === 'open')).toHaveLength(4);
    // "resolvida" = fechada com resolvedAt
    expect(conversations.filter((c) => c.status === 'closed').every((c) => c.resolvedAt !== null)).toBe(true);
    // conversas de cliente ligadas ao lead da demo
    const customerConvs = conversations.filter((c) => c.audience === 'customer');
    expect(customerConvs.filter((c) => c.leadId !== null).length).toBeGreaterThanOrEqual(4);
    // etiquetas no formato que o app usa (text[]): até 10, cada uma com até 30 caracteres
    for (const c of conversations) {
      expect(Array.isArray(c.labels)).toBe(true);
      expect(c.labels.length).toBeGreaterThan(0);
      expect(c.labels.length).toBeLessThanOrEqual(10);
      for (const label of c.labels) {
        expect(typeof label).toBe('string');
        expect(label.length).toBeLessThanOrEqual(30);
      }
    }
    // contato fictício: e-mail @demo.invalid e telefone no padrão +55 51 9XXXX-XXXX
    for (const c of conversations) {
      expect(c.visitorEmail.endsWith('@demo.invalid')).toBe(true);
      if (c.channel !== 'internal') expect(c.visitorPhone).toMatch(/^\+55 51 9\d{4}-\d{4}$/);
    }
    // SLA: uma conversa em risco (prazo próximo) e uma já violada (prazo no passado)
    const risky = conversations.find((c) => c.slaDueAt && c.slaDueAt.getTime() > ctx.now.getTime() && c.slaDueAt.getTime() < ctx.now.getTime() + 60 * 60_000);
    expect(risky).toBeDefined();
    expect(minutesRemaining(risky!.slaDueAt, ctx.now)).toBeGreaterThan(0);
    expect(minutesRemaining(risky!.slaDueAt, ctx.now)).toBeLessThanOrEqual(60);
    const breached = conversations.find((c) => c.status === 'open' && c.slaDueAt && c.slaDueAt.getTime() < ctx.now.getTime());
    expect(breached).toBeDefined();
    // regra do app: dentro do prazo = respondeu antes do vencimento (ou ainda não venceu)
    const allMessages = await db.select().from(schema.supportMessages);
    let within = 0;
    let violated = 0;
    for (const c of conversations) {
      if (!c.slaDueAt) continue;
      const firstReply = allMessages
        .filter((m) => m.conversationId === c.id && m.author === 'agent' && !m.private)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      const reference = firstReply?.createdAt ?? c.resolvedAt ?? ctx.now;
      if (reference.getTime() <= c.slaDueAt.getTime()) within += 1;
      else violated += 1;
    }
    expect(within).toBeGreaterThanOrEqual(1);
    expect(violated).toBeGreaterThanOrEqual(1);
    // CSAT do app: duas respostas, média 4 (uma nota 5 e uma nota 3)
    const csat = csatSummary(conversations.map((c) => ({ csatRating: c.csatRating })));
    expect(csat.responses).toBe(2);
    expect(csat.average).toBe(4);
    expect(csat.promoters).toBe(1);
    expect(csat.passives).toBe(1);
    // CSAT: uma resolvida com 5 e uma com 3 (com comentário)
    const rated = conversations.filter((c) => c.csatRating !== null);
    expect(rated).toHaveLength(2);
    expect(rated.some((c) => c.csatRating === 5)).toBe(true);
    expect(rated.some((c) => c.csatRating === 3)).toBe(true);
    for (const c of rated) {
      expect((c.csatComment ?? '').length).toBeGreaterThan(0);
      expect(c.csatSentAt).not.toBeNull();
    }

    // mensagens: 3 a 4 por conversa, com autores válidos e nota interna
    const messages = await db.select().from(schema.supportMessages);
    expect(messages.length).toBeGreaterThanOrEqual(15);
    for (const c of conversations) {
      const own = messages.filter((m) => m.conversationId === c.id);
      expect(own.length).toBeGreaterThanOrEqual(3);
      expect(own.length).toBeLessThanOrEqual(6);
    }
    expect(messages.every((m) => ['visitor', 'agent', 'system'].includes(m.author))).toBe(true);
    expect(messages.filter((m) => m.author === 'agent').every((m) => m.authorUserId !== null)).toBe(true);
    const notes = messages.filter((m) => m.private);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(notes.every((n) => n.author === 'agent')).toBe(true);
    expect(messages.some((m) => m.author === 'system')).toBe(true); // auto-resposta fora do horário

    // política de SLA e horário de atendimento
    const [policy] = await db.select().from(schema.supportSlaPolicies).where(eq(schema.supportSlaPolicies.orgId, org.id));
    expect(policy.firstResponseMinutes).toBe(240);
    expect(policy.resolutionMinutes).toBe(2880);
    expect(policy.businessHoursOnly).toBe(true);
    const [schedule] = await db.select().from(schema.supportSchedules).where(eq(schema.supportSchedules.orgId, org.id));
    expect(schedule.timezone).toBe('America/Sao_Paulo');
    expect(schedule.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(schedule.openMinute).toBe(540);
    expect(schedule.closeMinute).toBe(1080);
    expect(schedule.autoReplyEnabled).toBe(true);
    expect(schedule.autoReplyMessage.length).toBeGreaterThan(0);

    // formulário pré-chat
    const forms = await db.select().from(schema.supportPrechatForms).where(eq(schema.supportPrechatForms.orgId, org.id));
    expect(forms).toHaveLength(1);
    expect(forms[0].active).toBe(true);
    expect(Array.isArray(forms[0].fields)).toBe(true);
    expect((forms[0].fields as unknown[]).length).toBeGreaterThanOrEqual(3);

    // central de ajuda, documentos e tarefas
    const articles = await db.select().from(schema.helpArticles).where(eq(schema.helpArticles.orgId, org.id));
    expect(articles).toHaveLength(4);
    expect(articles.every((a) => a.status === 'published' && a.body.length > 0 && a.slug.length > 0)).toBe(true);
    expect(new Set(articles.map((a) => a.slug)).size).toBe(4);
    const docs = await db.select().from(schema.docs).where(eq(schema.docs.orgId, org.id));
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.authorId === owner.id && d.body.length > 0)).toBe(true);
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.orgId, org.id));
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.assignedTo !== null && t.leadId !== null)).toBe(true);
    expect(tasks.some((t) => t.status === 'doing')).toBe(true);

    // a app lê o que o seed gravou
    const scope = { orgId: org.id, userId: owner.id, role: 'owner' as const };
    const open = await listInbox(db, scope, 'open');
    const closed = await listInbox(db, scope, 'closed');
    expect(open).toHaveLength(3); // conversas de cliente em aberto (a interna é do produto)
    expect(closed).toHaveLength(2);
    const labels = await listOrgLabels(db, scope);
    expect(labels).toContain('urgente');
    expect(labels).toContain('credito-tributario');
    const thread = await conversationThread(db, scope, open[0].id);
    expect(thread).not.toBeNull();
    expect(thread!.messages.length).toBeGreaterThanOrEqual(3);
  });

  it('é idempotente: rodar duas vezes não duplica nada', async () => {
    const { db, org, ctx } = await setupDemo();
    const first = await seedSupport(db, ctx);
    const second = await seedSupport(db, ctx);

    expect(second).toEqual(first);
    const conversations = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.orgId, org.id));
    expect(conversations).toHaveLength(6);
    const messages = await db.select().from(schema.supportMessages).where(inArray(schema.supportMessages.conversationId, conversations.map((c) => c.id)));
    expect(messages).toHaveLength(first.messages);
    const teams = await db.select().from(schema.supportTeams).where(eq(schema.supportTeams.orgId, org.id));
    expect(teams).toHaveLength(2);
    const articles = await db.select().from(schema.helpArticles).where(eq(schema.helpArticles.orgId, org.id));
    expect(articles).toHaveLength(4);
    const docs = await db.select().from(schema.docs).where(eq(schema.docs.orgId, org.id));
    expect(docs).toHaveLength(3);
    const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.orgId, org.id));
    expect(tasks).toHaveLength(3);
    const forms = await db.select().from(schema.supportPrechatForms).where(eq(schema.supportPrechatForms.orgId, org.id));
    expect(forms).toHaveLength(1);
    const policies = await db.select().from(schema.supportSlaPolicies).where(eq(schema.supportSlaPolicies.orgId, org.id));
    expect(policies).toHaveLength(1);
    const schedules = await db.select().from(schema.supportSchedules).where(eq(schema.supportSchedules.orgId, org.id));
    expect(schedules).toHaveLength(1);
    const teamMembers = await db.select().from(schema.supportTeamMembers);
    expect(teamMembers).toHaveLength(5);
  });

  it('não toca em outras operações', async () => {
    const { db, ctx } = await setupDemo();
    await seedSupport(db, ctx);
    const other = await seedOrg(db, 'Parceiro B');
    const convs = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.orgId, other.org.id));
    expect(convs).toHaveLength(0);
    const teams = await db.select().from(schema.supportTeams).where(eq(schema.supportTeams.orgId, other.org.id));
    expect(teams).toHaveLength(0);
    const articles = await db.select().from(schema.helpArticles).where(eq(schema.helpArticles.orgId, other.org.id));
    expect(articles).toHaveLength(0);
  });

  it('roda na org de demonstração real (ensureDemo) sem quebrar', async () => {
    const db = await testDb();
    const { user } = await seedOrg(db, 'Real');
    const orgId = await ensureDemo(db, user);
    const demoLeads = await db.select().from(schema.leads).where(eq(schema.leads.orgId, orgId));
    const mates = await db
      .select({ id: schema.users.id })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.orgId, orgId));
    const ctx: DemoCtx = {
      orgId,
      userId: user.id,
      userIds: mates.filter((m) => m.id !== user.id).map((m) => m.id),
      leads: demoLeads.map((l) => ({
        id: l.id, fullName: l.fullName, company: l.company, headline: l.headline, stage: l.stage, ownerId: l.ownerId ?? user.id,
      })),
      now: new Date(),
      rand: rng(42),
    };

    const summary = await seedSupport(db, ctx);
    expect(summary.conversations).toBe(6);
    expect(summary.teams).toBe(2);
    expect(summary.helpArticles).toBe(4);

    const conversations = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.orgId, orgId));
    expect(conversations).toHaveLength(6);
    expect(conversations.every((c) => c.visitorName.length > 0 && c.subject.length > 0)).toBe(true);
    // as conversas de cliente apontam para leads reais da demo
    expect(conversations.filter((c) => c.audience === 'customer' && c.leadId !== null).length).toBeGreaterThanOrEqual(4);
    // a org de produção (não-demo) continua vazia no suporte
    const prod = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.orgId, (await seedOrg(db, 'Outra')).org.id));
    expect(prod).toHaveLength(0);
  });
});

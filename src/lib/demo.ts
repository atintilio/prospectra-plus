import { and, eq } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import type { CampaignStep, EventType, LeadStage } from '@/db/schema';
import { addDays, dayString } from '@/lib/cadence';
import { hashPassword } from '@/lib/crypto';
import { seedAgenda } from '@/lib/demo-agenda';
import { seedVoice } from '@/lib/demo-voice';
import { seedSupport } from '@/lib/demo-support';
import { seedIntel } from '@/lib/demo-intel';

export const DEMO_ORG_NAME = 'Demonstração · Atlas Consultoria';

/** Org de demonstração (fictícia) do usuário, se já existir. */
export async function findDemoOrg(db: DB, userId: string) {
  const [row] = await db.select({ id: schema.orgs.id }).from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.orgs.isDemo, true))).limit(1);
  return row?.id ?? null;
}

const PEOPLE: [string, string, string, string, LeadStage, string][] = [
  ['Mariana Duarte', 'CFO', 'Metalúrgica Vale do Sul', 'Joinville, SC', 'meeting', 'industria'],
  ['Ricardo Bellini', 'Diretor Financeiro', 'Grupo Alvorada Têxtil', 'Blumenau, SC', 'won', 'industria'],
  ['Camila Ferraz', 'Head de Controladoria', 'Transportes Rota Sul', 'Curitiba, PR', 'replied', 'industria'],
  ['Eduardo Matsuda', 'CEO', 'AgroNorte Insumos', 'Cuiabá, MT', 'replied', 'industria'],
  ['Patrícia Lemos', 'Gerente Tributária', 'Rede Farmaviva', 'Porto Alegre, RS', 'meeting', 'industria'],
  ['Fábio Cardoso', 'CFO', 'Construtora Horizonte', 'Florianópolis, SC', 'connected', 'industria'],
  ['Juliana Prado', 'Diretora Financeira', 'Laticínios Serra Verde', 'Chapecó, SC', 'connected', 'industria'],
  ['André Souza', 'Sócio', 'Souza & Rocha Contadores', 'São Paulo, SP', 'connected', 'contadores'],
  ['Renata Oliveira', 'Contadora Sênior', 'Oliveira Assessoria Contábil', 'Campinas, SP', 'invited', 'contadores'],
  ['Thiago Nascimento', 'Sócio-diretor', 'TN Consultoria Fiscal', 'Belo Horizonte, MG', 'invited', 'contadores'],
  ['Larissa Monteiro', 'Head de Parcerias', 'Contabilizei Regional', 'Recife, PE', 'invited', 'contadores'],
  ['Gustavo Pires', 'Diretor Comercial', 'Pires Logística', 'Itajaí, SC', 'invited', 'industria'],
  ['Beatriz Azevedo', 'CFO', 'Hospital Santa Clara', 'Goiânia, GO', 'invited', 'industria'],
  ['Rodrigo Tavares', 'Controller', 'Frigorífico Pampa', 'Passo Fundo, RS', 'invited', 'industria'],
  ['Aline Barbosa', 'Sócia', 'Barbosa Advogados Associados', 'Brasília, DF', 'new', 'contadores'],
  ['Marcelo Quintela', 'CEO', 'Quintela Engenharia', 'Vitória, ES', 'new', 'industria'],
  ['Fernanda Ribeiro', 'Gerente Financeira', 'Cerâmica Santa Rita', 'Criciúma, SC', 'new', 'industria'],
  ['Leandro Fogaça', 'Diretor', 'Fogaça Distribuidora', 'Londrina, PR', 'new', 'industria'],
  ['Vanessa Coutinho', 'Head de Finanças', 'Tech Solar Energia', 'São José, SC', 'new', 'industria'],
  ['Henrique Salles', 'Sócio', 'Salles Auditoria', 'Rio de Janeiro, RJ', 'new', 'contadores'],
  ['Cláudia Werner', 'CFO', 'Werner Móveis', 'São Bento do Sul, SC', 'new', 'industria'],
  ['Otávio Brandão', 'Diretor Financeiro', 'Brandão Mineração', 'Poços de Caldas, MG', 'lost', 'industria'],
  ['Simone Teixeira', 'CEO', 'Teixeira Cosméticos', 'Curitiba, PR', 'lost', 'industria'],
  ['Paulo Henrique Lins', 'Gerente Administrativo', 'Lins Calçados', 'Novo Hamburgo, RS', 'do_not_contact', 'industria'],
];

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const STEPS_A: CampaignStep[] = [
  { id: 's1', type: 'react', delayDays: 0, condition: 'always', template: '', useAi: false },
  { id: 's2', type: 'invite', delayDays: 1, condition: 'always', template: 'Olá, {nome}! Acompanho o trabalho da {empresa} e vi que {cargo} costuma lidar com o peso tributário. Gostaria de conectar.', useAi: true },
  { id: 's3', type: 'message', delayDays: 2, condition: 'accepted', template: 'Obrigado por aceitar, {nome}! Ajudamos empresas como a {empresa} a recuperar crédito tributário sem desembolso. Faz sentido uma conversa de 15 minutos?', useAi: true },
  { id: 's4', type: 'message', delayDays: 4, condition: 'accepted', template: '{nome}, retomando: preparei um diagnóstico rápido para a {empresa}. Posso te enviar?', useAi: false },
];
const STEPS_B: CampaignStep[] = [
  { id: 's1', type: 'comment', delayDays: 0, condition: 'always', template: 'Excelente ponto, {nome}!', useAi: true },
  { id: 's2', type: 'invite', delayDays: 1, condition: 'always', template: 'Oi, {nome}! Trabalhamos com parcerias para escritórios contábeis. Vamos conectar?', useAi: false },
  { id: 's3', type: 'message', delayDays: 3, condition: 'accepted', template: '{nome}, temos um modelo de parceria em que seu escritório indica e acompanha o cliente. Quer conhecer?', useAi: false },
];

function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

/** Cria (uma vez) a base de demonstração do usuário: leads, cadências, fila, equipe e métricas fictícias. */
export async function ensureDemo(db: DB, user: { id: string; name: string }): Promise<string> {
  const existing = await findDemoOrg(db, user.id);
  if (existing) return existing;

  const now = new Date();
  const rand = rng(42);
  const [org] = await db.insert(schema.orgs).values({ name: DEMO_ORG_NAME, seats: 8, searchCreditsMonth: 300, isDemo: true }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: user.id, role: 'owner' });

  // equipe fictícia (contas desativadas: não fazem login nem recebem e-mail)
  const pw = await hashPassword(Math.random().toString(36));
  const mates = await db.insert(schema.users).values([
    { email: `demo-${org.id}-1@demo.invalid`, name: 'Bruna Lacerda', status: 'disabled', passwordHash: pw },
    { email: `demo-${org.id}-2@demo.invalid`, name: 'Caio Mendonça', status: 'disabled', passwordHash: pw },
    { email: `demo-${org.id}-3@demo.invalid`, name: 'Isadora Veiga', status: 'disabled', passwordHash: pw },
  ]).returning();
  await db.insert(schema.memberships).values([
    { orgId: org.id, userId: mates[0].id, role: 'manager' },
    { orgId: org.id, userId: mates[1].id, role: 'sdr' },
    { orgId: org.id, userId: mates[2].id, role: 'closer' },
  ]);
  const owners = [user.id, mates[1].id, mates[2].id];

  const leads = await db.insert(schema.leads).values(PEOPLE.map(([fullName, headline, company, location, stage, tag], i) => ({
    orgId: org.id, ownerId: owners[i % 3], fullName, headline, company, location, stage, tag,
    linkedinUrl: `https://www.linkedin.com/in/${slug(fullName)}-demo`,
    source: (['search', 'import', 'search', 'manual'] as const)[i % 4],
    notes: stage === 'meeting' ? 'Reunião agendada para esta semana. Pediu proposta com cenário de compensação.' : stage === 'replied' ? 'Respondeu interessado; aguardando melhor horário.' : '',
    lastActivityAt: addDays(now, -Math.floor(rand() * 9)),
  }))).returning();

  const [campA, campB, campC] = await db.insert(schema.campaigns).values([
    { orgId: org.id, ownerId: user.id, assignedTo: user.id, name: 'Abertura · CFOs da indústria', status: 'active', steps: STEPS_A, aiBrief: 'Tom consultivo e direto. Mencione recuperação de crédito tributário sem desembolso.' },
    { orgId: org.id, ownerId: user.id, assignedTo: user.id, name: 'Parcerias · Escritórios contábeis', status: 'active', steps: STEPS_B, aiBrief: 'Tom de parceria entre pares; foque em indicação e acompanhamento do cliente.' },
    { orgId: org.id, ownerId: user.id, assignedTo: user.id, name: 'Evento Reforma Tributária (encerrada)', status: 'finished', steps: STEPS_B.slice(0, 2), aiBrief: '' },
  ]).returning();

  // inscrições: leads em andamento entram nas cadências; encerrados ficam como concluídos/parados
  const today = dayString(now);
  let pendingMade = 0;
  for (const lead of leads) {
    if (lead.stage === 'new' || lead.stage === 'do_not_contact') continue;
    const camp = lead.tag === 'contadores' ? campB : campA;
    const steps = camp.steps;
    const terminal = ['replied', 'meeting', 'won', 'lost'].includes(lead.stage);
    const stepIndex = terminal ? steps.length - 1 : lead.stage === 'invited' ? 2 : 1;
    const state = terminal ? 'stopped' : lead.stage === 'invited' ? 'waiting_accept' : 'running';
    const [enr] = await db.insert(schema.enrollments).values({
      orgId: org.id, campaignId: camp.id, leadId: lead.id, stepIndex: Math.min(stepIndex, steps.length - 1), state,
      nextRunAt: addDays(now, state === 'running' ? 2 : 3650),
    }).returning();
    // ações já executadas
    const doneTypes = steps.slice(0, Math.min(stepIndex, steps.length)).map((s, idx) => ({ s, idx }));
    for (const { s, idx } of doneTypes) {
      await db.insert(schema.actions).values({
        orgId: org.id, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id, userId: user.id, stepIndex: idx, type: s.type,
        body: s.template.replace('{nome}', lead.fullName.split(' ')[0]).replace('{empresa}', lead.company).replace('{cargo}', lead.headline),
        dueDate: dayString(addDays(now, -(steps.length - idx + 1))), status: 'done', executedAt: addDays(now, -(steps.length - idx + 1)),
      }).onConflictDoNothing();
    }
    // fila de hoje: leads "connected" ganham a mensagem de follow-up pendente
    if (lead.stage === 'connected' && pendingMade < 6) {
      const idx = Math.min(2, steps.length - 1);
      const s = steps[idx];
      await db.insert(schema.actions).values({
        orgId: org.id, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id, userId: user.id, stepIndex: idx, type: s.type,
        body: s.template.replace('{nome}', lead.fullName.split(' ')[0]).replace('{empresa}', lead.company).replace('{cargo}', lead.headline),
        dueDate: today, status: 'pending',
      }).onConflictDoNothing();
      await db.update(schema.enrollments).set({ stepIndex: idx, nextRunAt: addDays(now, 3650) }).where(eq(schema.enrollments.id, enr.id));
      pendingMade++;
    }
  }
  // novos leads: convites e curtidas pendentes para hoje (mostra a fila cheia)
  const fresh = leads.filter((l) => l.stage === 'new' && l.ownerId === user.id || l.stage === 'new').slice(0, 5);
  for (const lead of fresh) {
    const camp = lead.tag === 'contadores' ? campB : campA;
    const [enr] = await db.insert(schema.enrollments).values({ orgId: org.id, campaignId: camp.id, leadId: lead.id, stepIndex: 0, state: 'running', nextRunAt: addDays(now, 3650) }).returning();
    const s = camp.steps[0];
    await db.insert(schema.actions).values({
      orgId: org.id, enrollmentId: enr.id, campaignId: camp.id, leadId: lead.id, userId: user.id, stepIndex: 0, type: s.type,
      body: s.type === 'comment' ? 'Excelente ponto sobre a Reforma Tributária — o impacto no crédito acumulado é subestimado.' : '', dueDate: today, status: 'pending',
    }).onConflictDoNothing();
  }
  void campC;

  // eventos dos últimos 60 dias (alimentam KPIs, comparativo, gráfico e ranking da equipe)
  const people = [user.id, mates[0].id, mates[1].id, mates[2].id];
  const evs: (typeof schema.events.$inferInsert)[] = [];
  for (let d = 59; d >= 0; d--) {
    const weekday = addDays(now, -d).getDay();
    const growth = (0.6 + (60 - d) / 60) * (weekday === 0 || weekday === 6 ? 0.2 : 1); // tendência de alta, fins de semana fracos
    for (const uid of people) {
      const invites = Math.round((4 + rand() * 6) * growth);
      for (let i = 0; i < invites; i++) evs.push({ orgId: org.id, userId: uid, type: 'invite_sent', campaignId: campA.id, at: addDays(now, -d) });
      const msgs = Math.round((3 + rand() * 5) * growth);
      for (let i = 0; i < msgs; i++) evs.push({ orgId: org.id, userId: uid, type: 'message_sent', campaignId: campA.id, at: addDays(now, -d) });
      const push = (type: EventType, p: number) => { if (rand() < p * growth) evs.push({ orgId: org.id, userId: uid, type, campaignId: campB.id, at: addDays(now, -d) }); };
      push('invite_accepted', 0.9); push('invite_accepted', 0.6); push('reply_received', 0.55); push('reaction_sent', 0.8); push('meeting_booked', 0.12); push('deal_won', 0.03);
    }
  }
  // últimos acontecimentos ligados a leads reais da demo (aparecem em "Atividade recente")
  const hot: [string, EventType, number][] = [['Mariana Duarte', 'meeting_booked', 0], ['Ricardo Bellini', 'deal_won', 1], ['Camila Ferraz', 'reply_received', 0], ['Eduardo Matsuda', 'reply_received', 1], ['Fábio Cardoso', 'invite_accepted', 0], ['Patrícia Lemos', 'meeting_booked', 2]];
  for (const [name, type, daysAgo] of hot) {
    const l = leads.find((x) => x.fullName === name)!;
    evs.push({ orgId: org.id, userId: l.ownerId, type, leadId: l.id, campaignId: campA.id, at: new Date(now.getTime() - daysAgo * 86400_000 - 3600_000) });
  }
  for (let i = 0; i < evs.length; i += 500) await db.insert(schema.events).values(evs.slice(i, i + 500));

  // ── Módulos da suíte (agenda, voz, suporte, inteligência) ─────────────────
  // Mesmo contexto para todos: mesma operação, mesma equipe, mesmos leads.
  const ctx = {
    orgId: org.id,
    userId: user.id,
    userIds: mates.map((m) => m.id),
    leads: leads.map((l) => ({
      id: l.id,
      fullName: l.fullName,
      company: l.company,
      headline: l.headline,
      stage: l.stage,
      ownerId: l.ownerId ?? user.id,
    })),
    now,
    rand,
  };
  await seedAgenda(db, ctx);
  await seedVoice(db, ctx);
  await seedSupport(db, ctx);
  await seedIntel(db, ctx);

  return org.id;
}

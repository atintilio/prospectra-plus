import { afterEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@/db';
import { testDb, seedOrg } from './helpers';
import { runIntelligenceQueue } from '@/lib/intelligence/runner';
import { queueAnalysisAction } from '@/app/(app)/inteligencia/analysis-actions';

// A ação de fila continua recusando sem a flag: este módulo não muda o gate.
vi.mock('@/lib/auth', () => ({
  requireOrg: async () => ({ user: { id: 'user-1' }, org: { id: 'org-1', active: true, isDemo: false } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

const AI_JSON = JSON.stringify({
  position_seniority: 90,
  company_size: 70,
  digital_presence: 80,
  osint_risk: 85,
});

async function seedJob(db: Awaited<ReturnType<typeof testDb>>, org: { id: string }, user: { id: string }) {
  const [lead] = await db.insert(schema.leads).values({
    orgId: org.id,
    ownerId: user.id,
    linkedinUrl: `https://www.linkedin.com/in/lead-${crypto.randomUUID()}`,
    fullName: 'Maria Souza',
    headline: 'Diretora de Vendas',
    company: 'Acme Indústria',
    location: 'São Paulo',
    email: 'maria.souza@acme.com.br',
    phone: '+5511999990000',
  }).returning();
  const [job] = await db.insert(schema.intelligenceJobs).values({
    id: crypto.randomUUID(),
    orgId: org.id,
    userId: user.id,
    leadId: lead.id,
  }).returning();
  return { lead, job };
}

test('o runner tira o job da fila e conclui com resultado válido', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Runner A');
  const { job } = await seedJob(db, a.org, a.user);
  expect(job.state).toBe('queued');

  const ai = vi.fn(async () => AI_JSON);
  const summary = await runIntelligenceQueue(db, { ai });

  expect(summary.claimed).toBe(1);
  expect(summary.completed).toBe(1);
  expect(summary.failed).toBe(0);
  expect(ai).toHaveBeenCalledTimes(1);

  const [row] = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id, job.id));
  expect(row.state).toBe('completed');
  expect(row.error).toBeNull();
  expect(row.completedAt).not.toBeNull();
  expect(row.attempts).toBe(1);

  const result = row.result;
  expect(result).toBeTruthy();
  if (!result) throw new Error('resultado ausente');
  // Os 6 fatores com os nomes exatos que a tela mapeia.
  expect(Object.keys(result.factors).sort()).toEqual([
    'company_size', 'data_completeness', 'digital_presence', 'email_validity', 'osint_risk', 'position_seniority',
  ]);
  expect(result.factors.position_seniority).toBe(90);
  expect(result.factors.company_size).toBe(70);
  expect(result.factors.digital_presence).toBe(80);
  expect(result.factors.osint_risk).toBe(85);
  expect(result.unavailableFactors).toEqual([]);
  expect(result.priorityAvailable).toBe(true);
  // média dos fatores disponíveis: (90+70+100+80+85+90)/6
  expect(result.score).toBeCloseTo(85.83, 2);
  expect(result.priority).toBe('HIGH');
  expect(result.hot).toBe(true);
});

test('rodar o runner de novo não reprocessa o job concluído', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Runner B');
  const { job } = await seedJob(db, a.org, a.user);
  const ai = vi.fn(async () => AI_JSON);

  const first = await runIntelligenceQueue(db, { ai });
  expect(first.completed).toBe(1);
  const second = await runIntelligenceQueue(db, { ai });

  expect(second.claimed).toBe(0);
  expect(second.completed).toBe(0);
  expect(ai).toHaveBeenCalledTimes(1);

  const [row] = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id, job.id));
  expect(row.state).toBe('completed');
  expect(row.attempts).toBe(1);
});

test('IA sem saldo conclui o job com a heurística e unavailableFactors preenchido', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Runner C');
  const { job } = await seedJob(db, a.org, a.user);
  const ai = vi.fn(async () => {
    throw new Error('AI_UNAVAILABLE_1113');
  });

  const summary = await runIntelligenceQueue(db, { ai });

  expect(summary.completed).toBe(1);
  expect(summary.failed).toBe(0);
  expect(summary.aiFailed).toBe(1);

  const [row] = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id, job.id));
  expect(row.state).toBe('completed');
  const result = row.result;
  if (!result) throw new Error('resultado ausente');
  // O que a IA não respondeu fica indisponível e fora da média.
  expect(result.unavailableFactors).toEqual(expect.arrayContaining([
    'position_seniority', 'company_size', 'digital_presence', 'osint_risk',
  ]));
  expect(result.priorityAvailable).toBe(false);
  // A heurística ainda alimenta a pontuação (completude e e-mail).
  expect(result.factors.data_completeness).toBe(100);
  expect(result.factors.email_validity).toBe(90);
  expect(result.score).toBeCloseTo(95, 2);
  expect(row.error).toBeNull();
});

test('resposta da IA fora do formato não derruba o job', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Runner D');
  const { job } = await seedJob(db, a.org, a.user);
  const ai = vi.fn(async () => 'Desculpe, não consegui responder agora.');

  const summary = await runIntelligenceQueue(db, { ai });

  expect(summary.completed).toBe(1);
  expect(summary.aiFailed).toBe(1);
  const [row] = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id, job.id));
  expect(row.state).toBe('completed');
  const result = row.result;
  if (!result) throw new Error('resultado ausente');
  expect(result.unavailableFactors).toContain('position_seniority');
  expect(result.priorityAvailable).toBe(false);
});

test('job com tentativas esgotadas falha sem reprocessar', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Runner E');
  const { job } = await seedJob(db, a.org, a.user);
  await db.update(schema.intelligenceJobs).set({ attempts: 3 }).where(eq(schema.intelligenceJobs.id, job.id));
  const ai = vi.fn(async () => AI_JSON);

  const summary = await runIntelligenceQueue(db, { ai });

  expect(summary.completed).toBe(0);
  expect(summary.failed).toBe(1);
  expect(ai).not.toHaveBeenCalled();

  const [row] = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id, job.id));
  expect(row.state).toBe('failed');
  expect(row.error).toBeTruthy();
  expect(row.error?.length ?? 0).toBeLessThanOrEqual(200);
  expect(row.attempts).toBe(3);
});

test('lead sem e-mail deixa a validação de e-mail indisponível', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Runner F');
  const [lead] = await db.insert(schema.leads).values({
    orgId: a.org.id,
    ownerId: a.user.id,
    linkedinUrl: 'https://www.linkedin.com/in/sem-email',
    fullName: 'João Sem Contato',
    headline: 'Analista',
  }).returning();
  const [job] = await db.insert(schema.intelligenceJobs).values({
    id: crypto.randomUUID(),
    orgId: a.org.id, userId: a.user.id, leadId: lead.id,
  }).returning();
  const ai = vi.fn(async () => AI_JSON);

  await runIntelligenceQueue(db, { ai });

  const [row] = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id, job.id));
  const result = row.result;
  if (!result) throw new Error('resultado ausente');
  expect(result.unavailableFactors).toContain('email_validity');
  // e-mail indisponível não conta na média: (90+70+80+85+33)/5
  expect(result.score).toBeCloseTo(71.6, 2);
});

test('job já reclamado por outro executor não é processado em duplicidade', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Runner G');
  const { job } = await seedJob(db, a.org, a.user);
  // Outro executor pegou o job: running com claimedAt recente não volta para a fila.
  await db.update(schema.intelligenceJobs)
    .set({ state: 'running', claimedAt: new Date(), attempts: 1 })
    .where(eq(schema.intelligenceJobs.id, job.id));
  const ai = vi.fn(async () => AI_JSON);

  const summary = await runIntelligenceQueue(db, { ai });

  expect(summary.claimed).toBe(0);
  expect(summary.completed).toBe(0);
  expect(ai).not.toHaveBeenCalled();
  const [row] = await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id, job.id));
  expect(row.state).toBe('running');
  expect(row.attempts).toBe(1);
});

test('a ação da tela continua recusando com a flag desligada', async () => {
  vi.stubEnv('INTELLIGENCE_WORKER_ENABLED', 'false');
  const answer = await queueAnalysisAction({ message: '' }, new FormData());
  expect(answer.message).toContain('não está disponível');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

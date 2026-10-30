import 'server-only';
import { and, asc, eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema, type DB } from '@/db';
import { aiComplete, aiConfigured } from '@/lib/ai';

// Executor da inteligência comercial: pega a fila (intelligence_jobs em 'queued'),
// produz o resultado da análise e devolve o job concluído.
//
// Regras que valem para tudo aqui:
//  - a IA entra por aiComplete (src/lib/ai) e é opcional: se ela falhar (sem saldo,
//    rate limit, timeout ou resposta fora do formato) o job COMPLETA com a heurística
//    e registra em unavailableFactors o que ficou sem resposta — a IA nunca derruba o job;
//  - o resultado tem os 6 fatores com os nomes exatos que a tela mapeia
//    (src/app/(app)/inteligencia/page.tsx); o formato não muda;
//  - a reclaim usa FOR UPDATE SKIP LOCKED + update condicional em 'queued', então duas
//    execuções simultâneas não pegam o mesmo job.

/** Os 6 fatores do resultado — nomes exatos, usados pela tela. */
export const INTELLIGENCE_FACTORS = [
  'position_seniority',
  'company_size',
  'data_completeness',
  'digital_presence',
  'osint_risk',
  'email_validity',
] as const;

export type IntelligenceFactor = (typeof INTELLIGENCE_FACTORS)[number];

/** Fatores que dependem de leitura de texto livre: quem responde é a IA. */
const AI_FACTORS = [
  'position_seniority',
  'company_size',
  'digital_presence',
  'osint_risk',
] as const satisfies readonly IntelligenceFactor[];

export type IntelligenceFactors = Record<IntelligenceFactor, number>;

/** Formato do resultado — o mesmo que a tela já consome. */
export type IntelligenceResult = {
  score: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  hot: boolean;
  priorityAvailable: boolean;
  factors: IntelligenceFactors;
  unavailableFactors: IntelligenceFactor[];
};

export type IntelligenceRunSummary = {
  claimed: number;
  completed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  aiUsed: number;
  aiFailed: number;
  aiSkipped: number;
};

/** Injeção da IA: em produção é o aiComplete; nos testes, um dublê. */
export type IntelligenceAi = (system: string, user: string, maxTokens?: number) => Promise<string>;

const MAX_ATTEMPTS = 3;
const DEFAULT_BATCH = 5;
const MAX_BATCH = 20;
/** Job travado em 'running' por mais que isso volta para a fila (ou falha se gastou as tentativas). */
const STALE_CLAIM_MS = 10 * 60 * 1000;
const AI_MAX_TOKENS = 400;

// ---------------------------------------------------------------------------
// Heurística determinística (sempre disponível; não depende de provedor externo)
// ---------------------------------------------------------------------------

type LeadProfile = {
  fullName: string;
  headline: string;
  company: string;
  location: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  attributes: Record<string, unknown>;
};

const SENIORITY_EXEC = /\b(ceo|cfo|cto|coo|cmo|chief|founder|fundador|fundadora|owner|presidente|s[oó]cio|s[oó]cia|diretor|diretora|director|vice-presidente|vp|head\s+of|gerente\s+geral|managing\s+(director|partner)|partner)\b/i;
const SENIORITY_MANAGER = /\b(gerente|manager|tech\s+lead|head\s+lead|l[ií]der|leader|coordenador|coordenadora|respons[aá]vel|supervisor|principal|senior|s[eé]nior|sr\.?)\b/i;
const SENIORITY_PROFESSIONAL = /\b(analista|analyst|engenheir|engineer|designer|consultor|consultant|especialista|specialist|advogado|professor|t[eé]cnico|operador|sales)\b/i;
const SENIORITY_JUNIOR = /\b(j[uú]nior|junior|trainee|estagi[aá]ri\w*|intern|aprendiz|entry[- ]level|assistente)\b/i;

const GENERIC_MAILBOX = /^(info|contato|contact|admin|administrador|vendas|sales|suporte|support|geral|comercial|marketing|financeiro|rh|help|office|atendimento)@/i;
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u030f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Porte declarado pela operação (funcionários) ou rótulo de porte em qualquer atributo. */
function sizeEvidence(attributes: Record<string, unknown>): number | null {
  const keys = ['employeecount', 'employees', 'headcount', 'funcionarios', 'numfuncionarios', 'teamsize', 'companysize', 'size', 'porte'];
  for (const [key, value] of Object.entries(attributes)) {
    const normalized = normalizeKey(key);
    if (!keys.some((candidate) => normalized.includes(candidate))) continue;
    const label = String(value ?? '').trim().toLowerCase();
    if (/enterprise|grande porte|\bgrande\b/.test(label)) return 1000;
    if (/mid[- ]?market|\bmid\b|m[eé]di[oa]/.test(label)) return 200;
    if (/small|pequen[ha]/.test(label)) return 30;
    if (/startup/.test(label)) return 15;
    const numeric = typeof value === 'number' ? value : Number(label.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function companySizeScore(profile: LeadProfile): number {
  const employees = sizeEvidence(profile.attributes);
  if (employees === null) return 50;
  if (employees >= 1000) return 90;
  if (employees >= 200) return 80;
  if (employees >= 50) return 70;
  if (employees >= 10) return 60;
  return 50;
}

/** Senioridade pelo cargo informado (0-100). Sem cargo, fica no meio — a IA refine quando responde. */
function positionSeniorityScore(headline: string): number {
  const role = headline.trim();
  if (!role) return 50;
  if (SENIORITY_EXEC.test(role)) return 95;
  if (SENIORITY_MANAGER.test(role)) return 75;
  if (SENIORITY_PROFESSIONAL.test(role)) return 60;
  if (SENIORITY_JUNIOR.test(role)) return 30;
  return 50;
}

/** Completude dos dados de contato do cadastro (6 campos). */
function dataCompletenessScore(profile: LeadProfile): number {
  const fields = [profile.email, profile.phone, profile.linkedinUrl, profile.headline, profile.company, profile.location];
  const filled = fields.filter((value) => value.trim().length > 0).length;
  return Math.round((filled / fields.length) * 100);
}

/** Presença digital visível nos dados do cadastro. */
function digitalPresenceScore(profile: LeadProfile): number {
  let score = 0;
  if (profile.linkedinUrl.trim()) score += 40;
  if (profile.headline.trim()) score += 25;
  if (profile.company.trim()) score += 20;
  if (Object.keys(profile.attributes).length >= 2) score += 15;
  return Math.min(score, 100);
}

/**
 * Confiabilidade das fontes. O fator se chama osint_risk, mas o valor é o
 * quanto os dados são confiáveis (100 = nenhum sinal de risco, 0 = muitos sinais),
 * como no executor Python já versionado no repo.
 */
function osintRiskScore(profile: LeadProfile): number {
  let score = 100;
  const email = profile.email.trim().toLowerCase();
  if (!email) score -= 20;
  else if (GENERIC_MAILBOX.test(email)) score -= 25;
  else if (!EMAIL_PATTERN.test(email)) score -= 15;
  if (!profile.phone.trim()) score -= 10;
  if (!profile.linkedinUrl.trim()) score -= 10;
  if (!profile.headline.trim()) score -= 10;
  return Math.max(0, Math.min(score, 100));
}

/** Validação de e-mail: presença + formato. Sem e-mail não há o que validar. */
function emailValidityScore(profile: LeadProfile): number | null {
  const email = profile.email.trim().toLowerCase();
  if (!email) return null;
  if (!EMAIL_PATTERN.test(email)) return 15;
  if (GENERIC_MAILBOX.test(email)) return 50;
  return 90;
}

function heuristicFactors(profile: LeadProfile): IntelligenceFactors {
  return {
    position_seniority: positionSeniorityScore(profile.headline),
    company_size: companySizeScore(profile),
    data_completeness: dataCompletenessScore(profile),
    digital_presence: digitalPresenceScore(profile),
    osint_risk: osintRiskScore(profile),
    email_validity: emailValidityScore(profile) ?? 0,
  };
}

// ---------------------------------------------------------------------------
// IA (cérebro dos fatores de texto) — entra por aiComplete, nunca direto na z.ai
// ---------------------------------------------------------------------------

const factorValue = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
  z.number().finite().min(0).max(100),
);

const aiFactorsSchema = z.object({
  position_seniority: factorValue.optional(),
  company_size: factorValue.optional(),
  digital_presence: factorValue.optional(),
  osint_risk: factorValue.optional(),
});

const AI_SYSTEM = [
  'Você é o cérebro da inteligência comercial do Prospectra. Avalia um lead a partir dos dados já coletados no CRM.',
  'Responda APENAS com JSON, sem texto antes ou depois, no formato:',
  '{"position_seniority":<0-100>,"company_size":<0-100>,"digital_presence":<0-100>,"osint_risk":<0-100>}',
  'position_seniority: senioridade do cargo (executivo alto, entrada baixo).',
  'company_size: porte da empresa (empresa grande vale mais alto).',
  'digital_presence: presença digital visível nos dados informados.',
  'osint_risk: CONFIABILIDADE das fontes — 100 significa nenhum sinal de risco, 0 significa muitos sinais (e-mail genérico, dados faltando, incoerências).',
  'Use apenas o que está nos dados. Sem evidência, responda 50. Não invente fatos, não explique, não escreva texto fora do JSON.',
].join(' ');

function profileForAi(profile: LeadProfile): string {
  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(profile.attributes).slice(0, 20)) {
    attributes[key] = typeof value === 'string' ? value.slice(0, 120) : JSON.stringify(value)?.slice(0, 120) ?? '';
  }
  return JSON.stringify({
    nome: profile.fullName,
    cargo: profile.headline || null,
    empresa: profile.company || null,
    cidade: profile.location || null,
    email: profile.email || null,
    telefone: profile.phone || null,
    linkedin: profile.linkedinUrl || null,
    atributos: attributes,
  });
}

/** Lê o JSON da IA. Resposta fora do formato vira lista vazia — o job não quebra. */
function parseAiFactors(raw: string): Partial<Record<IntelligenceFactor, number>> {
  const text = (raw ?? '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const source = parsed as Record<string, unknown>;
  const nested = source.factors;
  const candidate = nested && typeof nested === 'object' && !Array.isArray(nested) ? (nested as Record<string, unknown>) : source;
  const values: Partial<Record<IntelligenceFactor, number>> = {};
  for (const factor of AI_FACTORS) {
    const parsedFactor = aiFactorsSchema.shape[factor].safeParse(candidate[factor]);
    if (parsedFactor.success) values[factor] = parsedFactor.data;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Fila: claim, execução e conclusão
// ---------------------------------------------------------------------------

type ClaimedJob = { id: string; orgId: string; userId: string; leadId: string; attempts: number };

type ClaimOutcome = { claimed: ClaimedJob[]; exhausted: number };

/**
 * Reivindica a fila. O SELECT usa FOR UPDATE SKIP LOCKED e o UPDATE é condicional
 * (state='queued'), então duas execuções simultâneas nunca pegam o mesmo job.
 */
async function claimJobs(database: DB, limit: number, now: Date): Promise<ClaimOutcome> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  return database.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(schema.intelligenceJobs)
      .where(or(
        eq(schema.intelligenceJobs.state, 'queued'),
        and(eq(schema.intelligenceJobs.state, 'running'), lt(schema.intelligenceJobs.claimedAt, staleBefore)),
      ))
      .orderBy(asc(schema.intelligenceJobs.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true });

    const claimed: ClaimedJob[] = [];
    let exhausted = 0;
    for (const row of candidates) {
      if (row.attempts >= MAX_ATTEMPTS) {
        // Tentativas esgotadas: falha curta e sem reprocessar.
        const failed = await tx
          .update(schema.intelligenceJobs)
          .set({ state: 'failed', error: 'Limite de tentativas excedido.', completedAt: now })
          .where(and(eq(schema.intelligenceJobs.id, row.id), eq(schema.intelligenceJobs.state, row.state)))
          .returning({ id: schema.intelligenceJobs.id });
        if (failed.length) exhausted += 1;
        continue;
      }
      const updated = await tx
        .update(schema.intelligenceJobs)
        .set({ state: 'running', claimedAt: now, attempts: row.attempts + 1, error: null })
        .where(and(
          eq(schema.intelligenceJobs.id, row.id),
          or(
            eq(schema.intelligenceJobs.state, 'queued'),
            and(eq(schema.intelligenceJobs.state, 'running'), lt(schema.intelligenceJobs.claimedAt, staleBefore)),
          ),
        ))
        .returning({ id: schema.intelligenceJobs.id, attempts: schema.intelligenceJobs.attempts });
      // Update sem linha devolvida = outro executor pegou o job primeiro.
      if (!updated.length) continue;
      claimed.push({
        id: row.id,
        orgId: row.orgId,
        userId: row.userId,
        leadId: row.leadId,
        attempts: updated[0].attempts,
      });
    }
    return { claimed, exhausted };
  });
}

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const clean = message.replace(/\s+/g, ' ').trim().slice(0, 200);
  return clean || 'Falha inesperada na análise.';
}

type JobOutcome = {
  state: 'completed' | 'failed' | 'cancelled';
  result?: IntelligenceResult;
  aiUsed: boolean;
  aiFailed: boolean;
  aiSkipped: boolean;
};

async function analyseJob(
  database: DB,
  job: ClaimedJob,
  deps: { ai: IntelligenceAi; aiAvailable: boolean; maxTokens: number },
): Promise<JobOutcome> {
  const [row] = await database
    .select({
      lead: schema.leads,
      orgActive: schema.orgs.active,
      orgDemo: schema.orgs.isDemo,
      aiEnabled: schema.orgs.aiEnabled,
      userStatus: schema.users.status,
      userRole: schema.users.platformRole,
    })
    .from(schema.leads)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.leads.orgId))
    .innerJoin(schema.users, eq(schema.users.id, job.userId))
    .where(eq(schema.leads.id, job.leadId));

  if (!row) return { state: 'cancelled', aiUsed: false, aiFailed: false, aiSkipped: false };

  // Acesso revogado (lead trocou de dono, opt-out, operação inativa, vendedor desativado)
  // cancela o job: nada é analisado fora da carteira do vendedor.
  const [membership] = await database
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, job.orgId), eq(schema.memberships.userId, job.userId)));
  const revoked = row.lead.orgId !== job.orgId
    || row.lead.ownerId !== job.userId
    || row.lead.stage === 'do_not_contact'
    || !row.orgActive
    || row.orgDemo
    || row.userStatus !== 'active'
    || (!membership && row.userRole !== 'admin');
  if (revoked) {
    return { state: 'cancelled', aiUsed: false, aiFailed: false, aiSkipped: false };
  }

  const profile: LeadProfile = {
    fullName: row.lead.fullName,
    headline: row.lead.headline,
    company: row.lead.company,
    location: row.lead.location,
    email: row.lead.email,
    phone: row.lead.phone,
    linkedinUrl: row.lead.linkedinUrl,
    attributes: asRecord(row.lead.attributes),
  };

  const heuristic = heuristicFactors(profile);
  const factors: IntelligenceFactors = { ...heuristic };
  const unavailable: IntelligenceFactor[] = [];

  // e-mail sem endereço não tem o que validar.
  if (emailValidityScore(profile) === null) unavailable.push('email_validity');

  let aiUsed = false;
  let aiFailed = false;
  const answeredByAi = new Set<IntelligenceFactor>();
  // A operação pode desligar a IA; sem IA os fatores de texto ficam indisponíveis.
  if (deps.aiAvailable && row.aiEnabled) {
    try {
      const raw = await deps.ai(AI_SYSTEM, profileForAi(profile), deps.maxTokens);
      const aiValues = parseAiFactors(raw);
      for (const factor of AI_FACTORS) {
        const value = aiValues[factor];
        if (typeof value !== 'number') continue;
        factors[factor] = value;
        answeredByAi.add(factor);
      }
      if (!answeredByAi.size) {
        aiFailed = true;
        console.warn('[intelligence] resposta da IA fora do formato; a análise segue com a heurística.');
      } else {
        aiUsed = true;
      }
    } catch (error) {
      aiFailed = true;
      console.warn('[intelligence] IA indisponível para a análise:', shortError(error));
    }
  }

  // Fator que a IA não respondeu fica indisponível e não entra na média.
  for (const factor of AI_FACTORS) {
    if (!answeredByAi.has(factor) && !unavailable.includes(factor)) unavailable.push(factor);
  }

  const result = buildResult(factors, unavailable);
  const aiSkipped = !aiUsed && !aiFailed;
  return { state: 'completed', result, aiUsed, aiFailed, aiSkipped };
}

/** Score = média dos fatores DISPONÍVEIS; indisponível não conta. */
function buildResult(factors: IntelligenceFactors, unavailable: IntelligenceFactor[]): IntelligenceResult {
  const available = INTELLIGENCE_FACTORS.filter((factor) => !unavailable.includes(factor));
  const values = available.map((factor) => factors[factor]).filter((value) => Number.isFinite(value));
  const score = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
  const priority = score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';
  return {
    score,
    priority,
    hot: priority === 'HIGH',
    // Sem cargo lido não dá para afirmar a prioridade comercial.
    priorityAvailable: !unavailable.includes('position_seniority'),
    factors,
    unavailableFactors: unavailable,
  };
}

/**
 * Executa a fila de inteligência: para cada job pendente produz o resultado e
 * devolve o job concluído. A IA é opcional — se falhar, o job completa com a heurística.
 */
export async function runIntelligenceQueue(
  db?: DB,
  deps: { now?: Date; limit?: number; ai?: IntelligenceAi; maxTokens?: number } = {},
): Promise<IntelligenceRunSummary> {
  const database = db ?? (await getDb());
  const now = deps.now ?? new Date();
  const limit = Math.min(Math.max(deps.limit ?? DEFAULT_BATCH, 1), MAX_BATCH);
  const maxTokens = deps.maxTokens ?? AI_MAX_TOKENS;
  const injected = deps.ai;
  const ai = injected ?? aiComplete;
  const aiAvailable = injected ? true : aiConfigured();
  const summary: IntelligenceRunSummary = {
    claimed: 0, completed: 0, failed: 0, cancelled: 0, skipped: 0, aiUsed: 0, aiFailed: 0, aiSkipped: 0,
  };

  const { claimed, exhausted } = await claimJobs(database, limit, now);
  summary.failed += exhausted;

  for (const job of claimed) {
    summary.claimed += 1;
    try {
      const outcome = await analyseJob(database, job, { ai, aiAvailable, maxTokens });
      if (outcome.state === 'completed' && outcome.result) {
        const done = await database
          .update(schema.intelligenceJobs)
          .set({ state: 'completed', result: outcome.result, error: null, completedAt: now })
          .where(and(
            eq(schema.intelligenceJobs.id, job.id),
            eq(schema.intelligenceJobs.state, 'running'),
            eq(schema.intelligenceJobs.attempts, job.attempts),
          ))
          .returning({ id: schema.intelligenceJobs.id });
        if (!done.length) {
          // Outro ciclo já mexeu no job: não sobrescreve o resultado de outro executor.
          summary.skipped += 1;
        } else {
          summary.completed += 1;
        }
      } else {
        const cancelled = await database
          .update(schema.intelligenceJobs)
          .set({ state: outcome.state, error: 'Acesso a este lead não está mais válido.', completedAt: now })
          .where(and(
            eq(schema.intelligenceJobs.id, job.id),
            eq(schema.intelligenceJobs.state, 'running'),
            eq(schema.intelligenceJobs.attempts, job.attempts),
          ))
          .returning({ id: schema.intelligenceJobs.id });
        if (!cancelled.length) summary.skipped += 1;
        else summary.cancelled += 1;
      }
      if (outcome.aiUsed) summary.aiUsed += 1;
      if (outcome.aiFailed) summary.aiFailed += 1;
      if (outcome.aiSkipped) summary.aiSkipped += 1;
    } catch (error) {
      // Falha inesperada vira erro curto no job; a fila continua.
      const message = shortError(error);
      console.error('[intelligence] falha ao processar a análise:', message);
      await database
        .update(schema.intelligenceJobs)
        .set({ state: 'failed', error: message, completedAt: now })
        .where(and(
          eq(schema.intelligenceJobs.id, job.id),
          eq(schema.intelligenceJobs.state, 'running'),
          eq(schema.intelligenceJobs.attempts, job.attempts),
        ));
      summary.failed += 1;
    }
  }

  return summary;
}

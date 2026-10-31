import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import type { CommercialOffer } from '@/db/schema';

/**
 * Semente da DEMONSTRAÇÃO — inteligência comercial, operação comercial (Harvey),
 * perfis de comunicação, automações, auditoria e webhooks.
 *
 * Regras:
 *  - nada de rede: nenhum e-mail, WhatsApp, IA ou webhook é disparado aqui. Tudo é
 *    dado fictício já gravado no banco (as integrações reais já têm ramo de demo);
 *  - nada de dado pessoal real: e-mails `@demo.invalid` e telefones no padrão
 *    `+55 51 9XXXX-XXXX`. O telefone do vendedor é o do contrato (+5548999990001),
 *    nunca o número do dono;
 *  - idempotente: rodar de novo na mesma org não duplica nada (ids determinísticos
 *    + `onConflictDoNothing` + verificação antes de inserir);
 *  - o `result` dos jobs de inteligência tem EXATAMENTE o formato que a tela consome
 *    (src/app/(app)/inteligencia/page.tsx) e o `profile` das conversas do Harvey tem
 *    o formato de src/lib/harvey-operations.ts.
 */

/** Lead da demo, como o contexto compartilhado entrega. */
export type DemoSeedLead = {
  id: string;
  fullName: string;
  company: string;
  headline: string;
  stage: string;
  ownerId: string | null;
};

/**
 * Contexto compartilhado com o seed da demo. `db` é opcional e ignorado: o banco
 * usado é o primeiro argumento de `seedIntel` (assim o módulo serve tanto para o
 * seed do login quanto para os testes).
 */
export type DemoSeedCtx = {
  db?: DB;
  orgId: string;
  userId: string;
  userIds: string[];
  leads: DemoSeedLead[];
  now: Date;
  rand: () => number;
};

/** Resumo do que existe na org depois do seed (permite conferir a idempotência). */
export type DemoIntelSummary = {
  commercialProfile: boolean;
  communicationProfiles: number;
  intelligenceJobs: number;
  harveyConversations: number;
  harveyInboundJobs: number;
  harveySellerInbox: number;
  automationRules: number;
  auditEntries: number;
  webhookEndpoints: number;
  leadAttributeDefs: number;
};

/** Perfil comercial do vendedor da demo (mesmos dados nas conversas do Harvey). */
const COMMERCIAL: {
  sellerName: string;
  companyName: string;
  sellerPhone: string;
  strategy: string;
  offers: CommercialOffer[];
} = {
  sellerName: 'Ana Beltrão',
  companyName: 'Atlas Consultoria Tributária',
  sellerPhone: '+5548999990001',
  strategy:
    'Tom consultivo e direto: abro pela dor fiscal concreta do cliente (passivo, prazo e caixa) e apresento o diagnóstico antes de falar de preço. ' +
    'Não prometo economia garantida e assumo o assunto quando o lead pedir condição comercial, prazo ou reunião.',
  offers: [
    {
      name: 'Diagnóstico de crédito tributário',
      description:
        'Levantamento do passivo e do crédito disponível da empresa em até 5 dias úteis, com simulação de compensação e prazo de retorno. Sem custo na primeira análise.',
    },
    {
      name: 'Cessão de crédito tributário',
      description:
        'Cessão de crédito de PIS/COFINS e ICMS já homologado, compensada pelo passivo tributário da empresa — sem desembolso e com escritura garantia.',
    },
  ],
};

/** Um dia em milissegundos — usado para marcar a data dos registros da demo. */
const DAY = 86_400_000;

/** Telefone fictício no padrão `+55 51 9XXXX-XXXX`. Nunca o número do dono. */
function demoPhone(index: number): string {
  const serial = String(1000 + (index % 9000)).padStart(4, '0');
  return `+555199999${serial}`;
}

/** E-mail fictício no domínio reservado `@demo.invalid`. */
function demoEmail(lead: DemoSeedLead): string {
  const parts = lead.fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0] ?? 'lead';
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  return `${first}.${last}@demo.invalid`.replace(/\.+/g, '.');
}

/** UUID determinístico: o mesmo texto devolve sempre o mesmo id (idempotência). */
function stableUuid(seed: string): string {
  const bytes = Buffer.from(createHash('sha256').update(seed).digest('hex').slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Normaliza o retorno de `db.execute` (array no postgres-js, `{rows}` no pglite). */
function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Heurística local (espelha o executor real, src/lib/intelligence/runner.ts)
// ---------------------------------------------------------------------------

type LeadFacts = {
  fullName: string;
  headline: string;
  company: string;
  location: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  attributes: Record<string, unknown>;
};

/** Os 6 fatores do resultado — nomes exatos, usados pela tela. */
export const DEMO_INTELLIGENCE_FACTORS = [
  'position_seniority',
  'company_size',
  'data_completeness',
  'digital_presence',
  'osint_risk',
  'email_validity',
] as const;

export type DemoIntelFactors = Record<(typeof DEMO_INTELLIGENCE_FACTORS)[number], number>;

export type DemoIntelResult = {
  score: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  hot: boolean;
  priorityAvailable: boolean;
  factors: DemoIntelFactors;
  unavailableFactors: string[];
};

const SENIORITY_EXEC = /\b(ceo|cfo|cto|coo|cmo|chief|founder|fundador|fundadora|owner|presidente|s[oó]cio|s[oó]cia|diretor|diretora|director|vice-presidente|vp|head\s+of|gerente\s+geral|managing\s+(director|partner)|partner)\b/i;
const SENIORITY_MANAGER = /\b(gerente|manager|tech\s+lead|head|l[ií]der|leader|coordenador|coordenadora|respons[aá]vel|supervisor|principal|senior|s[eé]nior|sr\.?)\b/i;
const SENIORITY_PROFESSIONAL = /\b(analista|analyst|engenheir|engineer|designer|consultor|consultant|especialista|specialist|advogado|professor|t[eé]cnico|operador|sales)\b/i;
const SENIORITY_JUNIOR = /\b(j[uú]nior|junior|trainee|estagi[aá]ri\w*|intern|aprendiz|entry[- ]level|assistente)\b/i;
const GENERIC_MAILBOX = /^(info|contato|contact|admin|administrador|vendas|sales|suporte|support|geral|comercial|marketing|financeiro|rh|help|office|atendimento)@/i;
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

function positionSeniorityScore(headline: string): number {
  const role = headline.trim();
  if (!role) return 50;
  if (SENIORITY_EXEC.test(role)) return 95;
  if (SENIORITY_MANAGER.test(role)) return 75;
  if (SENIORITY_PROFESSIONAL.test(role)) return 60;
  if (SENIORITY_JUNIOR.test(role)) return 30;
  return 50;
}

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

function companySizeScore(attributes: Record<string, unknown>): number {
  const employees = sizeEvidence(attributes);
  if (employees === null) return 50;
  if (employees >= 1000) return 90;
  if (employees >= 200) return 80;
  if (employees >= 50) return 70;
  if (employees >= 10) return 60;
  return 50;
}

function dataCompletenessScore(facts: LeadFacts): number {
  const fields = [facts.email, facts.phone, facts.linkedinUrl, facts.headline, facts.company, facts.location];
  const filled = fields.filter((value) => value.trim().length > 0).length;
  return Math.round((filled / fields.length) * 100);
}

function digitalPresenceScore(facts: LeadFacts): number {
  let score = 0;
  if (facts.linkedinUrl.trim()) score += 40;
  if (facts.headline.trim()) score += 25;
  if (facts.company.trim()) score += 20;
  if (Object.keys(facts.attributes).length >= 2) score += 15;
  return Math.min(score, 100);
}

function osintRiskScore(facts: LeadFacts): number {
  let score = 100;
  const email = facts.email.trim().toLowerCase();
  if (!email) score -= 20;
  else if (GENERIC_MAILBOX.test(email)) score -= 25;
  else if (!EMAIL_PATTERN.test(email)) score -= 15;
  if (!facts.phone.trim()) score -= 10;
  if (!facts.linkedinUrl.trim()) score -= 10;
  if (!facts.headline.trim()) score -= 10;
  return Math.max(0, Math.min(score, 100));
}

function emailValidityScore(facts: LeadFacts): number {
  const email = facts.email.trim().toLowerCase();
  if (!email) return 0;
  if (!EMAIL_PATTERN.test(email)) return 15;
  if (GENERIC_MAILBOX.test(email)) return 50;
  return 90;
}

/** Jitter pequeno e determinístico: os números da demo não ficam "redondos demais". */
function jitter(value: number, rand: () => number): number {
  const delta = Math.round((rand() * 12 - 6));
  return Math.max(0, Math.min(100, value + delta));
}

/** Resultado no formato exato da tela: score, priority, hot, priorityAvailable, factors, unavailableFactors. */
function buildResult(facts: LeadFacts, rand: () => number): DemoIntelResult {
  const factors: DemoIntelFactors = {
    position_seniority: jitter(positionSeniorityScore(facts.headline), rand),
    company_size: jitter(companySizeScore(facts.attributes), rand),
    data_completeness: jitter(dataCompletenessScore(facts), rand),
    digital_presence: jitter(digitalPresenceScore(facts), rand),
    osint_risk: jitter(osintRiskScore(facts), rand),
    email_validity: jitter(emailValidityScore(facts), rand),
  };
  const values = DEMO_INTELLIGENCE_FACTORS.map((factor) => factors[factor]);
  const score = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
  const priority = score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';
  return {
    score,
    priority,
    hot: priority === 'HIGH',
    priorityAvailable: true,
    factors,
    unavailableFactors: [],
  };
}

// ---------------------------------------------------------------------------
// Perfis de comunicação (tabela lead_communication_profiles)
// ---------------------------------------------------------------------------

type CommunicationSeed = {
  pattern: RegExp;
  source: 'manual' | 'observational_quiz' | 'inferred';
  profileType: string | null;
  answers: Record<string, string>;
  preferences: { preferredChannel: string; preferredFormat: string; notes: string };
};

/** Preferências por quadrante — usadas quando o lead não casa com nenhum padrão. */
const QUADRANT_PREFERENCES: Record<string, { preferredChannel: string; preferredFormat: string; notes: string }> = {
  D: { preferredChannel: 'whatsapp', preferredFormat: 'text', notes: 'Decide com pouco contexto: quer resultado, prazo e a próxima ação.' },
  I: { preferredChannel: 'linkedin', preferredFormat: 'text', notes: 'Gosta de conversa curta, com espaço para ideia e pergunta.' },
  S: { preferredChannel: 'email', preferredFormat: 'bullets', notes: 'Precisa de calma e de um roteiro por etapas, sem urgência artificial.' },
  C: { preferredChannel: 'email', preferredFormat: 'bullets', notes: 'Prefere resumo com número e fonte; o próximo passo no fim da mensagem.' },
};

/** Um perfil por quadrante DISC, coerente com o cargo do lead. */
const COMMUNICATION_SEEDS: CommunicationSeed[] = [
  {
    pattern: /cfo|controller|controladoria|diretor(a)?\s+(de\s+)?financ|tribut/i,
    source: 'manual',
    profileType: 'Cs',
    answers: {},
    preferences: {
      preferredChannel: 'email',
      preferredFormat: 'bullets',
      notes: 'Prefere resumo executivo por escrito, com número e fonte; o próximo passo no fim do e-mail.',
    },
  },
  {
    pattern: /ceo|s[oó]cio|s[oó]cia|fundador|president/i,
    source: 'manual',
    profileType: 'D',
    answers: {},
    preferences: {
      preferredChannel: 'whatsapp',
      preferredFormat: 'text',
      notes: 'Decide com pouco contexto: quer o resultado, o prazo e a próxima ação sem rodeios.',
    },
  },
  {
    pattern: /head|parcerias|marketing/i,
    source: 'observational_quiz',
    profileType: 'I',
    answers: { q1: 'I', q2: 'I', q3: 'D', q4: 'S' },
    preferences: {
      preferredChannel: 'linkedin',
      preferredFormat: 'text',
      notes: 'Responde melhor em conversa curta, com espaço para ideia e pergunta.',
    },
  },
  {
    pattern: /gerente|administrativ|suprimento/i,
    source: 'observational_quiz',
    profileType: 'S',
    answers: { q1: 'S', q2: 'S', q3: 'C', q4: 'D' },
    preferences: {
      preferredChannel: 'email',
      preferredFormat: 'bullets',
      notes: 'Precisa de calma e de um roteiro por etapas; nada de urgência artificial.',
    },
  },
];

/** Quadrante DISC sugerido pelo cargo — usado quando nenhum padrão casa com o lead. */
function discFromHeadline(headline: string): 'D' | 'I' | 'S' | 'C' | null {
  if (/head|parcerias|marketing|comercial/i.test(headline)) return 'I';
  if (/gerente|administrativ|suprimento|coordenador/i.test(headline)) return 'S';
  if (/cfo|controller|controladoria|tribut|financeir|analista|contador/i.test(headline)) return 'C';
  if (/ceo|s[oó]cio|s[oó]cia|fundador|diretor|president/i.test(headline)) return 'D';
  return null;
}

/** Perfil estimado (origem "inferred") para um lead sem padrão conhecido. */
function inferredSeed(lead: DemoSeedLead): CommunicationSeed {
  const type = discFromHeadline(lead.headline);
  return {
    pattern: /$^/,
    source: 'inferred',
    profileType: type,
    answers: {},
    preferences: type
      ? QUADRANT_PREFERENCES[type]
      : { preferredChannel: 'unknown', preferredFormat: 'unknown', notes: 'Sem sinais suficientes: perfil ainda não estimado.' },
  };
}

// ---------------------------------------------------------------------------
// Escolha dos leads
// ---------------------------------------------------------------------------

const STAGE_PRIORITY: Record<string, number> = {
  replied: 0,
  meeting: 1,
  connected: 2,
  invited: 3,
  new: 4,
};

const COMMERCIAL_STAGES = new Set(['replied', 'meeting', 'connected']);

function isEligible(lead: DemoSeedLead): boolean {
  return lead.stage !== 'do_not_contact' && lead.stage !== 'lost';
}

/** Ordena por oportunidade (etapa) e, no empate, pelo nome — determinístico. */
function byOpportunity(a: DemoSeedLead, b: DemoSeedLead): number {
  const pa = STAGE_PRIORITY[a.stage] ?? 9;
  const pb = STAGE_PRIORITY[b.stage] ?? 9;
  if (pa !== pb) return pa - pb;
  return a.fullName.localeCompare(b.fullName, 'pt-BR');
}

function pickLeads(pool: DemoSeedLead[], count: number, used: Set<string>, filter?: (lead: DemoSeedLead) => boolean): DemoSeedLead[] {
  const picked: DemoSeedLead[] = [];
  const candidates = [...pool].sort(byOpportunity);
  const take = (lead: DemoSeedLead) => {
    picked.push(lead);
    used.add(lead.id);
  };
  // 1ª passada: leads ainda livres (respeita o que já foi escolhido).
  for (const lead of candidates) {
    if (picked.length >= count) break;
    if (used.has(lead.id) || picked.some((item) => item.id === lead.id)) continue;
    if (filter && !filter(lead)) continue;
    take(lead);
  }
  // 2ª passada: se faltou gente, reaproveita leads já escolhidos antes.
  if (picked.length < count) {
    for (const lead of candidates) {
      if (picked.length >= count) break;
      if (picked.some((item) => item.id === lead.id)) continue;
      if (filter && !filter(lead)) continue;
      take(lead);
    }
  }
  return picked;
}

/** Porte coerente com o tipo de empresa (indústria x escritório de contabilidade). */
function companySizeLabel(lead: DemoSeedLead): string {
  if (/contadores|assessoria|consultoria|auditoria|advogados/i.test(lead.company)) return 'Pequeno porte';
  if (/grupo|rede|metal[uú]rgica|ind[uú]stria|hospital|minera[cç][aã]o|frigor[ií]fico|transportes|hotel|energia|t[eê]xtil|cer[aâ]mica/i.test(lead.company)) return 'Grande porte';
  return 'Médio porte';
}

function taxRegimeLabel(size: string): string {
  if (size === 'Pequeno porte') return 'Simples Nacional';
  if (size === 'Grande porte') return 'Lucro Real';
  return 'Lucro Presumido';
}

/** Garante telefones distintos entre conversas (índice único por org + vendedor + telefone). */
function uniquePhone(phone: string, index: number, used: Set<string>): string {
  if (!used.has(phone)) {
    used.add(phone);
    return phone;
  }
  const alternative = demoPhone(200 + index);
  used.add(alternative);
  return alternative;
}

function qualificationFor(lead: DemoSeedLead): string {
  const byStage: Record<string, string> = {
    replied: 'Respondeu o convite, falou do passivo federal e pediu uma proposta com prazo.',
    meeting: 'Reunião já agendada; pediu o diagnóstico antes de apresentar ao conselho.',
    connected: 'Conectou no LinkedIn e respondeu com interesse em crédito tributário.',
    invited: 'Convidado pela campanha de abertura; respondeu uma dúvida sobre prazo.',
    new: 'Lead novo da operação, ainda sem conversa.',
  };
  return `${lead.headline} na ${lead.company}. ${byStage[lead.stage] ?? 'Lead em carteira.'}`;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

/**
 * Prepara a org de demonstração com inteligência comercial, operação comercial
 * (Harvey), perfis de comunicação, automações, auditoria e webhooks.
 * Pode rodar quantas vezes quiser: nunca duplica.
 */
export async function seedIntel(db: DB, ctx: DemoSeedCtx): Promise<DemoIntelSummary> {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const rand = ctx.rand;
  const { orgId, userId } = ctx;

  const leads = ctx.leads.length ? ctx.leads : await loadLeads(db, orgId);
  const owned = leads.filter((lead) => lead.ownerId === userId);
  const pool = owned.length ? owned : leads;
  // Ordem estável: sem isso a escolha de lead mudaria a cada execução.
  const eligible = pool.filter(isEligible).sort((a, b) => a.id.localeCompare(b.id));

  // Leads que JÁ têm perfil de comunicação (execução anterior): reutilizados, nunca duplicados.
  const previousProfiles = await db.execute(sql`
    SELECT lead_id FROM lead_communication_profiles WHERE org_id = ${orgId}
  `);
  const alreadyProfiled = new Set<string>(
    resultRows(previousProfiles).map((row) => String(row.lead_id ?? '')),
  );

  // 1) Perfil comercial e ofertas do vendedor (chave: org + vendedor).
  await db
    .insert(schema.commercialProfiles)
    .values({
      orgId,
      userId,
      sellerName: COMMERCIAL.sellerName,
      companyName: COMMERCIAL.companyName,
      sellerPhone: COMMERCIAL.sellerPhone,
      strategy: COMMERCIAL.strategy,
      offers: COMMERCIAL.offers,
      updatedAt: now,
    })
    .onConflictDoNothing();

  // 2) Definições de atributos (formulário de atributos do lead).
  const attributeDefs = [
    {
      name: 'Porte da empresa',
      key: 'porte_empresa',
      type: 'select' as const,
      options: ['Pequeno porte', 'Médio porte', 'Grande porte'],
      required: false,
      position: 1,
    },
    {
      name: 'Regime tributário',
      key: 'regime_tributario',
      type: 'select' as const,
      options: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'],
      required: false,
      position: 2,
    },
  ];
  for (const def of attributeDefs) {
    await db.insert(schema.leadAttributeDefs).values({ orgId, ...def }).onConflictDoNothing();
  }

  // 3) Escolha dos leads: perfis de comunicação, inteligência e conversas do Harvey.
  const used = new Set<string>();
  const communicationLeads: Array<{ lead: DemoSeedLead; seed: CommunicationSeed }> = [];
  // Perfis de comunicacao: criados uma vez. Se a org ja tem perfis, nada e recriado
  // (o reset da demo e que recomeca do zero). A escolha dos leads continua sendo
  // feita sempre, para que o resto do seed use exatamente os mesmos leads.
  const freeForProfile = eligible.filter((lead) => !alreadyProfiled.has(lead.id));
  for (const seed of COMMUNICATION_SEEDS) {
    const match = freeForProfile.find((lead) => !used.has(lead.id) && seed.pattern.test(lead.headline));
    const lead = match ?? freeForProfile.find((item) => !used.has(item.id));
    if (!lead) continue;
    used.add(lead.id);
    communicationLeads.push({ lead, seed: match ? seed : inferredSeed(lead) });
  }
  // A inteligência olha os leads mais quentes (pode repetir um lead com perfil de comunicação).
  const intelligenceLeads = pickLeads(eligible, 3, new Set<string>(), (lead) => lead.stage !== 'new');
  // O Harvey só conversa com lead em carteira (replied/meeting/connected).
  const harveyLeads = pickLeads(eligible, 2, used, (lead) => COMMERCIAL_STAGES.has(lead.stage));

  // 4) Contato e atributos dos leads usados — só preenche o que estiver vazio.
  const touched = [...communicationLeads.map((item) => item.lead), ...intelligenceLeads, ...harveyLeads];
  const phoneByLead = new Map<string, string>();
  for (const [index, lead] of touched.entries()) {
    const [row] = await db
      .select({ email: schema.leads.email, phone: schema.leads.phone, attributes: schema.leads.attributes })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, lead.id), eq(schema.leads.orgId, orgId)))
      .limit(1);
    if (!row) continue;
    const effectivePhone = row.phone.trim() || demoPhone(index);
    phoneByLead.set(lead.id, effectivePhone);
    const size = companySizeLabel(lead);
    const attributes = {
      ...asRecord(row.attributes),
      porte_empresa: size,
      regime_tributario: taxRegimeLabel(size),
    };
    await db
      .update(schema.leads)
      .set({
        email: row.email.trim() || demoEmail(lead),
        phone: effectivePhone,
        attributes,
      })
      .where(and(eq(schema.leads.id, lead.id), eq(schema.leads.orgId, orgId)));
  }

  // 5) Perfis de comunicação (DISC) — a tabela não está no schema do drizzle.
  // Criados uma vez: se a org já tem perfis, mantém os que existem.
  for (const { lead, seed } of alreadyProfiled.size > 0 ? [] : communicationLeads) {
    const evidence = seed.profileType === null ? 'unavailable' : seed.source === 'manual' ? 'declared' : 'estimate';
    const assessedAt = new Date(now.getTime() - 4 * DAY).toISOString();
    await db.execute(sql`
      INSERT INTO lead_communication_profiles
        (org_id, lead_id, user_id, source, evidence_label, profile_type, answers, preferences, assessed_at, updated_at)
      VALUES (
        ${orgId}, ${lead.id}, ${userId}, ${seed.source}, ${evidence}, ${seed.profileType},
        ${JSON.stringify(seed.answers)}::jsonb, ${JSON.stringify(seed.preferences)}::jsonb,
        ${assessedAt}::timestamptz, ${now.toISOString()}::timestamptz
      )
      ON CONFLICT (org_id, lead_id) DO NOTHING
    `);
  }

  // 6) Jobs de inteligência comercial: dois concluídos e um na fila.
  const intelligenceRows = await db
    .select({
      id: schema.leads.id,
      fullName: schema.leads.fullName,
      headline: schema.leads.headline,
      company: schema.leads.company,
      location: schema.leads.location,
      email: schema.leads.email,
      phone: schema.leads.phone,
      linkedinUrl: schema.leads.linkedinUrl,
      attributes: schema.leads.attributes,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, orgId), eq(schema.leads.ownerId, userId)));

  const factsByLead = new Map<string, LeadFacts>(
    intelligenceRows.map((row) => [
      row.id,
      {
        fullName: row.fullName,
        headline: row.headline,
        company: row.company,
        location: row.location,
        email: row.email,
        phone: row.phone,
        linkedinUrl: row.linkedinUrl,
        attributes: asRecord(row.attributes),
      },
    ]),
  );

  const existingJobLeads = new Set(
    (await db
      .select({ leadId: schema.intelligenceJobs.leadId })
      .from(schema.intelligenceJobs)
      .where(eq(schema.intelligenceJobs.orgId, orgId))).map((row) => row.leadId),
  );
  for (const [index, lead] of (existingJobLeads.size > 0 ? [] : intelligenceLeads).entries()) {
    const facts = factsByLead.get(lead.id);
    if (!facts) continue;
    const id = stableUuid(`${orgId}:inteligencia:${lead.id}`);
    if (index < 2) {
      const result = buildResult(facts, rand);
      await db
        .insert(schema.intelligenceJobs)
        .values({
          id,
          orgId,
          userId,
          leadId: lead.id,
          state: 'completed',
          result,
          attempts: 1,
          claimedAt: new Date(now.getTime() - (2 - index) * DAY),
          completedAt: new Date(now.getTime() - (2 - index) * DAY + 4 * 60_000),
          createdAt: new Date(now.getTime() - (2 - index) * DAY),
        })
        .onConflictDoNothing();
    } else {
      await db
        .insert(schema.intelligenceJobs)
        .values({
          id,
          orgId,
          userId,
          leadId: lead.id,
          state: 'queued',
          result: null,
          attempts: 0,
          createdAt: new Date(now.getTime() - 25 * 60_000),
        })
        .onConflictDoNothing();
    }
  }

  // 7) Conversas do Harvey: uma automática (ativa) e uma em passagem humana.
  const conversationPhones = new Set<string>();
  const existingConversationLeads = new Set(
    (await db
      .select({ leadId: schema.harveyConversations.leadId })
      .from(schema.harveyConversations)
      .where(eq(schema.harveyConversations.orgId, orgId))).map((row) => row.leadId),
  );
  const newHarveyLeads = existingConversationLeads.size > 0
    ? []
    : harveyLeads.filter((lead) => !existingConversationLeads.has(lead.id));
  const conversationValues: Array<typeof schema.harveyConversations.$inferInsert> = newHarveyLeads.map((lead, index) => ({
    id: stableUuid(`${orgId}:harvey:${lead.id}`),
    orgId,
    userId,
    leadId: lead.id,
    phone: uniquePhone(phoneByLead.get(lead.id) ?? demoPhone(90 + index), index, conversationPhones),
    qualification: qualificationFor(lead),
    profile: {
      sellerName: COMMERCIAL.sellerName,
      companyName: COMMERCIAL.companyName,
      sellerPhone: COMMERCIAL.sellerPhone,
      strategy: COMMERCIAL.strategy,
      offers: COMMERCIAL.offers,
    },
    state: index === 0 ? ('active' as const) : ('handoff' as const),
    turns: index === 0 ? 2 : 1,
    summary:
      index === 0
        ? ''
        : 'Interesse declarado: pediu o valor do diagnóstico e um horário para apresentar ao conselho.',
    recipients: index === 0 ? [] : ['comercial@demo.invalid'],
    approvedAt: new Date(now.getTime() - (3 - index) * DAY),
    nextReminderAt: index === 0 ? null : new Date(now.getTime() + 2 * DAY),
  }));
  const insertedConversations = conversationValues.length
    ? await db
        .insert(schema.harveyConversations)
        .values(conversationValues)
        .onConflictDoNothing()
        .returning({ id: schema.harveyConversations.id, state: schema.harveyConversations.state })
    : [];
  const storedConversations = insertedConversations.length
    ? insertedConversations
    : await db
        .select({ id: schema.harveyConversations.id, state: schema.harveyConversations.state })
        .from(schema.harveyConversations)
        .where(eq(schema.harveyConversations.orgId, orgId));

  const handoffConversation = storedConversations.find((row) => row.state === 'handoff');

  // 8) Mensagem recebida que exige conferência humana.
  await db
    .insert(schema.harveyInboundJobs)
    .values({
      id: stableUuid(`${orgId}:harvey-inbound:${orgId}`),
      orgId,
      userId,
      providerId: `demo-inbound-${stableUuid(`${orgId}:inbound`).slice(0, 8)}`,
      phone: phoneByLead.get(harveyLeads[0]?.id ?? '') ?? demoPhone(95),
      text: 'Bom dia! Vocês atendem empresas do Simples Nacional também? Preciso saber quanto tempo demora o diagnóstico e quanto custa.',
      state: 'review',
      error: 'Não foi possível analisar a resposta; confira o acesso e a conversa.',
    })
    .onConflictDoNothing();

  // 9) Mensagem do vendedor para responder (inbox do vendedor).
  await db
    .insert(schema.harveySellerInbox)
    .values({
      id: stableUuid(`${orgId}:harvey-seller:${orgId}`),
      orgId,
      userId,
      conversationId: handoffConversation?.id ?? null,
      providerId: `demo-seller-${stableUuid(`${orgId}:seller`).slice(0, 8)}`,
      text: 'Ana, o conselho decide até sexta. Consegue mandar o diagnóstico com o valor da operação de cessão? Se couber, já separo a reunião.',
    })
    .onConflictDoNothing();

  // 10) Regras de automação do atendimento.
  const automationRows = await db
    .insert(schema.automationRules)
    .values([
      {
        id: stableUuid(`${orgId}:automation:prazo`),
        orgId,
        name: 'Responde dúvida de prazo automaticamente',
        trigger: 'conversation_created' as const,
        conditions: [{ field: 'channel', operator: 'eq', value: 'whatsapp' }],
        actions: [{ type: 'send_template', template: 'prazo_diagnostico' }],
        active: true,
      },
      {
        id: stableUuid(`${orgId}:automation:reuniao`),
        orgId,
        name: 'Convide para reunião após 2 respostas',
        trigger: 'conversation_replied' as const,
        conditions: [{ field: 'reply_count', operator: 'gte', value: 2 }],
        actions: [{ type: 'request_meeting', source: 'harvey' }, { type: 'notify_seller' }],
        active: true,
      },
    ])
    .onConflictDoNothing()
    .returning({ id: schema.automationRules.id });

  // 11) Webhook de saída (URL fictícia, nada é chamado de verdade).
  const webhookRows = await db
    .insert(schema.webhookEndpoints)
    .values({
      id: stableUuid(`${orgId}:webhook:${orgId}`),
      orgId,
      url: 'https://exemplo.invalid/hook',
      secret: createHash('sha256').update(`${orgId}:webhook`).digest('hex'),
      events: ['support.message.received', 'lead.updated'],
      active: true,
    })
    .onConflictDoNothing()
    .returning({ id: schema.webhookEndpoints.id });

  // 12) Trilha de auditoria: ações relevantes da operação.
  const [campaign] = await db
    .select({ id: schema.campaigns.id, name: schema.campaigns.name })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.orgId, orgId))
    .limit(1);
  const auditEntries = [
    {
      action: 'campaign.created',
      entity: 'campaign',
      entityId: campaign?.id ?? null,
      payload: { name: campaign?.name ?? 'Abertura · CFOs da indústria' },
    },
    {
      action: 'meeting_invite.sent',
      entity: 'meeting_invite',
      entityId: null,
      payload: { lead: intelligenceLeads[0]?.fullName ?? 'lead da carteira', channel: 'agenda' },
    },
    {
      action: 'sla_policy.updated',
      entity: 'support_sla_policy',
      entityId: null,
      payload: { firstResponseMinutes: 60, resolutionMinutes: 1440 },
    },
    {
      action: 'webhook.created',
      entity: 'webhook_endpoint',
      entityId: webhookRows[0]?.id ?? null,
      payload: { url: 'https://exemplo.invalid/hook', events: ['support.message.received'] },
    },
    {
      action: 'automation_rule.created',
      entity: 'automation_rule',
      entityId: automationRows[0]?.id ?? null,
      payload: { name: 'Responde dúvida de prazo automaticamente' },
    },
  ];
  for (const [index, entry] of auditEntries.entries()) {
    await db
      .insert(schema.auditLog)
      .values({
        id: stableUuid(`${orgId}:audit:${index}:${entry.action}`),
        orgId,
        actorUserId: userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        payload: entry.payload,
        createdAt: new Date(now.getTime() - (auditEntries.length - index) * 3600_000),
      })
      .onConflictDoNothing();
  }

  return summarize(db, ctx);
}

async function loadLeads(db: DB, orgId: string): Promise<DemoSeedLead[]> {
  const rows = await db
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
  return rows.map((row) => ({ ...row }));
}

/** Conta o que existe na org depois do seed (mesma resposta na segunda execução). */
async function summarize(db: DB, ctx: DemoSeedCtx): Promise<DemoIntelSummary> {
  const { orgId, userId } = ctx;
  const [profile] = await db
    .select({ id: schema.commercialProfiles.orgId })
    .from(schema.commercialProfiles)
    .where(and(eq(schema.commercialProfiles.orgId, orgId), eq(schema.commercialProfiles.userId, userId)))
    .limit(1);
  const communication = await db.execute(sql`
    SELECT count(*)::int AS total FROM lead_communication_profiles WHERE org_id = ${orgId}
  `);
  const [jobs] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.intelligenceJobs)
    .where(eq(schema.intelligenceJobs.orgId, orgId));
  const [conversations] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.harveyConversations)
    .where(eq(schema.harveyConversations.orgId, orgId));
  const [inbound] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.harveyInboundJobs)
    .where(eq(schema.harveyInboundJobs.orgId, orgId));
  const [sellerInbox] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.harveySellerInbox)
    .where(eq(schema.harveySellerInbox.orgId, orgId));
  const [rules] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.automationRules)
    .where(eq(schema.automationRules.orgId, orgId));
  const [audit] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.orgId, orgId));
  const [hooks] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.orgId, orgId));
  const [defs] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.leadAttributeDefs)
    .where(eq(schema.leadAttributeDefs.orgId, orgId));

  const communicationTotal = Number(resultRows(communication)[0]?.total ?? 0);

  return {
    commercialProfile: Boolean(profile),
    communicationProfiles: communicationTotal,
    intelligenceJobs: jobs?.total ?? 0,
    harveyConversations: conversations?.total ?? 0,
    harveyInboundJobs: inbound?.total ?? 0,
    harveySellerInbox: sellerInbox?.total ?? 0,
    automationRules: rules?.total ?? 0,
    auditEntries: audit?.total ?? 0,
    webhookEndpoints: hooks?.total ?? 0,
    leadAttributeDefs: defs?.total ?? 0,
  };
}

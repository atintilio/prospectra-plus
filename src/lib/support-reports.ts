import 'server-only';
import { and, count, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';

// Relatórios de atendimento (Helpin fase D): volume, primeira resposta, SLA, resolução,
// CSAT, agentes e times.
//
// Regras que valem para todo o módulo:
// - Toda consulta filtra por orgId: o relatório de uma operação nunca enxerga a outra.
// - O período filtra as conversas pelo instante de criação (createdAt).
// - As datas saem no fuso America/Sao_Paulo, no formato YYYY-MM-DD.

export const REPORT_TIMEZONE = 'America/Sao_Paulo';
const DAY_MS = 86_400_000;
export const DEFAULT_REPORT_DAYS = 30;

export type SupportReportOptions = {
  /** Início do período (inclusive). Padrão: 30 dias antes do fim. */
  from?: Date | null;
  /** Fim do período (inclusive). Padrão: agora. */
  to?: Date | null;
  /** Banco alternativo (testes). Padrão: getDb(). */
  db?: DB;
  /** Momento de referência ("agora"). Padrão: new Date(). */
  now?: Date;
};

export type SupportReport = {
  orgId: string;
  /** Período em YYYY-MM-DD (fuso America/Sao_Paulo). */
  from: string;
  to: string;
  /** Limites exatos do período, em ISO. */
  range: { from: string; to: string };
  generatedAt: string;
  volume: {
    total: number;
    open: number;
    closed: number;
    byDay: { date: string; total: number }[];
    byChannel: { web: number; whatsapp: number; internal: number };
    byAudience: { customer: number; product: number };
  };
  firstResponse: {
    /** Conversas que receberam resposta de agente no período. */
    conversations: number;
    averageMs: number | null;
    medianMs: number | null;
  };
  sla: {
    /** Conversas com prazo (sla_due_at) definido. */
    evaluated: number;
    within: number;
    breached: number;
    /** Percentuais de 0 a 100. */
    withinRate: number;
    breachedRate: number;
  };
  resolution: {
    /** Conversas fechadas no período. */
    conversations: number;
    averageMs: number | null;
    medianMs: number | null;
  };
  csat: {
    responses: number;
    average: number | null;
    promoters: number;
    detractors: number;
    promoterRate: number;
    detractorRate: number;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
  topAgents: {
    userId: string;
    name: string;
    email: string;
    conversations: number;
    replies: number;
    averageFirstResponseMs: number | null;
  }[];
  topTeams: { id: string; name: string; conversations: number }[];
};

// ── Fuso e datas ────────────────────────────────────────────────────────────

/** Deslocamento do fuso (em ms) no instante informado. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - instant.getTime();
}

/** Data no formato YYYY-MM-DD no fuso informado. */
export function formatDay(date: Date, timeZone: string = REPORT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Início do dia (00:00) do fuso informado. */
export function startOfDayInTz(day: string, timeZone: string = REPORT_TIMEZONE): Date {
  if (!DAY_PATTERN.test(day)) throw new Error('Data inválida (use YYYY-MM-DD).');
  const [y, m, d] = day.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  return new Date(guess.getTime() - tzOffsetMs(guess, timeZone));
}

/** Fim do dia (23:59:59.999) do fuso informado. */
export function endOfDayInTz(day: string, timeZone: string = REPORT_TIMEZONE): Date {
  return new Date(startOfDayInTz(day, timeZone).getTime() + DAY_MS - 1);
}

/** Converte 'YYYY-MM-DD' em instante de início do dia; null quando o texto é inválido. */
export function parseDay(value: string | null | undefined, timeZone: string = REPORT_TIMEZONE): Date | null {
  const day = (value ?? '').trim();
  if (!DAY_PATTERN.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return startOfDayInTz(day, timeZone);
}

/** Converte 'YYYY-MM-DD' em instante de fim do dia; null quando o texto é inválido. */
export function parseDayEnd(value: string | null | undefined, timeZone: string = REPORT_TIMEZONE): Date | null {
  const start = parseDay(value, timeZone);
  return start ? new Date(start.getTime() + DAY_MS - 1) : null;
}

// ── Auxiliares de agregação ─────────────────────────────────────────────────

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Arredonda mantendo null (sem dado). */
export function round(value: number | null | undefined, decimals = 0): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Percentual de 0 a 100. */
export function percent(part: number, total: number): number {
  if (!total) return 0;
  return round((part / total) * 100, 1) ?? 0;
}

// ── Relatório ───────────────────────────────────────────────────────────────

/**
 * Relatório de atendimento da operação.
 * Use `options.db` para injetar um banco de teste; sem ele, usa o getDb() da aplicação.
 */
export async function supportReport(orgId: string, options: SupportReportOptions = {}): Promise<SupportReport> {
  const db = options.db ?? (await getDb());
  return buildSupportReport(db, orgId, options);
}

/** Mesma coisa que supportReport(), com o banco explícito (usado nos testes). */
export async function buildSupportReport(db: DB, orgId: string, options: SupportReportOptions = {}): Promise<SupportReport> {
  const now = options.now ?? new Date();
  const to = options.to ?? now;
  const from = options.from ?? new Date(to.getTime() - DEFAULT_REPORT_DAYS * DAY_MS);
  const [start, end] = from.getTime() <= to.getTime() ? [from, to] : [to, from];

  const conversations = await db.select({
    id: schema.supportConversations.id,
    createdAt: schema.supportConversations.createdAt,
    status: schema.supportConversations.status,
    channel: schema.supportConversations.channel,
    audience: schema.supportConversations.audience,
    assignedTo: schema.supportConversations.assignedTo,
    teamId: schema.supportConversations.teamId,
    slaDueAt: schema.supportConversations.slaDueAt,
    resolvedAt: schema.supportConversations.resolvedAt,
    lastMessageAt: schema.supportConversations.lastMessageAt,
    csatRating: schema.supportConversations.csatRating,
  }).from(schema.supportConversations).where(and(
    eq(schema.supportConversations.orgId, orgId),
    gte(schema.supportConversations.createdAt, start),
    lte(schema.supportConversations.createdAt, end),
  ));

  const ids = conversations.map((c) => c.id);

  // Primeira resposta do agente de cada conversa (nota interna não é resposta ao cliente).
  const firstReplies = ids.length
    ? await db.select({
        conversationId: schema.supportMessages.conversationId,
        at: sql<Date>`min(${schema.supportMessages.createdAt})`,
      }).from(schema.supportMessages).where(and(
        inArray(schema.supportMessages.conversationId, ids),
        eq(schema.supportMessages.author, 'agent'),
        eq(schema.supportMessages.private, false),
      )).groupBy(schema.supportMessages.conversationId)
    : [];
  const firstReplyAt = new Map<string, Date>();
  for (const row of firstReplies) firstReplyAt.set(row.conversationId, row.at);

  // Quantas respostas cada agente deu no período.
  const repliesByAgent = ids.length
    ? await db.select({
        userId: schema.supportMessages.authorUserId,
        n: count(),
      }).from(schema.supportMessages).where(and(
        inArray(schema.supportMessages.conversationId, ids),
        eq(schema.supportMessages.author, 'agent'),
      )).groupBy(schema.supportMessages.authorUserId)
    : [];

  // ── Volume ──
  const byDayCount = new Map<string, number>();
  const byChannel = { web: 0, whatsapp: 0, internal: 0 };
  const byAudience = { customer: 0, product: 0 };
  let open = 0;
  let closed = 0;
  for (const c of conversations) {
    const day = formatDay(c.createdAt);
    byDayCount.set(day, (byDayCount.get(day) ?? 0) + 1);
    byChannel[c.channel] += 1;
    byAudience[c.audience] += 1;
    if (c.status === 'closed') closed += 1;
    else open += 1;
  }
  const byDay = [...byDayCount.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, total]) => ({ date, total }));

  // ── Primeira resposta ──
  const responseTimes: number[] = [];
  for (const c of conversations) {
    const at = firstReplyAt.get(c.id);
    if (!at) continue;
    const ms = at.getTime() - c.createdAt.getTime();
    if (ms < 0) continue;
    responseTimes.push(ms);
  }

  // ── SLA ──
  // Dentro do prazo: respondeu antes do sla_due_at (ou ainda não venceu).
  // Violado: respondeu depois do prazo — ou nem respondeu e o prazo já passou.
  let within = 0;
  let breached = 0;
  let evaluated = 0;
  for (const c of conversations) {
    if (!c.slaDueAt) continue;
    evaluated += 1;
    const due = c.slaDueAt.getTime();
    const reference = firstReplyAt.get(c.id)?.getTime() ?? c.resolvedAt?.getTime() ?? now.getTime();
    if (reference <= due) within += 1;
    else breached += 1;
  }

  // ── Resolução (fechada - criada) ──
  const resolutionTimes: number[] = [];
  for (const c of conversations) {
    if (c.status !== 'closed') continue;
    const finished = c.resolvedAt ?? c.lastMessageAt;
    const ms = finished.getTime() - c.createdAt.getTime();
    if (ms < 0) continue;
    resolutionTimes.push(ms);
  }

  // ── CSAT ──
  const distribution: SupportReport['csat']['distribution'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  const ratings: number[] = [];
  for (const c of conversations) {
    const rating = c.csatRating;
    if (rating == null) continue;
    ratings.push(rating);
    if (rating >= 1 && rating <= 5) distribution[String(rating) as '1' | '2' | '3' | '4' | '5'] += 1;
  }
  const promoters = ratings.filter((r) => r >= 4).length;
  const detractors = ratings.filter((r) => r <= 2).length;

  // ── Agentes ──
  const agentIds = new Set<string>();
  for (const c of conversations) if (c.assignedTo) agentIds.add(c.assignedTo);
  for (const r of repliesByAgent) if (r.userId) agentIds.add(r.userId);
  const agentList = agentIds.size
    ? await db.select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
      }).from(schema.users).innerJoin(
        schema.memberships,
        and(eq(schema.memberships.userId, schema.users.id), eq(schema.memberships.orgId, orgId)),
      ).where(inArray(schema.users.id, [...agentIds]))
    : [];

  const assignedCount = new Map<string, number>();
  const replyCount = new Map<string, number>();
  const agentResponseTimes = new Map<string, number[]>();
  for (const c of conversations) {
    if (c.assignedTo) assignedCount.set(c.assignedTo, (assignedCount.get(c.assignedTo) ?? 0) + 1);
    const at = firstReplyAt.get(c.id);
    if (!c.assignedTo || !at) continue;
    const ms = at.getTime() - c.createdAt.getTime();
    if (ms < 0) continue;
    const list = agentResponseTimes.get(c.assignedTo) ?? [];
    list.push(ms);
    agentResponseTimes.set(c.assignedTo, list);
  }
  for (const r of repliesByAgent) if (r.userId) replyCount.set(r.userId, r.n);

  const topAgents = agentList.map((a) => ({
    userId: a.id,
    name: a.name,
    email: a.email,
    conversations: assignedCount.get(a.id) ?? 0,
    replies: replyCount.get(a.id) ?? 0,
    averageFirstResponseMs: round(average(agentResponseTimes.get(a.id) ?? []), 0),
  }))
    .filter((a) => a.conversations > 0 || a.replies > 0)
    .sort((a, b) => b.conversations - a.conversations || b.replies - a.replies || a.name.localeCompare(b.name));

  // ── Times ──
  const teamCount = new Map<string, number>();
  for (const c of conversations) if (c.teamId) teamCount.set(c.teamId, (teamCount.get(c.teamId) ?? 0) + 1);
  const teamIds = [...teamCount.keys()];
  const teamList = teamIds.length
    ? await db.select({ id: schema.supportTeams.id, name: schema.supportTeams.name })
      .from(schema.supportTeams)
      .where(and(eq(schema.supportTeams.orgId, orgId), inArray(schema.supportTeams.id, teamIds)))
    : [];
  const topTeams = teamList.map((t) => ({ id: t.id, name: t.name, conversations: teamCount.get(t.id) ?? 0 }))
    .filter((t) => t.conversations > 0)
    .sort((a, b) => b.conversations - a.conversations || a.name.localeCompare(b.name));

  return {
    orgId,
    from: formatDay(start),
    to: formatDay(end),
    range: { from: start.toISOString(), to: end.toISOString() },
    generatedAt: now.toISOString(),
    volume: { total: conversations.length, open, closed, byDay, byChannel, byAudience },
    firstResponse: {
      conversations: responseTimes.length,
      averageMs: round(average(responseTimes), 0),
      medianMs: round(median(responseTimes), 0),
    },
    sla: {
      evaluated,
      within,
      breached,
      withinRate: percent(within, evaluated),
      breachedRate: percent(breached, evaluated),
    },
    resolution: {
      conversations: resolutionTimes.length,
      averageMs: round(average(resolutionTimes), 0),
      medianMs: round(median(resolutionTimes), 0),
    },
    csat: {
      responses: ratings.length,
      average: round(average(ratings), 2),
      promoters,
      detractors,
      promoterRate: percent(promoters, ratings.length),
      detractorRate: percent(detractors, ratings.length),
      distribution,
    },
    topAgents,
    topTeams,
  };
}

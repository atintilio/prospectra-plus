import 'server-only';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';
import { dispatchWebhook } from '@/lib/webhooks';
import { recordAudit } from '@/lib/audit';

/**
 * CSAT (satisfação) do atendimento — Helpin fase 6.
 *
 * Fluxo: quando a conversa é encerrada, o cliente pode avaliar o atendimento com uma nota
 * de 1 a 5 dentro de uma janela (24h por padrão). A avaliação é única: a primeira nota
 * vence e nunca é sobrescrita.
 *
 * Fronteira de confiança: tudo que sai daqui para o widget é apenas a nota — nada de
 * dado interno da conversa (responsável, time, lead, e-mail do visitante).
 */

/** Janela padrão para pedir a nota depois do encerramento (24 horas). */
export const CSAT_WINDOW_HOURS = 24;
/** Menor nota válida. */
export const CSAT_MIN_RATING = 1;
/** Maior nota válida. */
export const CSAT_MAX_RATING = 5;
/** Tamanho máximo do comentário deixado junto da nota. */
export const CSAT_MAX_COMMENT = 500;

export type CsatRating = 1 | 2 | 3 | 4 | 5;

export type CsatOptions = {
  /** Janela da pesquisa em horas (padrão 24). */
  windowHours?: number;
  /** Janela em milissegundos; quando informada, tem precedência sobre `windowHours`. */
  windowMs?: number;
};

/** Estado mínimo da conversa usado pela pesquisa (sem dado interno). */
export type CsatState = {
  status?: string | null;
  resolvedAt?: Date | string | null;
  csatRating?: number | null;
};

/** Conversa com os campos públicos da pesquisa. */
export type CsatConversation = {
  id: string;
  status: string;
  resolvedAt: Date | null;
  lastMessageAt: Date | null;
  csatRating: number | null;
  csatComment: string | null;
  csatSentAt: Date | null;
};

export type CsatDistribution = Record<CsatRating, number>;

export type CsatSummary = {
  /** Quantidade de avaliações respondidas. */
  responses: number;
  /** Média das notas (null quando ninguém respondeu). */
  average: number | null;
  /** Quantidade de notas de 1 a 5. */
  distribution: CsatDistribution;
  /** Notas 4 e 5. */
  promoters: number;
  /** Nota 3. */
  passives: number;
  /** Notas 1 e 2. */
  detractors: number;
  /** Percentual de promoters sobre as respostas (0 quando não há resposta). */
  promoterPct: number;
  /** Percentual de detractors sobre as respostas (0 quando não há resposta). */
  detractorPct: number;
};

export type CsatPublicPayload = {
  /** Nota registrada (null enquanto o cliente não avalia). */
  rating: number | null;
  /** Comentário deixado junto da nota. */
  comment: string | null;
  /** Momento da avaliação (ISO 8601). */
  sentAt: string | null;
};

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Janela da pesquisa em milissegundos (padrão: 24h). */
export function csatWindowMs(options: CsatOptions = {}): number {
  if (typeof options.windowMs === 'number' && Number.isFinite(options.windowMs) && options.windowMs > 0) return options.windowMs;
  if (typeof options.windowHours === 'number' && Number.isFinite(options.windowHours) && options.windowHours > 0) return options.windowHours * 3_600_000;
  return CSAT_WINDOW_HOURS * 3_600_000;
}

/**
 * Vale a pena pedir a avaliação?
 * Só quando a conversa está fechada, tem data de resolução, ainda não foi avaliada
 * e a resolução happened dentro da janela (24h por padrão; o fim da janela conta).
 */
export function shouldAskCsat(conversation: CsatState | null | undefined, now: Date = new Date(), options: CsatOptions = {}): boolean {
  if (!conversation) return false;
  if (conversation.status !== 'closed') return false;
  if (conversation.csatRating != null) return false;
  const resolvedAt = toDate(conversation.resolvedAt);
  if (!resolvedAt) return false;
  const elapsed = now.getTime() - resolvedAt.getTime();
  if (elapsed < 0) return false; // ainda não foi resolvida (relógio adiantado)
  return elapsed <= csatWindowMs(options);
}

/** Valida a nota: inteiro de 1 a 5. */
export function parseCsatRating(value: unknown): CsatRating {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < CSAT_MIN_RATING || value > CSAT_MAX_RATING) {
    throw new Error(`Nota inválida: informe um número inteiro de ${CSAT_MIN_RATING} a ${CSAT_MAX_RATING}.`);
  }
  return value as CsatRating;
}

/** Valida o comentário: opcional, até 500 caracteres. */
export function parseCsatComment(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Comentário inválido.');
  const text = value.trim();
  if (!text) return null;
  if (text.length > CSAT_MAX_COMMENT) throw new Error(`Comentário muito longo (máximo ${CSAT_MAX_COMMENT} caracteres).`);
  return text;
}

/**
 * Grava a avaliação da conversa. Idempotente: se já existe nota, não sobrescreve
 * e lança erro "avaliacao ja registrada".
 *
 * O `db` é opcional (o padrão é o banco da aplicação) para permitir uso em testes.
 */
export async function recordCsat(
  conversationId: string,
  rating: number,
  comment?: string | null,
  db?: DB,
): Promise<{ id: string; conversationId: string; csatRating: number; csatComment: string | null; csatSentAt: Date }> {
  const note = parseCsatRating(rating);
  const text = parseCsatComment(comment);
  const database = db ?? (await getDb());
  const [conv] = await database.select({
      id: schema.supportConversations.id,
      csatRating: schema.supportConversations.csatRating,
      orgId: schema.supportConversations.orgId,
    })
    .from(schema.supportConversations).where(eq(schema.supportConversations.id, conversationId));
  if (!conv) throw new Error('Conversa não encontrada.');
  if (conv.csatRating != null) throw new Error('avaliacao ja registrada');
  const sentAt = new Date();
  // a condição `csat_rating is null` evita corrida: duas respostas simultâneas, só uma grava.
  const [row] = await database.update(schema.supportConversations)
    .set({ csatRating: note, csatComment: text, csatSentAt: sentAt })
    .where(and(eq(schema.supportConversations.id, conversationId), isNull(schema.supportConversations.csatRating)))
    .returning({
      id: schema.supportConversations.id,
      csatRating: schema.supportConversations.csatRating,
      csatComment: schema.supportConversations.csatComment,
      csatSentAt: schema.supportConversations.csatSentAt,
    });
  if (!row) throw new Error('avaliacao ja registrada');
  await recordAudit(conv.orgId, {
    action: 'csat.received', entity: 'csat', entityId: conversationId,
    payload: { rating: row.csatRating },
  });
  try {
    await dispatchWebhook(conv.orgId, 'csat.received', {
      conversationId, rating: row.csatRating, comment: row.csatComment,
    }, database);
  } catch (err) {
    console.error('[csat] webhook falhou', err);
  }
  return { id: row.id, conversationId: row.id, csatRating: row.csatRating!, csatComment: row.csatComment, csatSentAt: row.csatSentAt! };
}

/** Resumo da operação: média, respostas, distribuição e promoter/detractor. */
export function csatSummary(rows: { csatRating?: number | null }[] | null | undefined): CsatSummary {
  const distribution: CsatDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let responses = 0;
  let sum = 0;
  for (const row of rows ?? []) {
    const rating = row?.csatRating;
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < CSAT_MIN_RATING || rating > CSAT_MAX_RATING) continue;
    distribution[rating as CsatRating] += 1;
    responses += 1;
    sum += rating;
  }
  const promoters = distribution[4] + distribution[5];
  const detractors = distribution[1] + distribution[2];
  const passives = distribution[3];
  return {
    responses,
    average: responses ? round2(sum / responses) : null,
    distribution,
    promoters,
    passives,
    detractors,
    promoterPct: responses ? round2((promoters / responses) * 100) : 0,
    detractorPct: responses ? round2((detractors / responses) * 100) : 0,
  };
}

/** O que o widget mostra: a nota registrada ou null enquanto não avaliou. */
export function csatPublicPayload(conversation: { csatRating?: number | null; csatComment?: string | null; csatSentAt?: Date | string | null } | null | undefined): CsatPublicPayload {
  const rating = conversation?.csatRating ?? null;
  const sentAt = toDate(conversation?.csatSentAt ?? null);
  return {
    rating: typeof rating === 'number' && Number.isInteger(rating) ? rating : null,
    comment: conversation?.csatComment ?? null,
    sentAt: sentAt ? sentAt.toISOString() : null,
  };
}

/**
 * Leitura pública da conversa para o widget (só os campos da pesquisa).
 *
 * Conversas encerradas antes da fase de CSAT não têm `resolved_at` gravado; nesse caso
 * a data de resolução é ancorada na última mensagem, para não estender a janela da
 * pesquisa além do encerramento real.
 */
export async function publicCsatConversation(db: DB, orgId: string, conversationId: string): Promise<CsatConversation | null> {
  const [row] = await db.select({
    id: schema.supportConversations.id,
    status: schema.supportConversations.status,
    resolvedAt: schema.supportConversations.resolvedAt,
    lastMessageAt: schema.supportConversations.lastMessageAt,
    csatRating: schema.supportConversations.csatRating,
    csatComment: schema.supportConversations.csatComment,
    csatSentAt: schema.supportConversations.csatSentAt,
  }).from(schema.supportConversations)
    .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.orgId, orgId)));
  if (!row) return null;
  if (row.status === 'closed' && !row.resolvedAt) {
    const when = row.lastMessageAt ?? new Date();
    const [upd] = await db.update(schema.supportConversations).set({ resolvedAt: when })
      .where(and(eq(schema.supportConversations.id, conversationId), isNull(schema.supportConversations.resolvedAt)))
      .returning({ resolvedAt: schema.supportConversations.resolvedAt });
    if (upd) row.resolvedAt = upd.resolvedAt;
  }
  return row;
}

/** Conversas da operação que já receberam nota (base do resumo). */
export async function listCsatRows(db: DB, orgId: string): Promise<{ csatRating: number | null; csatComment: string | null; csatSentAt: Date | null }[]> {
  return db.select({
    csatRating: schema.supportConversations.csatRating,
    csatComment: schema.supportConversations.csatComment,
    csatSentAt: schema.supportConversations.csatSentAt,
  }).from(schema.supportConversations)
    .where(and(eq(schema.supportConversations.orgId, orgId), isNotNull(schema.supportConversations.csatRating)));
}

/** Conversas encerradas que ainda estão esperando avaliação dentro da janela. */
export async function countPendingCsat(db: DB, orgId: string, now: Date = new Date(), options: CsatOptions = {}): Promise<number> {
  const rows = await db.select({
    status: schema.supportConversations.status,
    resolvedAt: schema.supportConversations.resolvedAt,
    csatRating: schema.supportConversations.csatRating,
  }).from(schema.supportConversations)
    .where(and(eq(schema.supportConversations.orgId, orgId), eq(schema.supportConversations.status, 'closed'), isNull(schema.supportConversations.csatRating)));
  return rows.filter((row) => shouldAskCsat(row, now, options)).length;
}

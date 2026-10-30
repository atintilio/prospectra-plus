import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';
import { nextBusinessInstant, type SupportSchedule } from './support-schedule';

/**
 * SLA de atendimento (Helpin fase B).
 *
 * Uma política por operação: prazo de primeira resposta e de resolução.
 * O prazo é contado em minutos de relógio; quando `businessHoursOnly` está
 * ligado, o prazo só corre dentro do horário de atendimento da operação.
 */

export const SLA_DEFAULT_FIRST_RESPONSE_MINUTES = 60;
export const SLA_DEFAULT_RESOLUTION_MINUTES = 24 * 60;
export const SLA_MIN_MINUTES = 5;
export const SLA_MAX_MINUTES = 60 * 24 * 30; // 30 dias

export type SlaPolicy = typeof schema.supportSlaPolicies.$inferSelect;

export type SlaPolicyInput = {
  firstResponseMinutes?: number;
  resolutionMinutes?: number;
  businessHoursOnly?: boolean;
};

/** Traz o valor para dentro da faixa permitida. */
export function clampMinutes(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(SLA_MIN_MINUTES, Math.min(SLA_MAX_MINUTES, Math.round(value)));
}

/**
 * Instante-limite a partir de um instante inicial.
 * Com `businessHoursOnly`, o prazo só corre dentro do horário de atendimento.
 */
export function deadlineFrom(
  policy: Pick<SlaPolicy, 'firstResponseMinutes' | 'businessHoursOnly'>,
  from: Date,
  schedule?: Pick<SupportSchedule, 'timezone' | 'weekdays' | 'openMinute' | 'closeMinute'> | null,
  minutes?: number,
): Date {
  const total = minutes ?? policy.firstResponseMinutes;
  if (!policy.businessHoursOnly || !schedule) {
    return new Date(from.getTime() + total * 60_000);
  }
  let cursor = nextBusinessInstant(schedule, from);
  let left = total;
  // No máximo 30 dias úteis de janela — laço curto, termina cedo.
  for (let guard = 0; guard < 60 * 24 * 40 && left > 0; guard++) {
    const { minute } = { minute: minutesSinceMidnight(cursor, schedule.timezone) };
    const remainingToday = Math.max(0, schedule.closeMinute - minute);
    const step = Math.min(left, remainingToday > 0 ? remainingToday : left);
    cursor = new Date(cursor.getTime() + step * 60_000);
    left -= step;
    if (left > 0) cursor = nextBusinessInstant(schedule, cursor);
  }
  return cursor;
}

/** Minutos desde a meia-noite no fuso informado (wrapper sem import circular). */
function minutesSinceMidnight(at: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = fmt.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

export async function listSlaPolicies(db: DB, orgId: string): Promise<SlaPolicy[]> {
  return db.select().from(schema.supportSlaPolicies).where(eq(schema.supportSlaPolicies.orgId, orgId));
}

/** Política da operação; cria o padrão quando ainda não existe. */
export async function getSlaPolicy(orgId: string, db?: DB): Promise<SlaPolicy> {
  const database = db ?? (await getDb());
  const [existing] = await listSlaPolicies(database, orgId);
  if (existing) return existing;
  const [created] = await database.insert(schema.supportSlaPolicies).values({
    orgId,
    firstResponseMinutes: SLA_DEFAULT_FIRST_RESPONSE_MINUTES,
    resolutionMinutes: SLA_DEFAULT_RESOLUTION_MINUTES,
    businessHoursOnly: true,
  }).returning();
  return created;
}

export async function updateSlaPolicy(orgId: string, input: SlaPolicyInput, db?: DB): Promise<SlaPolicy> {
  const database = db ?? (await getDb());
  const current = await getSlaPolicy(orgId, database);
  const firstResponseMinutes = input.firstResponseMinutes !== undefined
    ? clampMinutes(input.firstResponseMinutes, current.firstResponseMinutes)
    : current.firstResponseMinutes;
  const resolutionMinutes = input.resolutionMinutes !== undefined
    ? clampMinutes(input.resolutionMinutes, current.resolutionMinutes)
    : current.resolutionMinutes;
  const businessHoursOnly = input.businessHoursOnly !== undefined ? input.businessHoursOnly : current.businessHoursOnly;

  const [updated] = await database.update(schema.supportSlaPolicies)
    .set({ firstResponseMinutes, resolutionMinutes, businessHoursOnly })
    .where(eq(schema.supportSlaPolicies.id, current.id))
    .returning();
  return updated;
}

/** A conversa estourou o prazo de primeira resposta? */
export function isSlaBreached(dueAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  return dueAt.getTime() < now.getTime();
}

/** Minutos que faltam (negativo quando estourou). */
export function minutesRemaining(dueAt: Date | null | undefined, now: Date = new Date()): number | null {
  if (!dueAt) return null;
  return Math.round((dueAt.getTime() - now.getTime()) / 60_000);
}

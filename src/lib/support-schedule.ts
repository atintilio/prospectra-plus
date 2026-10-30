import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';

/**
 * Horário de atendimento da operação (Helpin fase B).
 *
 * Uma operação define: fuso, dias úteis, hora de abertura/fechamento e
 * (opcionalmente) a mensagem de auto-resposta enviada quando o atendimento
 * chega fora do horário.
 *
 * O cálculo de "dentro/fora do horário" é feito sempre a partir do fuso da
 * operação — o servidor pode estar em UTC.
 */

export const SCHEDULE_DEFAULT_TIMEZONE = 'America/Sao_Paulo';
export const SCHEDULE_DEFAULT_OPEN_MINUTE = 9 * 60;
export const SCHEDULE_DEFAULT_CLOSE_MINUTE = 18 * 60;
/** 0 = domingo … 6 = sábado */
export const SCHEDULE_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export type SupportSchedule = typeof schema.supportSchedules.$inferSelect;

export type SupportScheduleInput = {
  timezone?: string;
  weekdays?: number[];
  openMinute?: number;
  closeMinute?: number;
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
};

const WEEKDAY_BY_SHORT: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Fuso válido para o motor de ICU do Node (senão o Intl lança). */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Partes da data/hora local da operação no instante informado. */
export function zonedParts(
  at: Date,
  timeZone: string = SCHEDULE_DEFAULT_TIMEZONE,
): { weekday: number; minute: number; hour: number } {
  const safeTz = isValidTimeZone(timeZone) ? timeZone : SCHEDULE_DEFAULT_TIMEZONE;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hourRaw = Number(pick('hour'));
  const minute = Number(pick('minute'));
  const weekday = WEEKDAY_BY_SHORT[pick('weekday')] ?? 0;
  return { weekday, hour: hourRaw === 24 ? 0 : hourRaw, minute: Number.isFinite(minute) ? minute : 0 };
}

/** Minutos desde a meia-noite local da operação. */
export function localMinute(at: Date, timeZone: string = SCHEDULE_DEFAULT_TIMEZONE): number {
  const { hour, minute } = zonedParts(at, timeZone);
  return hour * 60 + minute;
}

/** A operação está atendendo neste instante? */
export function withinSchedule(
  schedule: Pick<SupportSchedule, 'timezone' | 'weekdays' | 'openMinute' | 'closeMinute'> | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!schedule) return true;
  const { weekday } = zonedParts(at, schedule.timezone);
  if (!schedule.weekdays.includes(weekday)) return false;
  const minute = localMinute(at, schedule.timezone);
  return minute >= schedule.openMinute && minute < schedule.closeMinute;
}

/**
 * Próximo instante dentro do horário de atendimento a partir de `from`.
 * Em vez de varrer minuto a minuto, salta para a abertura do próximo dia útil.
 */
export function nextBusinessInstant(
  schedule: Pick<SupportSchedule, 'timezone' | 'weekdays' | 'openMinute' | 'closeMinute'>,
  from: Date = new Date(),
): Date {
  if (withinSchedule(schedule, from)) return from;
  let cursor = new Date(from.getTime());
  for (let guard = 0; guard < 21; guard++) {
    const { weekday } = zonedParts(cursor, schedule.timezone);
    if (!schedule.weekdays.includes(weekday)) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60_000); // dia sem atendimento
      continue;
    }
    const minute = localMinute(cursor, schedule.timezone);
    if (minute < schedule.openMinute) {
      cursor = new Date(cursor.getTime() + (schedule.openMinute - minute) * 60_000); // vai até a abertura
    } else if (minute >= schedule.closeMinute) {
      cursor = new Date(cursor.getTime() + (24 * 60 - minute + 1) * 60_000); // próximo dia
      continue;
    }
    if (withinSchedule(schedule, cursor)) return new Date(cursor.getTime());
  }
  return new Date(from.getTime());
}

/** "09:00" a partir de minutos desde a meia-noite. */
export function formatMinute(minute: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Minutos desde a meia-noite a partir de "HH:MM" (null quando inválido). */
export function parseMinute(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  const total = hour * 60 + minute;
  return total >= 24 * 60 ? null : total;
}

/** Normaliza os dias da semana (dedup, ordem, somente 0..6). */
export function normalizeWeekdays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  const out = new Set<number>();
  for (const d of days) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export async function listSchedules(db: DB, orgId: string): Promise<SupportSchedule[]> {
  return db.select().from(schema.supportSchedules).where(eq(schema.supportSchedules.orgId, orgId));
}

/** Horário da operação; cria o padrão quando ainda não existe. */
export async function getSchedule(orgId: string, db?: DB): Promise<SupportSchedule> {
  const database = db ?? (await getDb());
  const [existing] = await listSchedules(database, orgId);
  if (existing) return existing;
  const [created] = await database.insert(schema.supportSchedules).values({
    orgId,
    timezone: SCHEDULE_DEFAULT_TIMEZONE,
    weekdays: [1, 2, 3, 4, 5],
    openMinute: SCHEDULE_DEFAULT_OPEN_MINUTE,
    closeMinute: SCHEDULE_DEFAULT_CLOSE_MINUTE,
    autoReplyEnabled: false,
    autoReplyMessage: '',
  }).returning();
  return created;
}

export async function upsertSchedule(orgId: string, input: SupportScheduleInput, db?: DB): Promise<SupportSchedule> {
  const database = db ?? (await getDb());
  const current = await getSchedule(orgId, database);
  const timezone = input.timezone !== undefined ? input.timezone : current.timezone;
  const weekdays = input.weekdays !== undefined ? normalizeWeekdays(input.weekdays) : current.weekdays;
  const openMinute = input.openMinute !== undefined ? input.openMinute : current.openMinute;
  const closeMinute = input.closeMinute !== undefined ? input.closeMinute : current.closeMinute;
  const autoReplyEnabled = input.autoReplyEnabled !== undefined ? input.autoReplyEnabled : current.autoReplyEnabled;
  const autoReplyMessage = input.autoReplyMessage !== undefined ? input.autoReplyMessage : current.autoReplyMessage;

  if (!isValidTimeZone(timezone)) throw new Error('Fuso horário inválido');
  if (openMinute < 0 || openMinute > 24 * 60) throw new Error('Hora de abertura inválida');
  if (closeMinute < 0 || closeMinute > 24 * 60) throw new Error('Hora de fechamento inválida');
  if (openMinute >= closeMinute) throw new Error('A abertura precisa ser antes do fechamento');
  if (weekdays.length === 0) throw new Error('Escolha ao menos um dia de atendimento');

  const [updated] = await database.update(schema.supportSchedules)
    .set({ timezone, weekdays, openMinute, closeMinute, autoReplyEnabled, autoReplyMessage })
    .where(eq(schema.supportSchedules.id, current.id))
    .returning();
  return updated;
}

import 'server-only';
import { and, asc, eq, gt, gte, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { getDb, schema, type DB } from '@/db';
import type { Scope } from '@/lib/whatsapp/akg';
import { computeSlots, type AgendaSlot } from '@/lib/agenda-slots';
import { notifyBooking } from '@/lib/agenda-notify';

/**
 * Agenda nativa do Prospectra — tipos de reunião, links rastreados, reservas
 * públicas e cancelamento.
 *
 * Regras de ouro:
 *  - quem agenda é o PÚBLICO: o horário pedido é sempre recalculado contra a
 *    disponibilidade atual (nunca confiamos no que o navegador enviou);
 *  - o banco é a última linha de defesa: `meetings_no_double_booking`
 *    (org_id, user_id, scheduled_at) impede duas reservas no mesmo horário;
 *  - nada de sessão nas funções públicas: o evento é procurado pelo slug, mas
 *    as reservas que bloqueiam um horário são só da MESMA operação.
 */

/** Base pública da agenda (cancelamento, link do lead). */
export const AGENDA_PUBLIC_URL = process.env.AGENDA_PUBLIC_URL?.trim() || 'https://agenda.argusprime.com.br';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type AgendaEventType = typeof schema.agendaEventTypes.$inferSelect;
export type AgendaBooking = typeof schema.meetings.$inferSelect;
export type AgendaAvailability = { dayOfWeek: number; startMinute: number; endMinute: number };
export type AgendaBookingCode = 'not_found' | 'slot_taken' | 'invalid' | 'past';

export type AgendaEventTypeInput = {
  title: string;
  slug?: string;
  description?: string;
  durationMin?: number;
  slotIntervalMin?: number;
  minNoticeMin?: number;
  bufferMin?: number;
  timezone?: string;
  location?: string;
  requiresConfirmation?: boolean;
  availability?: AgendaAvailability[];
};

export type AgendaEventTypePatch = {
  title?: string;
  slug?: string;
  description?: string;
  durationMin?: number;
  slotIntervalMin?: number;
  minNoticeMin?: number;
  bufferMin?: number;
  timezone?: string;
  location?: string;
  requiresConfirmation?: boolean;
  isActive?: boolean;
};

/** Banco explícito (testes/transações) ou o banco da aplicação. */
async function resolveDb(db: DB | undefined): Promise<DB> {
  return db ?? (await getDb());
}

// ---------------------------------------------------------------- texto/slug

/** minúsculas, sem acento, apenas a-z0-9 e hífen. */
export function slugify(value: string): string {
  const base = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'reuniao';
}

function normalizeSlug(value: string): string {
  return (value ?? '').trim().toLowerCase();
}

/** Slug único na operação: `reuniao`, `reuniao-2`, `reuniao-3`… */
async function uniqueSlug(database: DB, orgId: string, desired: string): Promise<string> {
  const taken = new Set(
    (await database.select({ slug: schema.agendaEventTypes.slug }).from(schema.agendaEventTypes).where(eq(schema.agendaEventTypes.orgId, orgId))).map(
      (row) => row.slug,
    ),
  );
  if (!taken.has(desired)) return desired;
  let suffix = 2;
  while (taken.has(`${desired}-${suffix}`)) suffix += 1;
  return `${desired}-${suffix}`;
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Janelas de disponibilidade saneadas (dia 0=domingo … 6=sábado, minutos do dia). */
function normalizeWindows(windows: AgendaAvailability[] | undefined): AgendaAvailability[] {
  const seen = new Set<string>();
  const clean: AgendaAvailability[] = [];
  for (const window of windows ?? []) {
    const dayOfWeek = Math.trunc(window.dayOfWeek);
    const startMinute = Math.trunc(window.startMinute);
    const endMinute = Math.trunc(window.endMinute);
    if (!Number.isFinite(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw new Error('Dia da semana inválido (use 0=domingo … 6=sábado).');
    }
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) {
      throw new Error('Janela de horário inválida (use minutos desde 00:00).');
    }
    const key = `${dayOfWeek}:${startMinute}:${endMinute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ dayOfWeek, startMinute, endMinute });
  }
  return clean;
}

// ------------------------------------------------------------ erros do banco

type PgErrorInfo = { code?: string; constraint?: string };

function readPgError(error: unknown): PgErrorInfo {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    const code = typeof candidate.code === 'string' ? candidate.code : undefined;
    const constraint =
      typeof candidate.constraint === 'string'
        ? candidate.constraint
        : typeof candidate.constraint_name === 'string'
          ? candidate.constraint_name
          : undefined;
    if (code || constraint) return { code, constraint };
    current = candidate.cause;
  }
  return {};
}

function uniqueConstraint(error: unknown): string | undefined {
  const info = readPgError(error);
  if (info.code !== '23505') return undefined;
  return info.constraint;
}

// --------------------------------------------------------------- consultas

async function findEventTypeInOrg(database: DB, orgId: string, eventTypeId: string): Promise<AgendaEventType | undefined> {
  const [row] = await database
    .select()
    .from(schema.agendaEventTypes)
    .where(and(eq(schema.agendaEventTypes.id, eventTypeId), eq(schema.agendaEventTypes.orgId, orgId)))
    .limit(1);
  return row;
}

/** Evento público: procurado pelo slug globalmente, sem sessão. */
async function findPublicEventType(database: DB, slug: string): Promise<AgendaEventType | undefined> {
  const [row] = await database
    .select()
    .from(schema.agendaEventTypes)
    .where(and(eq(schema.agendaEventTypes.slug, normalizeSlug(slug)), eq(schema.agendaEventTypes.isActive, true)))
    .limit(1);
  return row;
}

async function loadAvailability(database: DB, eventTypeId: string): Promise<AgendaAvailability[]> {
  const rows = await database
    .select({
      dayOfWeek: schema.agendaAvailability.dayOfWeek,
      startMinute: schema.agendaAvailability.startMinute,
      endMinute: schema.agendaAvailability.endMinute,
    })
    .from(schema.agendaAvailability)
    .where(eq(schema.agendaAvailability.eventTypeId, eventTypeId))
    .orderBy(asc(schema.agendaAvailability.dayOfWeek), asc(schema.agendaAvailability.startMinute));
  return rows;
}

async function loadBlackouts(database: DB, orgId: string, from: Date, to: Date): Promise<{ startAt: Date; endAt: Date }[]> {
  const rows = await database
    .select({ startAt: schema.agendaBlackouts.startAt, endAt: schema.agendaBlackouts.endAt })
    .from(schema.agendaBlackouts)
    .where(and(eq(schema.agendaBlackouts.orgId, orgId), lt(schema.agendaBlackouts.endAt, to), gt(schema.agendaBlackouts.startAt, from)));
  return rows.map((row) => ({ startAt: row.startAt, endAt: row.endAt }));
}

/** Reservas que ocupam o horário — somente da MESMA operação. */
async function loadBusy(database: DB, orgId: string, from: Date, to: Date): Promise<{ start: Date; end: Date }[]> {
  const rows = await database
    .select({ start: schema.meetings.scheduledAt, end: schema.meetings.endTime })
    .from(schema.meetings)
    .where(
      and(
        eq(schema.meetings.orgId, orgId),
        isNotNull(schema.meetings.scheduledAt),
        sql`${schema.meetings.status} in ('requested','confirmed')`,
        gte(schema.meetings.scheduledAt, from),
        lte(schema.meetings.scheduledAt, to),
      ),
    );
  return rows.flatMap((row) => (row.start ? [{ start: row.start, end: row.end ?? row.start }] : []));
}

function slotWindow(from: Date | undefined, to: Date | undefined): { from: Date; to: Date } {
  const now = new Date();
  const start = from ?? now;
  const end = to ?? new Date(start.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from: start, to: end };
}

// ------------------------------------------------------------ tipos de reunião

/** Lista os tipos de reunião da operação. */
export async function listEventTypes(db: DB | undefined, scope: Scope): Promise<AgendaEventType[]> {
  const database = await resolveDb(db);
  return database
    .select()
    .from(schema.agendaEventTypes)
    .where(eq(schema.agendaEventTypes.orgId, scope.orgId))
    .orderBy(asc(schema.agendaEventTypes.createdAt), asc(schema.agendaEventTypes.title));
}

/** Tipo de reunião pelo slug, dentro da operação do usuário. */
export async function getEventTypeBySlug(db: DB | undefined, scope: Scope, slug: string): Promise<AgendaEventType | undefined> {
  const database = await resolveDb(db);
  const [row] = await database
    .select()
    .from(schema.agendaEventTypes)
    .where(and(eq(schema.agendaEventTypes.orgId, scope.orgId), eq(schema.agendaEventTypes.slug, normalizeSlug(slug))))
    .limit(1);
  return row;
}

/** Cria um tipo de reunião (com slug único na operação) e a disponibilidade inicial. */
export async function createEventType(db: DB | undefined, scope: Scope, input: AgendaEventTypeInput): Promise<AgendaEventType> {
  const database = await resolveDb(db);
  const title = (input.title ?? '').trim();
  if (!title) throw new Error('Informe o título do tipo de reunião.');
  const desired = normalizeSlug(input.slug ?? '') || slugify(title);
  const slug = await uniqueSlug(database, scope.orgId, desired);
  const [created] = await database
    .insert(schema.agendaEventTypes)
    .values({
      orgId: scope.orgId,
      userId: scope.userId,
      title,
      slug,
      description: (input.description ?? '').trim(),
      durationMin: boundedInt(input.durationMin, 30, 5, 480),
      slotIntervalMin: boundedInt(input.slotIntervalMin, 30, 5, 240),
      minNoticeMin: boundedInt(input.minNoticeMin, 120, 0, 20160),
      bufferMin: boundedInt(input.bufferMin, 0, 0, 480),
      timezone: (input.timezone ?? '').trim() || DEFAULT_TIMEZONE,
      location: (input.location ?? '').trim(),
      requiresConfirmation: input.requiresConfirmation ?? false,
      isActive: true,
    })
    .returning();
  const windows = normalizeWindows(input.availability);
  if (windows.length) await writeAvailability(database, scope.orgId, created.id, windows);
  return created;
}

/** Edita um tipo de reunião da operação. */
export async function updateEventType(
  db: DB | undefined,
  scope: Scope,
  eventTypeId: string,
  patch: AgendaEventTypePatch,
): Promise<AgendaEventType> {
  const database = await resolveDb(db);
  const current = await findEventTypeInOrg(database, scope.orgId, eventTypeId);
  if (!current) throw new Error('Tipo de reunião não encontrado.');

  const values: Partial<typeof schema.agendaEventTypes.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new Error('Informe o título do tipo de reunião.');
    values.title = title;
  }
  if (patch.slug !== undefined) {
    const desired = normalizeSlug(patch.slug);
    if (!desired) throw new Error('Informe um slug válido.');
    values.slug = desired === current.slug ? desired : await uniqueSlug(database, scope.orgId, desired);
  }
  if (patch.description !== undefined) values.description = patch.description.trim();
  if (patch.durationMin !== undefined) values.durationMin = boundedInt(patch.durationMin, current.durationMin, 5, 480);
  if (patch.slotIntervalMin !== undefined) values.slotIntervalMin = boundedInt(patch.slotIntervalMin, current.slotIntervalMin, 5, 240);
  if (patch.minNoticeMin !== undefined) values.minNoticeMin = boundedInt(patch.minNoticeMin, current.minNoticeMin, 0, 20160);
  if (patch.bufferMin !== undefined) values.bufferMin = boundedInt(patch.bufferMin, current.bufferMin, 0, 480);
  if (patch.timezone !== undefined) values.timezone = patch.timezone.trim() || DEFAULT_TIMEZONE;
  if (patch.location !== undefined) values.location = patch.location.trim();
  if (patch.requiresConfirmation !== undefined) values.requiresConfirmation = patch.requiresConfirmation;
  if (patch.isActive !== undefined) values.isActive = patch.isActive;

  const [updated] = await database.update(schema.agendaEventTypes).set(values).where(eq(schema.agendaEventTypes.id, current.id)).returning();
  return updated;
}

/** Substitui a disponibilidade semanal do tipo de reunião. */
export async function setAvailability(
  db: DB | undefined,
  scope: Scope,
  eventTypeId: string,
  windows: AgendaAvailability[],
): Promise<void> {
  const database = await resolveDb(db);
  const current = await findEventTypeInOrg(database, scope.orgId, eventTypeId);
  if (!current) throw new Error('Tipo de reunião não encontrado.');
  await writeAvailability(database, scope.orgId, eventTypeId, normalizeWindows(windows));
}

async function writeAvailability(database: DB, orgId: string, eventTypeId: string, windows: AgendaAvailability[]): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.delete(schema.agendaAvailability).where(eq(schema.agendaAvailability.eventTypeId, eventTypeId));
    if (windows.length) {
      await tx.insert(schema.agendaAvailability).values(windows.map((window) => ({ orgId, eventTypeId, ...window })));
    }
  });
}

/** Disponibilidade semanal do tipo de reunião. */
export async function listAvailability(
  db: DB | undefined,
  scope: Scope,
  eventTypeId: string,
): Promise<AgendaAvailability[]> {
  const database = await resolveDb(db);
  const current = await findEventTypeInOrg(database, scope.orgId, eventTypeId);
  if (!current) throw new Error('Tipo de reunião não encontrado.');
  return loadAvailability(database, eventTypeId);
}

// ------------------------------------------------------------------- links

/**
 * Gera um link rastreado: o lead que abre a URL e agenda fica vinculado à
 * reserva (`agenda_links.leadId`).
 */
export async function createLink(
  db: DB | undefined,
  scope: Scope,
  eventTypeId: string,
  opts?: { leadId?: string | null; channel?: string },
): Promise<{ token: string; url: string }> {
  const database = await resolveDb(db);
  const eventType = await findEventTypeInOrg(database, scope.orgId, eventTypeId);
  if (!eventType) throw new Error('Tipo de reunião não encontrado.');

  const leadId = opts?.leadId ?? null;
  if (leadId) {
    const [lead] = await database
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, scope.orgId)))
      .limit(1);
    if (!lead) throw new Error('Lead não encontrado.');
  }

  const token = randomBytes(24).toString('base64url');
  await database.insert(schema.agendaLinks).values({
    orgId: scope.orgId,
    eventTypeId,
    leadId,
    token,
    channel: (opts?.channel ?? '').trim() || 'link',
  });
  return { token, url: `${AGENDA_PUBLIC_URL}/agendamento/${eventType.slug}?token=${token}` };
}

// ---------------------------------------------------------------- reservas

/** Reservas da operação (por padrão, só as que ainda estão de pé). */
export async function listBookings(
  db: DB | undefined,
  scope: Scope,
  opts?: { from?: Date; to?: Date; limit?: number; includeCancelled?: boolean },
): Promise<AgendaBooking[]> {
  const database = await resolveDb(db);
  const conditions = [eq(schema.meetings.orgId, scope.orgId)];
  if (opts?.from) conditions.push(gte(schema.meetings.scheduledAt, opts.from));
  if (opts?.to) conditions.push(lte(schema.meetings.scheduledAt, opts.to));
  if (!opts?.includeCancelled) {
    conditions.push(sql`${schema.meetings.status} in ('requested','confirmed')`);
  }
  const limit = boundedInt(opts?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  return database
    .select()
    .from(schema.meetings)
    .where(and(...conditions))
    .orderBy(asc(schema.meetings.scheduledAt), asc(schema.meetings.createdAt))
    .limit(limit);
}

// ----------------------------------------------------------------- público

/** Dados públicos do evento (sem sessão). */
export async function listPublicEvent(
  db: DB | undefined,
  slug: string,
): Promise<
  | {
      ok: true;
      eventType: {
        slug: string;
        title: string;
        description: string;
        durationMin: number;
        location: string;
        requiresConfirmation: boolean;
        hostName: string;
      };
    }
  | { ok: false; error: string }
> {
  const database = await resolveDb(db);
  const eventType = await findPublicEventType(database, slug);
  if (!eventType) return { ok: false, error: 'Evento não encontrado.' };
  const [host] = await database.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, eventType.userId)).limit(1);
  return {
    ok: true,
    eventType: {
      slug: eventType.slug,
      title: eventType.title,
      description: eventType.description,
      durationMin: eventType.durationMin,
      location: eventType.location,
      requiresConfirmation: eventType.requiresConfirmation,
      hostName: host?.name?.trim() || 'Equipe Prospectra',
    },
  };
}

/** Horários livres do evento (sem sessão; bloqueios só da mesma operação). */
export async function listPublicSlots(
  db: DB | undefined,
  slug: string,
  opts?: { from?: Date; to?: Date },
): Promise<{ ok: true; slots: AgendaSlot[] } | { ok: false; error: string }> {
  const database = await resolveDb(db);
  const eventType = await findPublicEventType(database, slug);
  if (!eventType) return { ok: false, error: 'Evento não encontrado.' };

  const now = new Date();
  const { from, to } = slotWindow(opts?.from, opts?.to);
  const availability = await loadAvailability(database, eventType.id);
  const blackouts = await loadBlackouts(database, eventType.orgId, from, to);
  const busy = await loadBusy(database, eventType.orgId, from, to);
  const slots = computeSlots({
    durationMin: eventType.durationMin,
    slotIntervalMin: eventType.slotIntervalMin,
    minNoticeMin: eventType.minNoticeMin,
    bufferMin: eventType.bufferMin,
    timezone: eventType.timezone,
    availability,
    blackouts,
    busy,
    from,
    to,
    now,
  });
  return { ok: true, slots };
}

/**
 * Reserva pública. O horário pedido é recalculado contra a disponibilidade
 * atual — o cliente não escolhe o que não existe.
 */
export async function bookPublic(
  db: DB | undefined,
  args: {
    slug: string;
    token?: string | null;
    start: Date;
    attendeeName: string;
    attendeeEmail?: string | null;
    attendeePhone?: string | null;
    notes?: string;
    /** Transporte de WhatsApp injetado (a lib não chama o gateway sozinha). */
    sendWhatsApp?: (recipient: string, text: string) => Promise<void>;
  },
): Promise<{ ok: true; meeting: AgendaBooking; cancelUrl: string } | { ok: false; error: string; code: AgendaBookingCode }> {
  const database = await resolveDb(db);

  const attendeeName = (args.attendeeName ?? '').trim();
  if (!attendeeName) return { ok: false, error: 'Informe o nome de quem vai participar.', code: 'invalid' };
  const start = args.start instanceof Date ? args.start : new Date(args.start);
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Horário inválido.', code: 'invalid' };

  const eventType = await findPublicEventType(database, args.slug);
  if (!eventType) return { ok: false, error: 'Evento não encontrado.', code: 'not_found' };

  const now = new Date();
  if (start.getTime() <= now.getTime()) {
    return { ok: false, error: 'Este horário já passou. Escolha outro na agenda.', code: 'past' };
  }

  // Link rastreado: precisa existir e ser deste evento.
  const token = (args.token ?? '').trim();
  let link: { id: string; leadId: string | null } | null = null;
  if (token) {
    const [row] = await database
      .select({ id: schema.agendaLinks.id, leadId: schema.agendaLinks.leadId, eventTypeId: schema.agendaLinks.eventTypeId })
      .from(schema.agendaLinks)
      .where(eq(schema.agendaLinks.token, token))
      .limit(1);
    if (!row) return { ok: false, error: 'Link de agendamento inválido.', code: 'invalid' };
    if (row.eventTypeId !== eventType.id) {
      return { ok: false, error: 'Este link de agendamento não é deste evento.', code: 'invalid' };
    }
    link = { id: row.id, leadId: row.leadId };
  }

  // Recalcula os slots e valida o horário pedido (janela em torno do pedido).
  const windowFrom = new Date(start.getTime() - 12 * 60 * 60 * 1000);
  const windowTo = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  const availability = await loadAvailability(database, eventType.id);
  const blackouts = await loadBlackouts(database, eventType.orgId, windowFrom, windowTo);
  const busy = await loadBusy(database, eventType.orgId, windowFrom, windowTo);
  const slots = computeSlots({
    durationMin: eventType.durationMin,
    slotIntervalMin: eventType.slotIntervalMin,
    minNoticeMin: eventType.minNoticeMin,
    bufferMin: eventType.bufferMin,
    timezone: eventType.timezone,
    availability,
    blackouts,
    busy,
    from: windowFrom,
    to: windowTo,
    now,
  });
  const wanted = start.getTime();
  const available = slots.some((slot) => new Date(slot.startIso).getTime() === wanted);
  if (!available) {
    return { ok: false, error: 'Este horário não está mais disponível. Escolha outro na agenda.', code: 'slot_taken' };
  }

  // Um lead não pode ter duas reuniões em aberto (índice `meetings_one_open_per_lead`).
  if (link?.leadId) {
    const [open] = await database
      .select({ id: schema.meetings.id })
      .from(schema.meetings)
      .where(
        and(
          eq(schema.meetings.orgId, eventType.orgId),
          eq(schema.meetings.leadId, link.leadId),
          sql`${schema.meetings.status} in ('requested','confirmed')`,
        ),
      )
      .limit(1);
    if (open) {
      return { ok: false, error: 'Este contato já tem uma reunião em aberto.', code: 'invalid' };
    }
  }

  const cancelToken = randomBytes(32).toString('base64url');
  const status: 'confirmed' | 'requested' = eventType.requiresConfirmation ? 'requested' : 'confirmed';
  const endTime = new Date(start.getTime() + eventType.durationMin * 60 * 1000);
  const schedulerUrl = `${AGENDA_PUBLIC_URL}/agendamento/${eventType.slug}${token ? `?token=${token}` : ''}`;

  let meeting: AgendaBooking;
  try {
    meeting = await database.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.meetings)
        .values({
          orgId: eventType.orgId,
          userId: eventType.userId,
          leadId: link?.leadId ?? null,
          status,
          source: 'agenda',
          schedulerUrl,
          scheduledAt: start,
          eventTypeId: eventType.id,
          linkId: link?.id ?? null,
          attendeeName,
          attendeeEmail: (args.attendeeEmail ?? '').trim() || null,
          attendeePhone: (args.attendeePhone ?? '').trim() || null,
          endTime,
          timezone: eventType.timezone,
          location: eventType.location,
          cancelToken,
          notes: (args.notes ?? '').slice(0, 2000),
          confirmedAt: status === 'confirmed' ? now : null,
        })
        .returning();
      if (link) {
        await tx.update(schema.agendaLinks).set({ usedAt: now }).where(eq(schema.agendaLinks.id, link.id));
      }
      return row;
    });
  } catch (error) {
    const constraint = uniqueConstraint(error);
    if (constraint === 'meetings_one_open_per_lead') {
      return { ok: false, error: 'Este contato já tem uma reunião em aberto.', code: 'invalid' };
    }
    if (constraint === 'meetings_no_double_booking' || constraint === undefined) {
      // Corrida de reserva dupla: o índice unique parcial barrou o segundo booking.
      const isUnique = constraint !== undefined || readPgError(error).code === '23505';
      if (isUnique) return { ok: false, error: 'Este horário acabou de ser reservado. Escolha outro.', code: 'slot_taken' };
    }
    throw error;
  }

  const cancelUrl = `${AGENDA_PUBLIC_URL}/agendamento/cancelar?token=${cancelToken}`;

  // Avisos da reserva (convite .ics, aviso ao vendedor, WhatsApp do
  // participante). A reserva já está gravada: falha de notificação NUNCA
  // desfaz o agendamento — no máximo o estado 'unknown' é registrado.
  try {
    const [seller] = await database
      .select({
        email: schema.users.email,
        name: schema.users.name,
        sellerPhone: schema.commercialProfiles.sellerPhone,
      })
      .from(schema.users)
      .leftJoin(
        schema.commercialProfiles,
        and(
          eq(schema.commercialProfiles.orgId, eventType.orgId),
          eq(schema.commercialProfiles.userId, eventType.userId),
        ),
      )
      .where(eq(schema.users.id, eventType.userId))
      .limit(1);
    await notifyBooking(database, {
      meetingId: meeting.id,
      orgId: eventType.orgId,
      sellerEmail: seller?.email ?? '',
      sellerName: seller?.name ?? null,
      sellerUserId: eventType.userId,
      sellerPhone: seller?.sellerPhone ?? null,
      attendeeName,
      attendeeEmail: meeting.attendeeEmail,
      attendeePhone: meeting.attendeePhone,
      start,
      durationMin: eventType.durationMin,
      timezone: eventType.timezone,
      location: eventType.location,
      cancelUrl,
      sendInvite: eventType.sendInvite,
      notifySeller: eventType.notifySeller,
      sendWhatsApp: args.sendWhatsApp,
    });
  } catch (error) {
    console.error('[agenda-booking] falha ao notificar a reserva', meeting.id, error);
  }

  return { ok: true, meeting, cancelUrl };
}

/** Cancela uma reserva pelo token público (somente `confirmed`/`requested`). */
export async function cancelPublic(db: DB | undefined, args: { cancelToken: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = (args.cancelToken ?? '').trim();
  if (!token) return { ok: false, error: 'Link de cancelamento inválido.' };
  const database = await resolveDb(db);
  const [meeting] = await database.select().from(schema.meetings).where(eq(schema.meetings.cancelToken, token)).limit(1);
  if (!meeting) return { ok: false, error: 'Link de cancelamento inválido ou expirado.' };
  if (meeting.status === 'cancelled') return { ok: false, error: 'Esta reunião já foi cancelada.' };

  const updated = await database
    .update(schema.meetings)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(and(eq(schema.meetings.id, meeting.id), sql`${schema.meetings.status} in ('requested','confirmed')`))
    .returning();
  if (!updated.length) return { ok: false, error: 'Esta reunião já foi cancelada.' };
  return { ok: true };
}

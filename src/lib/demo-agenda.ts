import { and, eq, isNull } from 'drizzle-orm';
import { schema, type DB } from '@/db';

/**
 * Seed da demonstração — agenda nativa.
 *
 * A agenda do Prospectra é a tela que mostra "a suíte funcionando": tipos de
 * reunião com disponibilidade, link público rastreado, reservas (confirmada,
 * aguardando aprovação e cancelada) e bloqueios de agenda.
 *
 * Regras do módulo:
 *  - nada de rede: o seed só grava dados já prontos (nenhum e-mail, WhatsApp,
 *    LinkedIn ou IA é chamado aqui);
 *  - dado fictício: e-mails `@demo.invalid` e telefones no padrão
 *    `+55 51 9XXXX-XXXX` — nunca um número real;
 *  - idempotente: rodar duas vezes não duplica nada (a segunda rodada
 *    encontra tudo o que já existe e não insere de novo);
 *  - determinístico: o que varia (tokens) sai do `rand` do contexto — nunca
 *    de `Math.random`.
 */

/** Fuso usado pela demonstração (a agenda nativa do Prospectra). */
const TIMEZONE = 'America/Sao_Paulo';

/** Brasil sem horário de verão desde 2019: São Paulo é sempre UTC-3. */
const SAO_PAULO_OFFSET_MIN = 180;

/** Base pública fictícia do link de agendamento da demonstração. */
const AGENDA_BASE_URL = 'https://agenda.demo.invalid';

/** Lead enxuto: o seed só precisa these campos do CRM. */
export type DemoLead = {
  id: string;
  fullName: string;
  company: string;
  headline: string;
  stage: string;
  ownerId: string | null;
};

/** Contexto compartilhado do seed da demonstração. */
export type AgendaDemoCtx = {
  orgId: string;
  userId: string;
  userIds: string[];
  leads: DemoLead[];
  now: Date;
  rand: () => number;
};

/** Resumo do que o seed gravou (o owner usa para log e para o relatório). */
export type AgendaSeedResult = {
  eventTypes: Array<{ id: string; slug: string; title: string }>;
  links: Array<{ id: string; token: string; channel: string; leadId: string | null }>;
  meetings: Array<{ id: string; status: 'confirmed' | 'requested' | 'cancelled'; leadId: string | null }>;
  blackouts: Array<{ id: string; reason: string }>;
};

type EventTypeSeed = {
  title: string;
  slug: string;
  description: string;
  durationMin: number;
  slotIntervalMin: number;
  minNoticeMin: number;
  bufferMin: number;
  location: string;
  requiresConfirmation: boolean;
};

/** Os dois tipos de reunião da demonstração. */
const EVENT_TYPES: EventTypeSeed[] = [
  {
    title: 'Diagnóstico tributário (30 min)',
    slug: 'diagnostico-tributario',
    description:
      'Em 30 minutos entendemos o momento fiscal da empresa e apontamos onde há crédito de PIS/COFINS e ICMS a recuperar.',
    durationMin: 30,
    slotIntervalMin: 30,
    minNoticeMin: 120,
    bufferMin: 15,
    location: 'https://meet.demo.invalid/atlas-diagnostico',
    requiresConfirmation: false,
  },
  {
    title: 'Reunião de fechamento (45 min)',
    slug: 'reuniao-fechamento',
    description:
      '45 minutos para fechar o escopo do diagnóstico, apresentar o plano de compensação e organizar os próximos passos com o time.',
    durationMin: 45,
    slotIntervalMin: 45,
    minNoticeMin: 1440,
    bufferMin: 30,
    location: 'https://meet.demo.invalid/atlas-fechamento',
    requiresConfirmation: true,
  },
];

/** Disponibilidade semanal: seg-sex 9h-12h e 14h-18h, sábado 9h-12h. */
const AVAILABILITY: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }> = [
  { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
  { dayOfWeek: 2, startMinute: 540, endMinute: 720 },
  { dayOfWeek: 3, startMinute: 540, endMinute: 720 },
  { dayOfWeek: 4, startMinute: 540, endMinute: 720 },
  { dayOfWeek: 5, startMinute: 540, endMinute: 720 },
  { dayOfWeek: 1, startMinute: 840, endMinute: 1080 },
  { dayOfWeek: 2, startMinute: 840, endMinute: 1080 },
  { dayOfWeek: 3, startMinute: 840, endMinute: 1080 },
  { dayOfWeek: 4, startMinute: 840, endMinute: 1080 },
  { dayOfWeek: 5, startMinute: 840, endMinute: 1080 },
  { dayOfWeek: 6, startMinute: 540, endMinute: 720 },
];

/** Motivo do bloqueio — a razão do idempotente é o próprio motivo. */
const BLACKOUT_REASON = 'Congresso do contador — Aurora Contábil (SC)';

// ------------------------------------------------------------------ helpers

/** "Mariana Duarte" -> "mariana.duarte" (sem acento, minúsculo). */
function slugify(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Hash estável (dois canais) em hexadecimal — o mesmo texto gera sempre o mesmo hash. */
function hashHex(seed: string, bytes: number): string {
  const text = seed || 'demo';
  let h1 = 0x811c9dc5 ^ text.length;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  const out: string[] = [];
  for (let i = 0; out.length < bytes; i += 1) {
    const mixed = Math.imul(h1 ^ Math.imul(h2 + i, 0x27d4eb2d), 0x165667b1) >>> 0;
    out.push((mixed & 0xff).toString(16).padStart(2, '0'));
  }
  return out.join('');
}

/** UUID no formato v4 derivado do texto (sem `Math.random`: o seed é determinístico). */
function deterministicUuid(seed: string): string {
  const bytes = hashHex(seed, 16)
    .match(/../g)
    ?.map((pair) => parseInt(pair, 16)) ?? [];
  if (bytes.length !== 16) throw new Error('Demo: hash inválido para o id determinístico.');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** E-mail fictício do participante (`@demo.invalid` nunca é deliverável). */
function fakeEmail(fullName: string): string {
  const base = slugify(fullName).replace(/-/g, '.');
  return `${base || 'participante'}@demo.invalid`;
}

/** Telefone fictício no padrão `+55 51 9XXXX-XXXX` (derivado do id, estável). */
function fakePhone(seed: string): string {
  const digits = hashHex(seed, 4)
    .split('')
    .map((char) => String(parseInt(char, 16) % 10))
    .join('');
  return `+55519${digits}`;
}

/** Hex aleatório (do `rand` do contexto) com `bytes` bytes. */
function randomHex(rand: () => number, bytes: number): string {
  let out = '';
  while (out.length < bytes * 2) {
    out += Math.floor(rand() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out.slice(0, bytes * 2);
}

/**
 * Fábrica de tokens: cada chamada devolve um token novo (hex de 32 bytes).
 * Mesmo com um `rand` constante, os tokens não se repetem — o próximo é
 * derivado do anterior.
 */
function tokenFactory(rand: () => number): () => string {
  let previous = '';
  let counter = 0;
  return () => {
    counter += 1;
    previous = counter === 1 ? randomHex(rand, 32) : hashHex(`${previous}:${counter}`, 32);
    return previous;
  };
}

/** Data/hora local de São Paulo (UTC-3) de `now`, com N dias à frente. */
function localMoment(now: Date, daysAhead: number, hour: number, minute: number): Date {
  const local = new Date(now.getTime() + SAO_PAULO_OFFSET_MIN * 60_000 + daysAhead * 86_400_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour + SAO_PAULO_OFFSET_MIN / 60, minute),
  );
}

/** Dia da semana (0=domingo) de `now` + N dias, no fuso de São Paulo. */
function localWeekday(now: Date, daysAhead: number): number {
  const local = new Date(now.getTime() + SAO_PAULO_OFFSET_MIN * 60_000 + daysAhead * 86_400_000);
  return local.getUTCDay();
}

/** Próximo dia útil (seg-sex) a partir de `minDays` dias à frente. */
function nextWeekday(now: Date, minDays: number): number {
  for (let offset = minDays; offset < minDays + 14; offset += 1) {
    const weekday = localWeekday(now, offset);
    if (weekday >= 1 && weekday <= 5) return offset;
  }
  return minDays;
}

/** Dia útil (seg-sex) de `daysBack` dias atrás — para o histórico. */
function previousWeekday(now: Date, daysBack: number): number {
  for (let offset = -daysBack; offset > -daysBack - 14; offset -= 1) {
    const weekday = localWeekday(now, offset);
    if (weekday >= 1 && weekday <= 5) return offset;
  }
  return -daysBack;
}

/** Primeiro lead com uma das etapas pedidas; senão, o primeiro da lista. */
function pickLead(ctx: AgendaDemoCtx, stages: string[], used: Set<string>): DemoLead | null {
  // Ordem estável: sem isso a escolha mudaria entre execuções e o seed criaria
  // reservas novas toda vez (o banco bloqueia horário duplicado).
  const leads = [...ctx.leads].sort((a, b) => a.id.localeCompare(b.id));
  for (const stage of stages) {
    const found = leads.find((lead) => lead.stage === stage && !used.has(lead.id));
    if (found) return found;
  }
  const fallback = leads.find((lead) => !used.has(lead.id));
  return fallback ?? null;
}

// ------------------------------------------------------------ tipos de reunião

async function ensureEventType(
  db: DB,
  orgId: string,
  userId: string,
  seed: EventTypeSeed,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: schema.agendaEventTypes.id })
    .from(schema.agendaEventTypes)
    .where(and(eq(schema.agendaEventTypes.orgId, orgId), eq(schema.agendaEventTypes.slug, seed.slug)))
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [created] = await db
    .insert(schema.agendaEventTypes)
    .values({
      orgId,
      userId,
      title: seed.title,
      slug: seed.slug,
      description: seed.description,
      durationMin: seed.durationMin,
      slotIntervalMin: seed.slotIntervalMin,
      minNoticeMin: seed.minNoticeMin,
      bufferMin: seed.bufferMin,
      timezone: TIMEZONE,
      location: seed.location,
      requiresConfirmation: seed.requiresConfirmation,
      isActive: true,
      reminderMinutesBefore: 60,
      notifySeller: true,
      sendInvite: true,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return { id: created.id, created: true };

  const [again] = await db
    .select({ id: schema.agendaEventTypes.id })
    .from(schema.agendaEventTypes)
    .where(and(eq(schema.agendaEventTypes.orgId, orgId), eq(schema.agendaEventTypes.slug, seed.slug)))
    .limit(1);
  if (!again) throw new Error('Demo: não foi possível criar o tipo de reunião.');
  return { id: again.id, created: false };
}

/** Janelas de disponibilidade do tipo — só entra se ele ainda não tem nenhuma. */
async function ensureAvailability(db: DB, orgId: string, eventTypeId: string): Promise<void> {
  const [existing] = await db
    .select({ id: schema.agendaAvailability.id })
    .from(schema.agendaAvailability)
    .where(eq(schema.agendaAvailability.eventTypeId, eventTypeId))
    .limit(1);
  if (existing) return;
  await db
    .insert(schema.agendaAvailability)
    .values(AVAILABILITY.map((window) => ({ orgId, eventTypeId, ...window })))
    .onConflictDoNothing();
}

// ------------------------------------------------------------------- links

type LinkPlan = { eventTypeId: string; leadId: string | null; channel: string };

async function ensureLink(
  db: DB,
  orgId: string,
  plan: LinkPlan,
  makeToken: () => string,
): Promise<{ id: string; token: string }> {
  const conditions = [
    eq(schema.agendaLinks.orgId, orgId),
    eq(schema.agendaLinks.eventTypeId, plan.eventTypeId),
    eq(schema.agendaLinks.channel, plan.channel),
  ];
  conditions.push(plan.leadId ? eq(schema.agendaLinks.leadId, plan.leadId) : isNull(schema.agendaLinks.leadId));

  const [existing] = await db
    .select({ id: schema.agendaLinks.id, token: schema.agendaLinks.token })
    .from(schema.agendaLinks)
    .where(and(...conditions))
    .limit(1);
  if (existing) return { id: existing.id, token: existing.token };

  // Token único (índice `agenda_links_token_uq`): se colidir, outro é sorteado.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const token = makeToken();
    const [created] = await db
      .insert(schema.agendaLinks)
      .values({ orgId, eventTypeId: plan.eventTypeId, leadId: plan.leadId, token, channel: plan.channel })
      .onConflictDoNothing()
      .returning();
    if (created) return { id: created.id, token: created.token };

    const [byToken] = await db
      .select({ id: schema.agendaLinks.id, token: schema.agendaLinks.token })
      .from(schema.agendaLinks)
      .where(eq(schema.agendaLinks.token, token))
      .limit(1);
    if (byToken) continue; // o token já existe: sorteia outro

    // Não foi o token: a chave natural já existe (corrida) — reaproveita.
    const [byKey] = await db
      .select({ id: schema.agendaLinks.id, token: schema.agendaLinks.token })
      .from(schema.agendaLinks)
      .where(and(...conditions))
      .limit(1);
    if (byKey) return { id: byKey.id, token: byKey.token };
  }
  throw new Error('Demo: não foi possível criar o link de agendamento.');
}

// ---------------------------------------------------------------- reservas

type MeetingPlan = {
  lead: DemoLead | null;
  eventTypeId: string;
  eventSlug: string;
  durationMin: number;
  location: string;
  status: 'confirmed' | 'requested' | 'cancelled';
  source: 'agenda' | 'harvey' | 'manual';
  linkId: string | null;
  linkToken: string | null;
  scheduledAt: Date;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  note: string;
  notes: string;
};

async function ensureMeeting(
  db: DB,
  orgId: string,
  userId: string,
  plan: MeetingPlan,
  cancelToken: string,
): Promise<{ id: string }> {
  const attendeeName = plan.lead?.fullName ?? 'Participante da demonstração';
  const attendeeEmail = plan.lead ? fakeEmail(plan.lead.fullName) : `participante-${plan.status}@demo.invalid`;

  // Chave idempotente: o e-mail do participante identifica a reserva.
  const [existing] = await db
    .select({ id: schema.meetings.id })
    .from(schema.meetings)
    .where(and(eq(schema.meetings.orgId, orgId), eq(schema.meetings.attendeeEmail, attendeeEmail)))
    .limit(1);
  if (existing) return { id: existing.id };

  const [created] = await db
    .insert(schema.meetings)
    .values({
      orgId,
      userId,
      leadId: plan.lead?.id ?? null,
      status: plan.status,
      source: plan.source,
      schedulerUrl: plan.linkToken ? `${AGENDA_BASE_URL}/agendamento/${plan.eventSlug}?token=${plan.linkToken}` : null,
      scheduledAt: plan.scheduledAt,
      note: plan.note,
      eventTypeId: plan.eventTypeId,
      linkId: plan.linkId,
      attendeeName,
      attendeeEmail,
      attendeePhone: plan.lead ? fakePhone(plan.lead.id) : null,
      endTime: new Date(plan.scheduledAt.getTime() + plan.durationMin * 60_000),
      timezone: TIMEZONE,
      location: plan.location,
      cancelToken,
      notes: plan.notes,
      confirmedAt: plan.confirmedAt,
      cancelledAt: plan.cancelledAt,
      // Convite e lembrete já saíram: nada de reenviar aviso para a demonstração.
      reminderSentAt: plan.confirmedAt ?? plan.createdAt,
      inviteState: 'sent',
      inviteSentAt: plan.confirmedAt ?? plan.createdAt,
      sellerNotifiedAt: plan.confirmedAt ?? plan.createdAt,
      createdAt: plan.createdAt,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return { id: created.id };

  const [again] = await db
    .select({ id: schema.meetings.id })
    .from(schema.meetings)
    .where(and(eq(schema.meetings.orgId, orgId), eq(schema.meetings.attendeeEmail, attendeeEmail)))
    .limit(1);
  if (again) return { id: again.id };
  // O horario pode ja estar reservado por outra reserva da demo (o banco bloqueia
  // horario duplicado). Nao e falha: reaproveita a reserva que ocupa o horario.
  const [mesmoHorario] = await db
    .select({ id: schema.meetings.id })
    .from(schema.meetings)
    .where(and(eq(schema.meetings.orgId, orgId), eq(schema.meetings.scheduledAt, plan.scheduledAt)))
    .limit(1);
  if (mesmoHorario) return { id: mesmoHorario.id };
  if (plan.lead) {
    const [byLead] = await db
      .select({ id: schema.meetings.id })
      .from(schema.meetings)
      .where(
        and(
          eq(schema.meetings.orgId, orgId),
          eq(schema.meetings.leadId, plan.lead.id),
          eq(schema.meetings.status, plan.status),
        ),
      )
      .limit(1);
    if (byLead) return { id: byLead.id };
  }
  throw new Error('Demo: não foi possível criar a reserva.');
}

// ------------------------------------------------------------------ seed

/**
 * Semeia a agenda nativa da demonstração: tipos de reunião, disponibilidade
 * semanal, links rastreados, reservas (confirmada, aguardando aprovação e
 * cancelada) e um bloqueio de agenda.
 *
 * Idempotente: pode rodar em uma org já povoada sem duplicar nada.
 */
export async function seedAgenda(db: DB, ctx: AgendaDemoCtx): Promise<AgendaSeedResult> {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const rand = typeof ctx.rand === 'function' ? ctx.rand : () => 0.5;
  const makeToken = tokenFactory(rand);
  const orgId = ctx.orgId;
  const userId = ctx.userId;

  // 1) Tipos de reunião + disponibilidade semanal.
  const eventTypeRows: Array<{ id: string; slug: string; title: string }> = [];
  const eventTypeBySlug = new Map<string, { id: string; durationMin: number; location: string }>();
  for (const seed of EVENT_TYPES) {
    const { id } = await ensureEventType(db, orgId, userId, seed);
    await ensureAvailability(db, orgId, id);
    eventTypeRows.push({ id, slug: seed.slug, title: seed.title });
    eventTypeBySlug.set(seed.slug, { id, durationMin: seed.durationMin, location: seed.location });
  }

  // 2) Leads da demo (a reserva sempre é de alguém do CRM).
  const used = new Set<string>();
  const leadConfirmado = pickLead(ctx, ['meeting', 'replied', 'connected'], used);
  if (leadConfirmado) used.add(leadConfirmado.id);
  const leadAguardando = pickLead(ctx, ['replied', 'connected', 'invited'], used);
  if (leadAguardando) used.add(leadAguardando.id);
  const leadCancelado = pickLead(ctx, ['connected', 'invited', 'new'], used);
  if (leadCancelado) used.add(leadCancelado.id);

  // 3) Links rastreados: um com lead (enviado no WhatsApp) e um genérico.
  const diagnostico = eventTypeBySlug.get('diagnostico-tributario');
  const fechamento = eventTypeBySlug.get('reuniao-fechamento');
  if (!diagnostico || !fechamento) throw new Error('Demo: tipos de reunião ausentes.');

  const linkLead = await ensureLink(
    db,
    orgId,
    { eventTypeId: diagnostico.id, leadId: leadConfirmado?.id ?? null, channel: 'whatsapp' },
    makeToken,
  );
  const linkGenerico = await ensureLink(
    db,
    orgId,
    { eventTypeId: fechamento.id, leadId: null, channel: 'link' },
    makeToken,
  );

  // 4) Reservas: confirmada, aguardando aprovação e cancelada.
  const offsetConfirmado = nextWeekday(now, 2);
  const offsetAguardando = nextWeekday(now, Math.max(4, offsetConfirmado + 1));
  const offsetCancelado = previousWeekday(now, 3);

  const reservaConfirmada = await ensureMeeting(
    db,
    orgId,
    userId,
    {
      lead: leadConfirmado,
      eventTypeId: diagnostico.id,
      eventSlug: 'diagnostico-tributario',
      durationMin: diagnostico.durationMin,
      location: diagnostico.location,
      status: 'confirmed',
      source: 'agenda',
      linkId: linkLead.id,
      linkToken: linkLead.token,
      scheduledAt: localMoment(now, offsetConfirmado, 10, 0),
      createdAt: new Date(now.getTime() - 2 * 86_400_000),
      confirmedAt: new Date(now.getTime() - 2 * 86_400_000),
      cancelledAt: null,
      note: 'Reserva confirmada pelo link enviado no WhatsApp.',
      notes: 'Foco: crédito de PIS/COFINS sobre insumos importados e o ICMS na entrada.',
    },
    makeToken(),
  );

  const reservaAguardando = await ensureMeeting(
    db,
    orgId,
    userId,
    {
      lead: leadAguardando,
      eventTypeId: fechamento.id,
      eventSlug: 'reuniao-fechamento',
      durationMin: fechamento.durationMin,
      location: fechamento.location,
      status: 'requested',
      source: 'harvey',
      linkId: null,
      linkToken: null,
      scheduledAt: localMoment(now, offsetAguardando, 15, 0),
      createdAt: new Date(now.getTime() - 86_400_000),
      confirmedAt: null,
      cancelledAt: null,
      note: 'Pedido registrado pela assistente comercial; o tipo de reunião exige aprovação do vendedor.',
      notes: 'Cliente pediu para revisar a proposta de compensação junto com o sócio.',
    },
    makeToken(),
  );

  const reservaCancelada = await ensureMeeting(
    db,
    orgId,
    userId,
    {
      lead: leadCancelado,
      eventTypeId: diagnostico.id,
      eventSlug: 'diagnostico-tributario',
      durationMin: diagnostico.durationMin,
      location: diagnostico.location,
      status: 'cancelled',
      source: 'manual',
      linkId: null,
      linkToken: null,
      scheduledAt: localMoment(now, offsetCancelado, 16, 0),
      createdAt: new Date(now.getTime() - 5 * 86_400_000),
      confirmedAt: new Date(now.getTime() - 4 * 86_400_000),
      cancelledAt: new Date(now.getTime() - 2 * 86_400_000),
      note: 'Reserva registrada no app e cancelada pelo vendedor.',
      notes: 'Cliente pediu para remarcar depois da encerramento contábil.',
    },
    makeToken(),
  );

  // O link do WhatsApp foi usado pela reserva confirmada.
  await db
    .update(schema.agendaLinks)
    .set({ usedAt: new Date(now.getTime() - 2 * 86_400_000) })
    .where(and(eq(schema.agendaLinks.id, linkLead.id), isNull(schema.agendaLinks.usedAt)));

  // 5) Bloqueio de agenda: congresso do contador, dentro do próximo mês.
  let blackoutId: string;
  const [blackoutExistente] = await db
    .select({ id: schema.agendaBlackouts.id })
    .from(schema.agendaBlackouts)
    .where(and(eq(schema.agendaBlackouts.orgId, orgId), eq(schema.agendaBlackouts.reason, BLACKOUT_REASON)))
    .limit(1);
  if (blackoutExistente) {
    blackoutId = blackoutExistente.id;
  } else {
    const [blackout] = await db
      .insert(schema.agendaBlackouts)
      .values({
        orgId,
        startAt: localMoment(now, 9, 13, 0),
        endAt: localMoment(now, 9, 18, 0),
        reason: BLACKOUT_REASON,
      })
      .onConflictDoNothing()
      .returning();
    if (blackout) {
      blackoutId = blackout.id;
    } else {
      const [again] = await db
        .select({ id: schema.agendaBlackouts.id })
        .from(schema.agendaBlackouts)
        .where(and(eq(schema.agendaBlackouts.orgId, orgId), eq(schema.agendaBlackouts.reason, BLACKOUT_REASON)))
        .limit(1);
      if (!again) throw new Error('Demo: não foi possível criar o bloqueio de agenda.');
      blackoutId = again.id;
    }
  }

  return {
    eventTypes: eventTypeRows,
    links: [
      { id: linkLead.id, token: linkLead.token, channel: 'whatsapp', leadId: leadConfirmado?.id ?? null },
      { id: linkGenerico.id, token: linkGenerico.token, channel: 'link', leadId: null },
    ],
    meetings: [
      { id: reservaConfirmada.id, status: 'confirmed', leadId: leadConfirmado?.id ?? null },
      { id: reservaAguardando.id, status: 'requested', leadId: leadAguardando?.id ?? null },
      { id: reservaCancelada.id, status: 'cancelled', leadId: leadCancelado?.id ?? null },
    ],
    blackouts: [{ id: blackoutId, reason: BLACKOUT_REASON }],
  };
}

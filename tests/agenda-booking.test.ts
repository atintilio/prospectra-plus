import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema, type DB } from '@/db';
import type { AgendaSlot } from '@/lib/agenda-slots';
import {
  AGENDA_PUBLIC_URL,
  bookPublic,
  cancelPublic,
  createEventType,
  createLink,
  getEventTypeBySlug,
  listAvailability,
  listBookings,
  listEventTypes,
  listPublicEvent,
  listPublicSlots,
  setAvailability,
  updateEventType,
} from '@/lib/agenda-booking';

/** Janela padrão: todos os dias, das 9h às 18h (horário de São Paulo). */
const FULL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startMinute: 9 * 60, endMinute: 18 * 60 }));

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Agenda');
  const scope = { orgId: org.id, userId: user.id };
  const eventType = await createEventType(db, scope, {
    title: 'Reunião de Vendas',
    durationMin: 30,
    slotIntervalMin: 30,
    minNoticeMin: 0,
    timezone: 'America/Sao_Paulo',
    location: 'https://meet.exemplo.com/abc',
    availability: FULL_WEEK,
  });
  return { db, org, user, scope, eventType };
}

function firstSlot(result: Awaited<ReturnType<typeof listPublicSlots>>): AgendaSlot {
  if (!result.ok) throw new Error(result.error);
  const slot = result.slots[0];
  if (!slot) throw new Error('A agenda não devolveu horários livres.');
  return slot;
}

/** Momento fora de qualquer janela de disponibilidade (a agenda abre das 9h às 18h). */
function unavailableMoment(slot: AgendaSlot): Date {
  return new Date(new Date(slot.startIso).getTime() + 12 * 60 * 60 * 1000);
}

/** Token público de cancelamento da reserva (sempre presente nas reservas da agenda). */
function cancelTokenOf(meeting: { cancelToken: string | null }): string {
  if (!meeting.cancelToken) throw new Error('A reserva não tem token de cancelamento.');
  return meeting.cancelToken;
}

describe('agenda nativa — reservas', () => {
  it('cria a reserva com status confirmado, origem agenda e link de cancelamento', async () => {
    const { db, scope, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));

    const result = await bookPublic(db, {
      slug: eventType.slug,
      start: new Date(slot.startIso),
      attendeeName: 'Maria Souza',
      attendeeEmail: 'maria@exemplo.com',
      attendeePhone: '+5511999999999',
      notes: 'Quer falar sobre o plano enterprise.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meeting.status).toBe('confirmed');
    expect(result.meeting.source).toBe('agenda');
    expect(result.meeting.attendeeName).toBe('Maria Souza');
    expect(result.meeting.attendeeEmail).toBe('maria@exemplo.com');
    expect(result.meeting.orgId).toBe(scope.orgId);
    expect(result.meeting.userId).toBe(scope.userId);
    expect(result.meeting.eventTypeId).toBe(eventType.id);
    expect(result.meeting.scheduledAt?.toISOString()).toBe(slot.startIso);
    expect(result.meeting.endTime).toBeInstanceOf(Date);
    expect(result.meeting.cancelToken).toBeTruthy();
    expect(result.meeting.confirmedAt).toBeInstanceOf(Date);
    expect(result.cancelUrl).toBe(`${AGENDA_PUBLIC_URL}/agendamento/cancelar?token=${result.meeting.cancelToken}`);

    const [stored] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, result.meeting.id));
    expect(stored.status).toBe('confirmed');
    expect(stored.leadId).toBeNull();
  });

  it('reserva sem e-mail não quebra', async () => {
    const { db, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    const result = await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'Visitante' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meeting.attendeeEmail).toBeNull();
  });

  it('bloqueia horário indisponível', async () => {
    const { db, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));

    const result = await bookPublic(db, {
      slug: eventType.slug,
      start: unavailableMoment(slot),
      attendeeName: 'Maria Souza',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('slot_taken');
  });

  it('bloqueia horário que já passou', async () => {
    const { db, eventType } = await setup();
    const result = await bookPublic(db, {
      slug: eventType.slug,
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      attendeeName: 'Maria Souza',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('past');
  });

  it('bloqueia reserva dupla no mesmo horário', async () => {
    const { db, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));

    const first = await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'Maria' });
    expect(first.ok).toBe(true);

    const second = await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'João' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('slot_taken');

    const booked = await db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.orgId, eventType.orgId), eq(schema.meetings.scheduledAt, new Date(slot.startIso))));
    expect(booked).toHaveLength(1);
  });

  it('nunca deixa duas reservas no mesmo horário mesmo em concorrência', async () => {
    const { db, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));

    const results = await Promise.allSettled([
      bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'Maria' }),
      bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'João' }),
    ]);

    const ok = results.filter((result) => result.status === 'fulfilled' && result.value.ok);
    expect(ok.length).toBeLessThanOrEqual(1);
    for (const result of results) {
      if (result.status === 'rejected') continue;
      if (result.value.ok) continue;
      expect(result.value.code).toBe('slot_taken');
    }

    const booked = await db
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.orgId, eventType.orgId), eq(schema.meetings.scheduledAt, new Date(slot.startIso))));
    expect(booked).toHaveLength(1);
  });

  it('respeita requiresConfirmation e deixa a reserva como requested', async () => {
    const { db, scope, eventType } = await setup();
    const review = await createEventType(db, scope, {
      title: 'Reunião de Demo',
      minNoticeMin: 0,
      requiresConfirmation: true,
      availability: FULL_WEEK,
    });
    const slot = firstSlot(await listPublicSlots(db, review.slug));

    const result = await bookPublic(db, { slug: review.slug, start: new Date(slot.startIso), attendeeName: 'Maria' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meeting.status).toBe('requested');
    expect(result.meeting.confirmedAt).toBeNull();
    expect(result.meeting.eventTypeId).toBe(review.id);
    expect(eventType.slug).not.toBe(review.slug);
  });

  it('cancela por token e recusa cancelamento repetido ou token inválido', async () => {
    const { db, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    const booked = await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'Maria' });
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;

    const cancelled = await cancelPublic(db, { cancelToken: cancelTokenOf(booked.meeting) });
    expect(cancelled.ok).toBe(true);

    const [stored] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, booked.meeting.id));
    expect(stored.status).toBe('cancelled');
    expect(stored.cancelledAt).toBeInstanceOf(Date);

    const again = await cancelPublic(db, { cancelToken: cancelTokenOf(booked.meeting) });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error).toMatch(/já foi cancelada/i);

    const invalid = await cancelPublic(db, { cancelToken: 'token-que-nao-existe' });
    expect(invalid.ok).toBe(false);
  });

  it('libera o horário depois do cancelamento', async () => {
    const { db, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    const booked = await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'Maria' });
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;
    await cancelPublic(db, { cancelToken: cancelTokenOf(booked.meeting) });

    const again = await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'João' });
    expect(again.ok).toBe(true);
  });
});

describe('agenda nativa — link rastreado', () => {
  it('vincula o lead do link e marca o link como usado', async () => {
    const { db, scope, eventType } = await setup();
    const [lead] = await db
      .insert(schema.leads)
      .values({ orgId: scope.orgId, linkedinUrl: 'https://linkedin.com/in/maria', fullName: 'Maria Souza' })
      .returning();

    const link = await createLink(db, scope, eventType.id, { leadId: lead.id, channel: 'whatsapp' });
    expect(link.token).toBeTruthy();
    expect(link.url).toBe(`${AGENDA_PUBLIC_URL}/agendamento/${eventType.slug}?token=${link.token}`);

    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    const result = await bookPublic(db, {
      slug: eventType.slug,
      token: link.token,
      start: new Date(slot.startIso),
      attendeeName: 'Maria Souza',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meeting.leadId).toBe(lead.id);
    expect(result.meeting.linkId).toBeTruthy();

    const [storedLink] = await db.select().from(schema.agendaLinks).where(eq(schema.agendaLinks.token, link.token));
    expect(storedLink.usedAt).toBeInstanceOf(Date);
    expect(storedLink.leadId).toBe(lead.id);
  });

  it('recusa token desconhecido', async () => {
    const { db, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    const result = await bookPublic(db, {
      slug: eventType.slug,
      token: 'token-que-nao-existe',
      start: new Date(slot.startIso),
      attendeeName: 'Maria',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid');
  });

  it('recusa a reserva quando o lead já tem uma reunião em aberto', async () => {
    const { db, scope, eventType } = await setup();
    const [lead] = await db
      .insert(schema.leads)
      .values({ orgId: scope.orgId, linkedinUrl: 'https://linkedin.com/in/maria', fullName: 'Maria Souza' })
      .returning();
    await db.insert(schema.meetings).values({
      orgId: scope.orgId,
      userId: scope.userId,
      leadId: lead.id,
      status: 'requested',
      source: 'harvey',
    });
    const link = await createLink(db, scope, eventType.id, { leadId: lead.id });

    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    const result = await bookPublic(db, {
      slug: eventType.slug,
      token: link.token,
      start: new Date(slot.startIso),
      attendeeName: 'Maria Souza',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid');
    expect(result.error).toMatch(/reunião em aberto/i);
  });

  it('agenda com requiresConfirmation e agenda_links', async () => {
    const { db, scope } = await setup();
    const review = await createEventType(db, scope, {
      title: 'Reunião de Demo',
      minNoticeMin: 0,
      requiresConfirmation: true,
      availability: FULL_WEEK,
    });
    const [lead] = await db
      .insert(schema.leads)
      .values({ orgId: scope.orgId, linkedinUrl: 'https://linkedin.com/in/joao', fullName: 'João Lima' })
      .returning();
    const link = await createLink(db, scope, review.id, { leadId: lead.id, channel: 'email' });

    const slot = firstSlot(await listPublicSlots(db, review.slug));
    const result = await bookPublic(db, {
      slug: review.slug,
      token: link.token,
      start: new Date(slot.startIso),
      attendeeName: 'João Lima',
      attendeeEmail: 'joao@exemplo.com',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.meeting.status).toBe('requested');
    expect(result.meeting.leadId).toBe(lead.id);
    expect(result.meeting.linkId).toBeTruthy();
    expect(result.meeting.source).toBe('agenda');
  });
});

describe('agenda nativa — tipos de reunião e isolamento por operação', () => {
  it('gera slug sem acento e com sufixo numérico quando o slug já existe', async () => {
    const { db, scope, eventType } = await setup();
    expect(eventType.slug).toBe('reuniao-de-vendas');

    const second = await createEventType(db, scope, { title: 'Reunião de Vendas' });
    expect(second.slug).toBe('reuniao-de-vendas-2');

    const third = await createEventType(db, scope, { title: 'Reunião de Vendas' });
    expect(third.slug).toBe('reuniao-de-vendas-3');

    const found = await getEventTypeBySlug(db, scope, 'reuniao-de-vendas');
    expect(found?.id).toBe(eventType.id);
  });

  it('lista, edita e salva a disponibilidade do tipo de reunião', async () => {
    const { db, scope, eventType } = await setup();
    const list = await listEventTypes(db, scope);
    expect(list.map((row) => row.id)).toContain(eventType.id);

    const updated = await updateEventType(db, scope, eventType.id, { durationMin: 45, requiresConfirmation: true });
    expect(updated.durationMin).toBe(45);
    expect(updated.requiresConfirmation).toBe(true);

    await setAvailability(db, scope, eventType.id, [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }]);
    const availability = await listAvailability(db, scope, eventType.id);
    expect(availability).toEqual([{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }]);
  });

  it('não vaza reservas de outra operação', async () => {
    const { db, scope, eventType } = await setup();
    const other = await seedOrg(db, 'Parceiro B');
    const otherScope = { orgId: other.org.id, userId: other.user.id };
    const otherEvent = await createEventType(db, otherScope, {
      title: 'Reunião do Parceiro',
      slug: 'reuniao-do-parceiro',
      minNoticeMin: 0,
      availability: FULL_WEEK,
    });

    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    const mine = await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'Maria' });
    expect(mine.ok).toBe(true);

    // A outra operação tem o mesmo horário livre: não é bloqueada pela reserva alheia.
    const theirsSlot = firstSlot(await listPublicSlots(db, otherEvent.slug));
    const theirs = await bookPublic(db, {
      slug: otherEvent.slug,
      start: new Date(theirsSlot.startIso),
      attendeeName: 'Visitante',
    });
    expect(theirs.ok).toBe(true);

    // E a operação original não enxerga a reserva de fora.
    const bookings = await listBookings(db, scope);
    expect(bookings.every((booking) => booking.orgId === scope.orgId)).toBe(true);
    expect(bookings).toHaveLength(1);
  });

  it('responde os dados públicos do evento e recusa slug inexistente', async () => {
    const { db, eventType } = await setup();
    const publicEvent = await listPublicEvent(db, eventType.slug);
    expect(publicEvent.ok).toBe(true);
    if (!publicEvent.ok) return;
    expect(publicEvent.eventType.title).toBe('Reunião de Vendas');
    expect(publicEvent.eventType.durationMin).toBe(30);
    expect(publicEvent.eventType.requiresConfirmation).toBe(false);
    expect(publicEvent.eventType.hostName).toBeTruthy();

    const missing = await listPublicEvent(db, 'slug-que-nao-existe');
    expect(missing.ok).toBe(false);

    const missingSlots = await listPublicSlots(db, 'slug-que-nao-existe');
    expect(missingSlots.ok).toBe(false);
  });

  it('não oferece o horário já reservado', async () => {
    const { db, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'Maria' });

    const after = await listPublicSlots(db, eventType.slug);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.slots.some((item) => item.startIso === slot.startIso)).toBe(false);
  });

  it('não devolve reserva de outra operação na listagem por período', async () => {
    const { db, scope, eventType } = await setup();
    const slot = firstSlot(await listPublicSlots(db, eventType.slug));
    await bookPublic(db, { slug: eventType.slug, start: new Date(slot.startIso), attendeeName: 'Maria' });

    const bookings = await listBookings(db, scope, { from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 30 * 24 * 3600_000) });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe('confirmed');

    const cancelled = await listBookings(db, scope, { includeCancelled: false });
    expect(cancelled).toHaveLength(1);
  });
});

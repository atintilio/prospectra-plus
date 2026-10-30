import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema } from '@/db';

/** Mailer mockado: os testes nunca tocam o Microsoft Graph. */
const mailer = vi.hoisted(() => ({
  sendCalendarInvite: vi.fn<(to: string[], subject: string, text: string, ics: string) => Promise<void>>(),
  sendSupportMail: vi.fn<(to: string[], subject: string, text: string) => Promise<void>>(),
}));

vi.mock('@/lib/mailer', () => mailer);

import { notifyBooking, type BookingNotifyInput } from '@/lib/agenda-notify';
import { bookPublic, createEventType, listPublicSlots } from '@/lib/agenda-booking';

/** 12/11/2026 às 14:00 (horário de São Paulo). */
const START = new Date('2026-11-12T17:00:00.000Z');

const FULL_WEEK = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startMinute: 9 * 60, endMinute: 18 * 60 }));

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Notificacoes');
  const [meeting] = await db
    .insert(schema.meetings)
    .values({
      orgId: org.id,
      userId: user.id,
      status: 'confirmed',
      source: 'agenda',
      scheduledAt: START,
      endTime: new Date(START.getTime() + 30 * 60_000),
      attendeeName: 'Maria Souza',
      attendeeEmail: 'maria@exemplo.com',
      attendeePhone: '5511999999999',
      timezone: 'America/Sao_Paulo',
      location: 'https://meet.exemplo.com/abc',
    })
    .returning();
  return { db, org, user, meeting };
}

function baseInput(
  meeting: { id: string },
  org: { id: string },
  overrides: Partial<BookingNotifyInput> = {},
): BookingNotifyInput {
  return {
    meetingId: meeting.id,
    orgId: org.id,
    sellerEmail: 'vendedor@exemplo.com',
    sellerName: 'Ana Vendedora',
    attendeeName: 'Maria Souza',
    attendeeEmail: 'maria@exemplo.com',
    attendeePhone: '5511999999999',
    start: START,
    durationMin: 30,
    timezone: 'America/Sao_Paulo',
    location: 'https://meet.exemplo.com/abc',
    cancelUrl: 'https://agenda.exemplo.com/agendamento/cancelar?token=abc',
    ...overrides,
  };
}

async function storedMeeting(db: Awaited<ReturnType<typeof testDb>>, meetingId: string) {
  const [row] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meetingId));
  return row;
}

beforeEach(() => {
  mailer.sendCalendarInvite.mockReset();
  mailer.sendSupportMail.mockReset();
  mailer.sendCalendarInvite.mockResolvedValue(undefined);
  mailer.sendSupportMail.mockResolvedValue(undefined);
});

describe('agenda — notificação da reserva', () => {
  it('envia o convite .ics para o participante e o vendedor e grava inviteState/inviteSentAt', async () => {
    const { db, org, meeting } = await setup();

    const result = await notifyBooking(db, baseInput(meeting, org));

    expect(result.invite).toBe('sent');
    expect(result.seller).toBe('sent');
    expect(result.attendee).toBe('not_required'); // sem WhatsApp injetado

    expect(mailer.sendCalendarInvite).toHaveBeenCalledTimes(1);
    const [to, subject, body, ics] = mailer.sendCalendarInvite.mock.calls[0];
    expect(to).toEqual(['maria@exemplo.com', 'vendedor@exemplo.com']);
    expect(subject).toBe('Reunião Prospectra com Maria Souza');
    expect(body).toContain('14:00');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain(`UID:${meeting.id}`);
    expect(ics).toContain('ORGANIZER:mailto:vendedor@exemplo.com');

    const row = await storedMeeting(db, meeting.id);
    expect(row.inviteState).toBe('sent');
    expect(row.inviteSentAt).toBeInstanceOf(Date);
    expect(row.sellerNotifiedAt).toBeInstanceOf(Date);
  });

  it('sem e-mail do participante devolve missing_email e não envia nada', async () => {
    const { db, org, meeting } = await setup();

    const result = await notifyBooking(db, baseInput(meeting, org, { attendeeEmail: null }));

    expect(result.invite).toBe('missing_email');
    expect(mailer.sendCalendarInvite).not.toHaveBeenCalled();

    const row = await storedMeeting(db, meeting.id);
    expect(row.inviteState).toBe('missing_email');
    expect(row.inviteSentAt).toBeNull();
  });

  it('sendInvite=false devolve not_required e não envia o convite', async () => {
    const { db, org, meeting } = await setup();

    const result = await notifyBooking(db, baseInput(meeting, org, { sendInvite: false }));

    expect(result.invite).toBe('not_required');
    expect(mailer.sendCalendarInvite).not.toHaveBeenCalled();

    const row = await storedMeeting(db, meeting.id);
    expect(row.inviteState).toBe('not_required');
    expect(row.inviteSentAt).toBeNull();
  });

  it('falha do mailer devolve unknown, grava o estado e a reserva continua', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Notificacoes');
    const scope = { orgId: org.id, userId: user.id };
    const eventType = await createEventType(db, scope, {
      title: 'Reunião de Vendas',
      minNoticeMin: 0,
      availability: FULL_WEEK,
    });
    const slots = await listPublicSlots(db, eventType.slug);
    if (!slots.ok) throw new Error(slots.error);
    const slot = slots.slots[0];
    if (!slot) throw new Error('A agenda não devolveu horários livres.');

    mailer.sendCalendarInvite.mockRejectedValue(new Error('OFFICE365_SEND_FAILED_500'));
    mailer.sendSupportMail.mockRejectedValue(new Error('OFFICE365_SEND_FAILED_500'));

    const booked = await bookPublic(db, {
      slug: eventType.slug,
      start: new Date(slot.startIso),
      attendeeName: 'Maria Souza',
      attendeeEmail: 'maria@exemplo.com',
    });

    // A reserva vale mesmo com a notificação quebrada.
    expect(booked.ok).toBe(true);
    if (!booked.ok) return;

    const row = await storedMeeting(db, booked.meeting.id);
    expect(row.inviteState).toBe('unknown');
    expect(row.inviteSentAt).toBeNull();
    expect(row.sellerNotifiedAt).toBeNull();
    expect(row.status).toBe('confirmed');
  });

  it('avisa o vendedor por e-mail e grava sellerNotifiedAt', async () => {
    const { db, org, meeting } = await setup();

    const result = await notifyBooking(db, baseInput(meeting, org));

    expect(result.seller).toBe('sent');
    expect(mailer.sendSupportMail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = mailer.sendSupportMail.mock.calls[0];
    expect(to).toEqual(['vendedor@exemplo.com']);
    expect(subject).toContain('Maria Souza');
    expect(body).toContain('Maria Souza');
    expect(body).toContain('14:00');

    const row = await storedMeeting(db, meeting.id);
    expect(row.sellerNotifiedAt).toBeInstanceOf(Date);
  });

  it('notifySeller=false não avisa o vendedor', async () => {
    const { db, org, meeting } = await setup();

    const result = await notifyBooking(db, baseInput(meeting, org, { notifySeller: false }));

    expect(result.seller).toBe('not_required');
    expect(mailer.sendSupportMail).not.toHaveBeenCalled();

    const row = await storedMeeting(db, meeting.id);
    expect(row.sellerNotifiedAt).toBeNull();
  });

  it('sem e-mail do vendedor devolve missing_email', async () => {
    const { db, org, meeting } = await setup();

    const result = await notifyBooking(db, baseInput(meeting, org, { sellerEmail: '' }));

    expect(result.seller).toBe('missing_email');
    expect(mailer.sendSupportMail).not.toHaveBeenCalled();
  });

  it('manda o WhatsApp do participante com data, hora e fuso', async () => {
    const { db, org, meeting } = await setup();
    const sent: Array<{ recipient: string; text: string }> = [];

    const result = await notifyBooking(
      db,
      baseInput(meeting, org, {
        sendWhatsApp: async (recipient, text) => {
          sent.push({ recipient, text });
        },
      }),
    );

    expect(result.attendee).toBe('sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].recipient).toBe('5511999999999');
    expect(sent[0].text).toContain('12/11/2026');
    expect(sent[0].text).toContain('14:00');
    expect(sent[0].text).toContain('horário de Brasília');
  });

  it('sem telefone do participante devolve missing_phone', async () => {
    const { db, org, meeting } = await setup();
    const sendWhatsApp = vi.fn(async () => undefined);

    const result = await notifyBooking(db, baseInput(meeting, org, { attendeePhone: null, sendWhatsApp }));

    expect(result.attendee).toBe('missing_phone');
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('sem sendWhatsApp o WhatsApp do participante é not_required', async () => {
    const { db, org, meeting } = await setup();

    const result = await notifyBooking(db, baseInput(meeting, org));

    expect(result.attendee).toBe('not_required');
  });

  it('falha no WhatsApp do participante devolve unknown sem derrubar a reserva', async () => {
    const { db, org, meeting } = await setup();

    const result = await notifyBooking(
      db,
      baseInput(meeting, org, {
        sendWhatsApp: async () => {
          throw new Error('WA-AKG indisponível');
        },
      }),
    );

    expect(result.attendee).toBe('unknown');
    expect(result.invite).toBe('sent');

    const row = await storedMeeting(db, meeting.id);
    expect(row.inviteState).toBe('sent');
  });

  it('não reenvia o que já foi enviado (idempotência)', async () => {
    const { db, org, meeting } = await setup();
    const sent: string[] = [];
    const input = baseInput(meeting, org, {
      sendWhatsApp: async (recipient) => {
        sent.push(recipient);
      },
    });

    const first = await notifyBooking(db, input);
    expect(first.invite).toBe('sent');
    expect(first.seller).toBe('sent');
    expect(first.attendee).toBe('sent');

    const afterFirst = await storedMeeting(db, meeting.id);
    const inviteSentAt = afterFirst.inviteSentAt;

    const second = await notifyBooking(db, input);

    expect(second.invite).toBe('sent');
    expect(second.seller).toBe('sent');
    expect(mailer.sendCalendarInvite).toHaveBeenCalledTimes(1);
    expect(mailer.sendSupportMail).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);

    const afterSecond = await storedMeeting(db, meeting.id);
    expect(afterSecond.inviteSentAt?.getTime()).toBe(inviteSentAt?.getTime());
  });
});

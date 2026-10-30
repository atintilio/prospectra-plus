import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import * as schema from '@/db/schema';
import type { DB } from '@/db';
import type { ReminderOutcome } from '@/lib/agenda-reminders';

// O cron é testado sem banco: as outras rotinas e o lembrete são mocks.
const { fakeDb } = vi.hoisted(() => ({ fakeDb: {} as unknown as DB }));

vi.mock('@/db', async () => {
  const actual = await vi.importActual<typeof import('@/db')>('@/db');
  return { ...actual, getDb: vi.fn(async () => fakeDb) };
});
vi.mock('@/lib/cadence', () => ({ runScheduler: vi.fn(async () => ({ processed: 0, created: 0 })) }));
vi.mock('@/lib/harvey-operations', () => ({ runHarveyQueue: vi.fn(async () => ({ processed: 0 })) }));
vi.mock('@/lib/harvey-webhooks', () => ({ resumeHarveyInbound: vi.fn(async () => ({ resumed: 0 })) }));
vi.mock('@/lib/deletion-audit', () => ({ flushDeletionReports: vi.fn(async () => ({ flushed: 0 })) }));
vi.mock('@/lib/communication', () => ({ discoverPendingDisc: vi.fn(async () => ({ processed: 0 })) }));
vi.mock('@/lib/linkedin/automation', () => ({
  runLinkedinQueue: vi.fn(async () => ({ processed: 0 })),
  linkedinAutomationEnabled: vi.fn(() => false),
}));
vi.mock('@/lib/linkedin/http-executor', () => ({ linkedinExecutor: vi.fn(() => null) }));
vi.mock('@/lib/agenda-reminders', () => ({
  sendMeetingReminders: vi.fn(async (): Promise<ReminderOutcome> => ({ processed: 0, sent: 0, skipped: 0, failed: 0 })),
}));

// A implementação real é usada nos testes da lib (o mock acima serve ao cron).
const { sendMeetingReminders } = await vi.importActual<typeof import('@/lib/agenda-reminders')>('@/lib/agenda-reminders');

const NOW = new Date('2026-10-30T12:00:00.000Z');

type Sent = { to: string[]; subject: string; text: string };

function recorder() {
  const emails: Sent[] = [];
  const whats: { recipient: string; text: string }[] = [];
  return {
    emails,
    whats,
    sendEmail: async (to: string[], subject: string, text: string) => {
      emails.push({ to, subject, text });
    },
    sendWhatsApp: async (recipient: string, text: string) => {
      whats.push({ recipient, text });
    },
  };
}

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Agenda');
  const [eventType] = await db
    .insert(schema.agendaEventTypes)
    .values({
      orgId: org.id,
      userId: user.id,
      title: 'Reunião de Vendas',
      slug: 'reuniao-de-vendas',
      durationMin: 30,
      minNoticeMin: 120,
      timezone: 'America/Sao_Paulo',
      reminderMinutesBefore: 60,
    })
    .returning();

  async function createMeeting(overrides: Partial<typeof schema.meetings.$inferInsert> = {}) {
    const [meeting] = await db
      .insert(schema.meetings)
      .values({
        orgId: org.id,
        userId: user.id,
        status: 'confirmed',
        source: 'agenda',
        scheduledAt: new Date(NOW.getTime() + 30 * 60_000),
        endTime: new Date(NOW.getTime() + 60 * 60_000),
        eventTypeId: eventType.id,
        attendeeName: 'Maria Souza',
        attendeeEmail: 'maria@exemplo.com',
        attendeePhone: '+5511999999999',
        timezone: 'America/Sao_Paulo',
        location: 'https://meet.exemplo.com/abc',
        confirmedAt: NOW,
        ...overrides,
      })
      .returning();
    return meeting;
  }

  return { db, org, user, eventType, createMeeting };
}

describe('agenda — lembrete automático', () => {
  it('manda o lembrete dentro da janela e grava reminderSentAt', async () => {
    const { db, createMeeting } = await setup();
    const meeting = await createMeeting();
    const sent = recorder();

    const outcome = await sendMeetingReminders(db, { now: NOW, withinMinutes: 60, ...sent });

    expect(outcome).toEqual({ processed: 1, sent: 1, skipped: 0, failed: 0 });
    // Lead pelo WhatsApp (há telefone) e vendedor por e-mail.
    expect(sent.whats).toHaveLength(1);
    expect(sent.whats[0].recipient).toBe('+5511999999999');
    expect(sent.emails).toHaveLength(1);
    expect(sent.emails[0].to).toEqual(['agenda@x.com']);

    const [stored] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.id));
    expect(stored.reminderSentAt).toBeInstanceOf(Date);
    expect(stored.reminderSentAt?.toISOString()).toBe(NOW.toISOString());
  });

  it('pula a reserva já lembrada e não reenvia nada', async () => {
    const { db, createMeeting } = await setup();
    const meeting = await createMeeting({ reminderSentAt: new Date(NOW.getTime() - 60 * 60_000) });
    const sent = recorder();

    const outcome = await sendMeetingReminders(db, { now: NOW, withinMinutes: 60, ...sent });

    expect(outcome).toEqual({ processed: 1, sent: 0, skipped: 1, failed: 0 });
    expect(sent.whats).toHaveLength(0);
    expect(sent.emails).toHaveLength(0);

    const [stored] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.id));
    expect(stored.reminderSentAt?.toISOString()).toBe(new Date(NOW.getTime() - 60 * 60_000).toISOString());
  });

  it('não toca em reserva fora da janela', async () => {
    const { db, createMeeting } = await setup();
    const meeting = await createMeeting({ scheduledAt: new Date(NOW.getTime() + 3 * 60 * 60_000) });
    const sent = recorder();

    const outcome = await sendMeetingReminders(db, { now: NOW, withinMinutes: 60, ...sent });

    expect(outcome).toEqual({ processed: 0, sent: 0, skipped: 0, failed: 0 });
    expect(sent.whats).toHaveLength(0);
    expect(sent.emails).toHaveLength(0);

    const [stored] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.id));
    expect(stored.reminderSentAt).toBeNull();
  });

  it('falha no envio não grava reminderSentAt e a próxima rodada tenta de novo', async () => {
    const { db, createMeeting } = await setup();
    const meeting = await createMeeting();
    const sent = recorder();

    const failed = await sendMeetingReminders(db, {
      now: NOW,
      withinMinutes: 60,
      sendWhatsApp: async () => {
        throw new Error('WhatsApp indisponível');
      },
      sendEmail: sent.sendEmail,
    });

    expect(failed).toEqual({ processed: 1, sent: 0, skipped: 0, failed: 1 });
    const [afterFail] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.id));
    expect(afterFail.reminderSentAt).toBeNull();

    // Próxima rodada: agora funciona e o lembrete é gravado.
    const retry = await sendMeetingReminders(db, { now: NOW, withinMinutes: 60, ...sent });
    expect(retry).toEqual({ processed: 1, sent: 1, skipped: 0, failed: 0 });
    const [afterRetry] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.id));
    expect(afterRetry.reminderSentAt).toBeInstanceOf(Date);
  });

  it('falha no e-mail do vendedor também não grava reminderSentAt', async () => {
    const { db, createMeeting } = await setup();
    const meeting = await createMeeting();
    const sent = recorder();

    const outcome = await sendMeetingReminders(db, {
      now: NOW,
      withinMinutes: 60,
      sendWhatsApp: sent.sendWhatsApp,
      sendEmail: async () => {
        throw new Error('Graph fora do ar');
      },
    });

    expect(outcome).toEqual({ processed: 1, sent: 0, skipped: 0, failed: 1 });
    const [stored] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.id));
    expect(stored.reminderSentAt).toBeNull();
  });

  it('avisa o lead por e-mail quando não há telefone', async () => {
    const { db, createMeeting } = await setup();
    await createMeeting({ attendeePhone: null });
    const sent = recorder();

    const outcome = await sendMeetingReminders(db, { now: NOW, withinMinutes: 60, ...sent });

    expect(outcome).toEqual({ processed: 1, sent: 1, skipped: 0, failed: 0 });
    expect(sent.whats).toHaveLength(0);
    expect(sent.emails.map((mail) => mail.to)).toEqual([['maria@exemplo.com'], ['agenda@x.com']]);
  });

  it('o texto do lembrete traz data, hora e fuso', async () => {
    const { db, createMeeting } = await setup();
    await createMeeting();
    const sent = recorder();

    await sendMeetingReminders(db, { now: NOW, withinMinutes: 60, ...sent });

    const text = sent.whats[0].text;
    expect(text).toContain('Maria');
    expect(text).toContain('30 de outubro de 2026');
    expect(text).toContain('09:30');
    expect(text).toContain('America/Sao_Paulo');
    expect(sent.emails[0].text).toContain('America/Sao_Paulo');
  });

  it('usa a antecedência do tipo de reunião', async () => {
    const { db, org, user, createMeeting } = await setup();
    // Tipo que pede lembrete 15 min antes: a reserva a 40 min ainda não é hora.
    const [fastReminder] = await db
      .insert(schema.agendaEventTypes)
      .values({
        orgId: org.id,
        userId: user.id,
        title: 'Reunião Rápida',
        slug: 'reuniao-rapida',
        durationMin: 15,
        minNoticeMin: 120,
        timezone: 'America/Sao_Paulo',
        reminderMinutesBefore: 15,
      })
      .returning();
    const meeting = await createMeeting({ eventTypeId: fastReminder.id, scheduledAt: new Date(NOW.getTime() + 40 * 60_000) });
    const sent = recorder();

    const outcome = await sendMeetingReminders(db, { now: NOW, withinMinutes: 60, ...sent });

    expect(outcome).toEqual({ processed: 1, sent: 0, skipped: 1, failed: 0 });
    expect(sent.whats).toHaveLength(0);
    const [stored] = await db.select().from(schema.meetings).where(eq(schema.meetings.id, meeting.id));
    expect(stored.reminderSentAt).toBeNull();

    // Agora dentro dos 15 min: o lembrete sai.
    const later = await sendMeetingReminders(db, { now: new Date(NOW.getTime() + 30 * 60_000), withinMinutes: 60, ...sent });
    expect(later).toEqual({ processed: 1, sent: 1, skipped: 0, failed: 0 });
    expect(sent.whats).toHaveLength(1);
  });
});

describe('agenda — lembrete no cron', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'segredo-de-teste';
  });

  it('o cron chama a rotina e inclui o resultado no JSON', async () => {
    const { sendMeetingReminders: cronRoutine } = await import('@/lib/agenda-reminders');
    const { GET } = await import('@/app/api/cron/route');

    const req = new Request('https://prospectra.app/api/cron', { headers: { authorization: 'Bearer segredo-de-teste' } });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { reminders?: ReminderOutcome };
    expect(body.reminders).toEqual({ processed: 0, sent: 0, skipped: 0, failed: 0 });
    expect(cronRoutine).toHaveBeenCalledTimes(1);
  });

  it('o cron recusa quem não manda o segredo', async () => {
    const { GET } = await import('@/app/api/cron/route');
    const res = await GET(new Request('https://prospectra.app/api/cron'));
    expect(res.status).toBe(401);
  });
});

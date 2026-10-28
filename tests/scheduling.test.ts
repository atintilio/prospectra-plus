import { test, expect, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema, type DB } from '@/db';
import {
  buildIcs, nextBusinessSlots, meetingSchedulerLink, meetingHandoffNote,
  requestMeeting, confirmMeeting, confirmMeetingAndInvite, cancelMeeting,
} from '@/lib/scheduling';
import { handoffCommercialFlow } from '@/lib/harvey-operations';

afterEach(() => { delete process.env.MEETING_SCHEDULER_URL; });

async function seedLead(db: DB, orgId: string, ownerId: string, name = 'Lead Reunião') {
  const [lead] = await db.insert(schema.leads).values({
    orgId, ownerId, linkedinUrl: `https://linkedin.com/in/${crypto.randomUUID()}`, fullName: name, company: 'ACME',
  }).returning();
  return lead;
}

test('buildIcs produz um VEVENT válido com início/fim em UTC', () => {
  const ics = buildIcs({
    uid: 'm-1', title: 'Reunião Prospectra; demo', description: 'linha1\nlinha2',
    start: new Date('2026-11-02T14:00:00Z'), durationMin: 30,
    organizerEmail: 'vendedor@x.com', attendeeName: 'Fulano', attendeeEmail: 'lead@x.com', now: new Date('2026-10-28T00:00:00Z'),
  });
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('BEGIN:VEVENT');
  expect(ics).toContain('UID:m-1');
  expect(ics).toContain('DTSTART:20261102T140000Z');
  expect(ics).toContain('DTEND:20261102T143000Z');
  expect(ics).toContain('SUMMARY:Reunião Prospectra\\; demo'); // escape de ';'
  expect(ics).toContain('DESCRIPTION:linha1\\nlinha2');
  expect(ics).toContain('ATTENDEE;CN=Fulano;RSVP=TRUE:mailto:lead@x.com');
  expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
});

test('nextBusinessSlots pula fim de semana e respeita a quantidade e a janela', () => {
  // 2026-10-31 é sábado.
  const slots = nextBusinessSlots(new Date('2026-10-31T12:00:00Z'), 3);
  expect(slots).toHaveLength(3);
  for (const s of slots) {
    const day = s.getUTCDay();
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(5);
    expect(s.getUTCHours()).toBeGreaterThanOrEqual(12);
    expect(s.getUTCHours()).toBeLessThan(21);
  }
  // primeiro slot não pode cair no sábado/domingo
  expect([1, 2, 3, 4, 5]).toContain(slots[0].getUTCDay());
});

test('meetingSchedulerLink lê do ambiente e só aceita http(s); meetingHandoffNote reflete isso', () => {
  expect(meetingSchedulerLink()).toBeNull();
  process.env.MEETING_SCHEDULER_URL = 'not-a-url';
  expect(meetingSchedulerLink()).toBeNull();
  process.env.MEETING_SCHEDULER_URL = 'https://cal.com/argus/reuniao';
  expect(meetingSchedulerLink()).toBe('https://cal.com/argus/reuniao');
  expect(meetingHandoffNote(meetingSchedulerLink())).toContain('https://cal.com/argus/reuniao');
  expect(meetingHandoffNote(null)).toContain('MEETING_SCHEDULER_URL');
});

test('requestMeeting é idempotente: no máximo uma reunião aberta por lead', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Agenda A');
  const lead = await seedLead(db, a.org.id, a.user.id);
  const first = await requestMeeting(db, { orgId: a.org.id, userId: a.user.id, leadId: lead.id, source: 'manual' });
  const second = await requestMeeting(db, { orgId: a.org.id, userId: a.user.id, leadId: lead.id, source: 'harvey' });
  expect(first).toBeTruthy();
  expect(second!.id).toBe(first!.id); // mesma reunião aberta
  const rows = await db.select().from(schema.meetings).where(eq(schema.meetings.leadId, lead.id));
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe('requested');
});

test('confirmMeeting avança o lead para "meeting" e registra o evento; cancelMeeting libera o lead para nova reunião', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Agenda B');
  const scope = { orgId: a.org.id, userId: a.user.id };
  const lead = await seedLead(db, a.org.id, a.user.id);
  const m = await requestMeeting(db, { ...scope, leadId: lead.id });
  const when = new Date('2026-11-03T14:00:00Z');
  const confirmed = await confirmMeeting(db, scope, m!.id, when);
  expect(confirmed.status).toBe('confirmed');
  expect(confirmed.scheduledAt?.toISOString()).toBe(when.toISOString());
  expect(confirmed.newlyConfirmed).toBe(true);
  const repeated = await confirmMeeting(db, scope, m!.id, when);
  expect(repeated.newlyConfirmed).toBe(false);
  const [leadAfter] = await db.select().from(schema.leads).where(eq(schema.leads.id, lead.id));
  expect(leadAfter.stage).toBe('meeting');
  const ev = await db.select().from(schema.events).where(and(eq(schema.events.leadId, lead.id), eq(schema.events.type, 'meeting_booked')));
  expect(ev).toHaveLength(1);
  // uma reunião confirmada ainda ocupa o "aberto"; ao cancelar, um novo pedido é possível
  await cancelMeeting(db, scope, m!.id);
  const again = await requestMeeting(db, { ...scope, leadId: lead.id });
  expect(again!.id).not.toBe(m!.id);
});

test('confirmMeetingAndInvite envia o .ics uma única vez ao lead e vendedor', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Agenda convite');
  const lead = await seedLead(db, a.org.id, a.user.id);
  await db.update(schema.leads).set({ email: 'lead@example.com' }).where(eq(schema.leads.id, lead.id));
  const meeting = await requestMeeting(db, { orgId: a.org.id, userId: a.user.id, leadId: lead.id });
  const sent: Array<{ to: string[]; ics: string }> = [];
  const sender = async (to: string[], _subject: string, _text: string, ics: string) => { sent.push({ to, ics }); };
  const scope = { orgId: a.org.id, userId: a.user.id };
  const when = new Date('2026-11-03T14:00:00Z');

  const first = await confirmMeetingAndInvite(db, scope, meeting!.id, when, 'seller@example.com', sender);
  const second = await confirmMeetingAndInvite(db, scope, meeting!.id, when, 'seller@example.com', sender);

  expect(first.inviteState).toBe('sent');
  expect(second.inviteState).toBe('already_confirmed');
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toEqual(['lead@example.com', 'seller@example.com']);
  expect(sent[0].ics).toContain('UID:' + meeting!.id);
  expect(sent[0].ics).toContain('DTSTART:20261103T140000Z');
  expect(sent[0].ics).toContain('ATTENDEE;CN=Lead Reunião;RSVP=TRUE:mailto:lead@example.com');
});

test('handoff por interesse registra a reunião (source harvey) e anexa o link ao e-mail', async () => {
  process.env.MEETING_SCHEDULER_URL = 'https://cal.com/argus/reuniao';
  const db = await testDb();
  const a = await seedOrg(db, 'Agenda C');
  const scope = { orgId: a.org.id, userId: a.user.id };
  const lead = await seedLead(db, a.org.id, a.user.id, 'Interessada');
  const [conv] = await db.insert(schema.harveyConversations).values({
    orgId: a.org.id, userId: a.user.id, leadId: lead.id, phone: '5511988887777',
    qualification: 'Pediu uma reunião para ver proposta.',
    profile: { sellerName: 'Vend', companyName: 'ACME', sellerPhone: '5511999990000', strategy: 'consultiva', offers: [{ name: 'Plano', description: 'desc' }] },
  }).returning();

  await handoffCommercialFlow(db, scope, lead.id, 'interested', ['atintilio@argusprime.com.br'], 'quero marcar uma reunião');

  const meetings = await db.select().from(schema.meetings).where(eq(schema.meetings.leadId, lead.id));
  expect(meetings).toHaveLength(1);
  expect(meetings[0].source).toBe('harvey');
  expect(meetings[0].conversationId).toBe(conv.id);
  const emails = await db.select().from(schema.harveyOutbox).where(and(eq(schema.harveyOutbox.conversationId, conv.id), eq(schema.harveyOutbox.kind, 'email')));
  expect(emails.length).toBeGreaterThanOrEqual(1);
  expect(emails.some((e) => e.body.includes('https://cal.com/argus/reuniao'))).toBe(true);
});

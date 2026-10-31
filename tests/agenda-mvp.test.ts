import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { buildIcs, createMeeting, meetingSchedulerUrl, publicMeetingUrl, sendMeetingInvite, setMeetingStatus, setMeetingStatusByToken } from '@/lib/agenda';
import { seedOrg, testDb } from './helpers';
import { vi as vitestVi } from 'vitest';
const vi2 = vitestVi;

vi.mock('@/lib/mailer', () => ({
  mailerConfigured: vitestVi.fn(() => true),
  sendRawEmail: vitestVi.fn(async () => { throw new Error('ENVIO_PROIBIDO_EM_TESTE'); }),
}));

const slot = new Date('2026-11-10T14:00:00.000Z');

function meetingInput() {
  return { title: 'Sessão de diagnóstico, vale a pena?', requesterName: 'Ana Foo', requesterEmail: 'ana@example.test', slot, durationMin: 30 };
}

beforeEach(() => {
  vitestVi.stubEnv('PUBLIC_APP_URL', 'https://crm.argusprime.com.br/');
  vitestVi.stubEnv('MEETING_SCHEDULER_URL', '');
});
afterEach(() => vitestVi.unstubAllEnvs());

test('convite .ics bem formado: METHOD, UID, intervalo, escape e participantes', () => {
  const ics = buildIcs({ publicId: 'token;roma,laranja', title: 'Análise, parte 1', slot, durationMin: 30, requesterEmail: 'ana@example.test', requesterName: 'Ana' });
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('METHOD:REQUEST');
  expect(ics).toContain('UID:token\\;roma\\,laranja@prospectra');
  expect(ics).toContain('DTSTART:20261110T140000Z');
  expect(ics).toContain('DTEND:20261110T143000Z');
  expect(ics).toContain('SUMMARY:Análise\\, parte 1');
  expect(ics).toContain('ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:ana@example.test');
  expect(ics).toContain('SEQUENCE:0');
  expect(ics.endsWith('END:VCALENDAR')).toBe(true);
});

test('cancelamento: METHOD:CANCEL, STATUS:CANCELLED e SEQUENCE:1', () => {
  const ics = buildIcs({ publicId: 'x2', title: 'T', slot, durationMin: 30, requesterEmail: 'ana@example.test', requesterName: 'Ana' }, 'cancelled');
  expect(ics).toContain('METHOD:CANCEL');
  expect(ics).toContain('STATUS:CANCELLED');
  expect(ics).toContain('SEQUENCE:1');
});

test('MEETING_SCHEDULER_URL ausente não quebra a Agenda', () => {
  expect(meetingSchedulerUrl()).toBeNull();
  vitestVi.stubEnv('MEETING_SCHEDULER_URL', 'https://cal.example.test/x ');
  expect(meetingSchedulerUrl()).toBe('https://cal.example.test/x');
});

test('reunião criada em requested, URL pública pegando a raiz do domínio', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Agenda');
  const m = await createMeeting(db, org.id, user.id, meetingInput());
  expect(m.status).toBe('requested');
  expect(m.icsState).toBe('none');
  expect(publicMeetingUrl(m)).toBe('https://crm.argusprime.com.br/agenda/' + m.publicId);
});

test('demo: convite é enfileirado e NÃO vai por e-mail de verdade', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'AgendaDemo');
  const m = await createMeeting(db, org.id, user.id, meetingInput());
  const r = await sendMeetingInvite(db, m, { isDemo: true, mailbox: null });
  expect(r).toBe('queued');
  expect((await db.select().from(schema.meetings).where(eq(schema.meetings.id, m.id)))[0].icsState).toBe('queued');
  const { sendRawEmail } = await import('@/lib/mailer') as any;
  expect(sendRawEmail).not.toHaveBeenCalled();
});

test('produção sem e-mail configurado: erro visível na Agenda', async () => {
  const { mailerConfigured } = await import('@/lib/mailer') as any;
  vitestVi.mocked(mailerConfigured).mockReturnValueOnce(false);
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'AgendaErro');
  const m = await createMeeting(db, org.id, user.id, meetingInput());
  const r = await sendMeetingInvite(db, m, { isDemo: false, mailbox: null });
  expect(r).toBe('error');
  const row = (await db.select().from(schema.meetings).where(eq(schema.meetings.id, m.id)))[0];
  expect(row.icsState).toBe('error');
  expect(row.icsError).toContain('E-mail não configurado');
});

test('produção com e-mail: convite sai com o .ics anexado', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'AgendaEnviada');
  const m = await createMeeting(db, org.id, user.id, meetingInput());
  const { sendRawEmail } = await import('@/lib/mailer') as any;
  sendRawEmail.mockImplementation(async () => ({}));
  const r = await sendMeetingInvite(db, m, { isDemo: false, mailbox: 'vendas@argusprime.com.br' });
  expect(r).toBe('sent');
  expect(sendRawEmail).toHaveBeenCalledTimes(1);
  const call = sendRawEmail.mock.calls[0][0];
  expect(call.attachments[0].name).toBe('invite.ics');
  expect(call.attachments[0].contentBase64).toBeTruthy();
  expect(call.mailbox).toBe('vendas@argusprime.com.br');
});

test('status muda apenas na organização certa; página pública é por token', async () => {
  const db = await testDb();
  const mine = await seedOrg(db, 'Minha');
  const other = await seedOrg(db, 'Alheia');
  const m = await createMeeting(db, mine.org.id, mine.user.id, meetingInput());
  expect(await setMeetingStatus(db, other.org.id, m.publicId, 'confirmed')).toBeUndefined();
  expect((await db.select().from(schema.meetings).where(eq(schema.meetings.id, m.id)))[0].status).toBe('requested');
  expect((await setMeetingStatus(db, mine.org.id, m.publicId, 'confirmed'))?.status).toBe('confirmed');
  expect((await setMeetingStatusByToken(db, m.publicId, 'cancelled'))?.status).toBe('cancelled');
});

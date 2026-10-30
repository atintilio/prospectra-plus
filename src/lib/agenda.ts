import 'server-only';
import { and, eq } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import { newToken } from './crypto';
import { mailerConfigured, sendRawEmail } from './mailer';

// Agenda: reuniões solicitadas/confirmadas, cancelamento, convite .ics e erros de e-mail.
// MEETING_SCHEDULER_URL (agendador externo) é opcional: a Agenda funciona sem ele.

export function meetingSchedulerUrl(): string | null {
  return process.env.MEETING_SCHEDULER_URL?.trim() || null;
}

export type MeetingRow = typeof schema.meetings.$inferSelect;

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}Z`;
}

export function buildIcs(m: Pick<MeetingRow, 'publicId' | 'title' | 'slot' | 'durationMin' | 'requesterEmail' | 'requesterName'>, status: schema.MeetingStatus = 'confirmed'): string {
  const start = new Date(m.slot);
  const end = new Date(start.getTime() + m.durationMin * 60_000);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Prospectra//Agenda//PT-BR', 'CALSCALE:GREGORIAN',
    `METHOD:${status === 'cancelled' ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:${icsEscape(m.publicId)}@prospectra`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(m.title)}`,
    `STATUS:${status === 'cancelled' ? 'CANCELLED' : status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`,
    `DESCRIPTION:${icsEscape(`Reunião agendada com ${m.requesterName} (${m.requesterEmail}) via Prospectra.`)}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${status === 'confirmed' ? 'ACCEPTED' : 'NEEDS-ACTION'}:mailto:${m.requesterEmail}`,
    status === 'cancelled' ? 'SEQUENCE:1' : 'SEQUENCE:0',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export async function getMeetingByToken(db: DB, publicId: string): Promise<MeetingRow | undefined> {
  const [m] = await db.select().from(schema.meetings).where(eq(schema.meetings.publicId, publicId)).limit(1);
  return m ?? undefined;
}

export function publicMeetingUrl(m: Pick<MeetingRow, 'publicId'>): string {
  const base = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, '') || 'http://localhost:3000';
  return `${base}/agenda/${m.publicId}`;
}

export async function createMeeting(db: DB, orgId: string, ownerId: string | null, input: {
  title: string; requesterName: string; requesterEmail: string; slot: Date; durationMin: number; leadId?: string | null;
}): Promise<MeetingRow> {
  const [m] = await db.insert(schema.meetings).values({
    orgId, ownerId, publicId: newToken(), title: input.title, requesterName: input.requesterName,
    requesterEmail: input.requesterEmail, slot: input.slot, durationMin: input.durationMin, leadId: input.leadId ?? null,
    status: 'requested', icsState: 'none',
  }).returning();
  return m;
}

async function setIcs(db: DB, meetingId: string, patch: Partial<Pick<MeetingRow, 'icsState' | 'icsError'>>) {
  await db.update(schema.meetings).set(patch).where(eq(schema.meetings.id, meetingId));
}

/**
 * Envia o e-mail com o convite .ics anexado. Demo nunca envia nada de verdade.
 * Em produção sem e-mail configurado marca erro visível na Agenda.
 */
export async function sendMeetingInvite(db: DB, meeting: MeetingRow, opts: { isDemo: boolean; mailbox?: string | null }): Promise<'sent' | 'queued' | 'error'> {
  if (opts.isDemo) {
    await setIcs(db, meeting.id, { icsState: 'queued', icsError: null });
    return 'queued';
  }
  if (!mailerConfigured()) {
    await setIcs(db, meeting.id, { icsState: 'error', icsError: 'E-mail não configurado (Office 365). Configure o remetente em Configurações/Administração.' });
    return 'error';
  }
  try {
    const ics = buildIcs(meeting, meeting.status);
    const html = `<p>Olá, ${meeting.requesterName}.</p><p>Segue o convite da reunião "<strong>${meeting.title}</strong>" anexo (invite.ics).</p><p>Confirme ou cancele pela página: ${publicMeetingUrl(meeting)}</p>`;
    await sendRawEmail({
      to: meeting.requesterEmail, subject: `Convite: ${meeting.title}`, html,
      mailbox: opts.mailbox ?? undefined,
      attachments: [{ name: 'invite.ics', contentBase64: Buffer.from(ics, 'utf8').toString('base64'), contentType: 'text/calendar; charset=utf-8; method=REQUEST' }],
    });
    await setIcs(db, meeting.id, { icsState: 'sent', icsError: null });
    return 'sent';
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'falha desconhecida';
    await setIcs(db, meeting.id, { icsState: 'error', icsError: `Envio falhou: ${detail}` });
    return 'error';
  }
}

export async function setMeetingStatus(db: DB, orgId: string, publicId: string, status: schema.MeetingStatus): Promise<MeetingRow | undefined> {
  const [m] = await db.update(schema.meetings).set({ status })
    .where(and(eq(schema.meetings.publicId, publicId), eq(schema.meetings.orgId, orgId)))
    .returning();
  return m ?? undefined;
}

/** Página pública: só o token decide (isola visualização e alteração ao dono do link). */
export async function setMeetingStatusByToken(db: DB, publicId: string, status: schema.MeetingStatus): Promise<MeetingRow | undefined> {
  const [m] = await db.update(schema.meetings).set({ status }).where(eq(schema.meetings.publicId, publicId)).returning();
  return m ?? undefined;
}

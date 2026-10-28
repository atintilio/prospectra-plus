import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import type { Scope } from '@/lib/whatsapp/akg';
import { sendCalendarInvite } from '@/lib/mailer';

// Agendamento de reuniões — fase assistida.
// O disparo/calendário real é configurado MANUALMENTE pelo proprietário:
//  - MEETING_SCHEDULER_URL: link público de marcação (Calendly/cal.com/Outlook Bookings etc.);
//  - o convite .ics pode ser enviado pelo Office 365 já existente (mailer.ts).
// Sem configuração, a reunião fica registrada como "requested" para o vendedor assumir.
// Nenhum serviço pago obrigatório é ativado aqui.

export function meetingSchedulerLink(): string | null {
  const v = process.env.MEETING_SCHEDULER_URL?.trim();
  return v && /^https?:\/\//i.test(v) ? v : null;
}

/** Próximos `count` horários comerciais (seg–sex, janela de horas em UTC) a partir de `from`. */
export function nextBusinessSlots(
  from: Date,
  count = 3,
  opts: { startHour?: number; endHour?: number; stepHours?: number } = {},
): Date[] {
  const { startHour = 12, endHour = 21, stepHours = 1 } = opts; // 12–21 UTC ≈ 09–18 em BRT
  const slots: Date[] = [];
  const cur = new Date(from.getTime());
  cur.setUTCMinutes(0, 0, 0);
  cur.setUTCHours(cur.getUTCHours() + 1);
  for (let guard = 0; guard < 24 * 21 && slots.length < count; guard++) {
    const day = cur.getUTCDay();
    const h = cur.getUTCHours();
    if (day >= 1 && day <= 5 && h >= startHour && h < endHour) slots.push(new Date(cur.getTime()));
    cur.setUTCHours(cur.getUTCHours() + Math.max(1, stepHours));
  }
  return slots;
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Gera um convite .ics (RFC 5545) para a reunião. Função pura. */
export function buildIcs(ev: {
  uid: string;
  title: string;
  description?: string;
  start: Date;
  durationMin?: number;
  organizerEmail: string;
  attendeeName?: string;
  attendeeEmail?: string;
  location?: string;
  now?: Date;
}): string {
  const end = new Date(ev.start.getTime() + (ev.durationMin ?? 30) * 60000);
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prospectra//Agendamento//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${icsDate(ev.now ?? new Date())}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
    ...(ev.location ? [`LOCATION:${esc(ev.location)}`] : []),
    `ORGANIZER:mailto:${ev.organizerEmail}`,
    ...(ev.attendeeEmail ? [`ATTENDEE;CN=${esc(ev.attendeeName ?? ev.attendeeEmail)};RSVP=TRUE:mailto:${ev.attendeeEmail}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/** Linha para o e-mail de passagem humana com o caminho de marcação. */
export function meetingHandoffNote(link: string | null): string {
  return link
    ? `Agendamento: envie ao lead este link para marcar a reunião — ${link}`
    : 'Agendamento: reunião registrada como solicitada. Configure MEETING_SCHEDULER_URL (ou use o calendário do vendedor) para enviar um link de marcação.';
}

type Meeting = typeof schema.meetings.$inferSelect;

/**
 * Registra o interesse em reunião de forma durável e idempotente:
 * no máximo uma reunião aberta (requested/confirmed) por lead.
 */
export async function requestMeeting(
  db: DB,
  args: { orgId: string; userId: string; leadId: string; conversationId?: string | null; source?: 'harvey' | 'manual'; note?: string },
): Promise<Meeting | null> {
  const [row] = await db
    .insert(schema.meetings)
    .values({
      orgId: args.orgId,
      userId: args.userId,
      leadId: args.leadId,
      conversationId: args.conversationId ?? null,
      source: args.source ?? 'manual',
      note: (args.note ?? '').slice(0, 2000),
      schedulerUrl: meetingSchedulerLink(),
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(schema.meetings)
    .where(and(eq(schema.meetings.orgId, args.orgId), eq(schema.meetings.leadId, args.leadId), sql`${schema.meetings.status} in ('requested','confirmed')`));
  return existing ?? null;
}

const CONFIRMABLE_STAGES = ['new', 'invited', 'connected', 'replied'] as const;

/** Confirma a reunião: grava horário, avança o lead para "meeting" e registra o evento. */
export async function confirmMeeting(db: DB, scope: Scope, meetingId: string, scheduledAt: Date): Promise<Meeting & { newlyConfirmed: boolean }> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(schema.meetings)
      .where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.orgId, scope.orgId), eq(schema.meetings.userId, scope.userId)))
      .for('update');
    if (!m || m.status === 'cancelled') throw new Error('Reunião indisponível.');
    if (m.status === 'confirmed') {
      if (m.scheduledAt?.getTime() !== scheduledAt.getTime()) throw new Error('Reunião já confirmada para outro horário.');
      return { ...m, newlyConfirmed: false };
    }
    const [updated] = await tx.update(schema.meetings).set({ status: 'confirmed', scheduledAt }).where(eq(schema.meetings.id, m.id)).returning();
    const [lead] = await tx.select().from(schema.leads).where(and(eq(schema.leads.id, m.leadId), eq(schema.leads.orgId, scope.orgId)));
    if (lead && (CONFIRMABLE_STAGES as readonly string[]).includes(lead.stage)) {
      await tx.update(schema.leads).set({ stage: 'meeting', lastActivityAt: new Date() }).where(eq(schema.leads.id, m.leadId));
    }
    await tx.insert(schema.events).values({ orgId: scope.orgId, userId: scope.userId, leadId: m.leadId, type: 'meeting_booked' });
    return { ...updated, newlyConfirmed: true };
  });
}

/** Envia o convite somente na primeira confirmação; resultados incertos exigem conferência manual. */
export async function confirmMeetingAndInvite(
  db: DB, scope: Scope, meetingId: string, scheduledAt: Date, sellerEmail: string,
  sendInvite: typeof sendCalendarInvite = sendCalendarInvite,
): Promise<{ meeting: Meeting; inviteState: 'sent' | 'missing_email' | 'unknown' | 'already_confirmed' }> {
  const meeting = await confirmMeeting(db, scope, meetingId, scheduledAt);
  if (!meeting.newlyConfirmed) return { meeting, inviteState: 'already_confirmed' };
  const [lead] = await db.select({ name: schema.leads.fullName, email: schema.leads.email })
    .from(schema.leads).where(and(eq(schema.leads.id, meeting.leadId), eq(schema.leads.orgId, scope.orgId)));
  const leadEmail = lead?.email?.trim();
  const organizerEmail = sellerEmail.trim();
  if (!leadEmail || !organizerEmail) return { meeting, inviteState: 'missing_email' };
  const title = `Reunião Prospectra com ${lead.name}`;
  const ics = buildIcs({ uid: meeting.id, title, start: scheduledAt, organizerEmail, attendeeName: lead.name, attendeeEmail: leadEmail });
  const when = scheduledAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
  try {
    await sendInvite([leadEmail, organizerEmail], title, `Reunião confirmada para ${when} (horário de Brasília). O convite está em anexo.`, ics);
    return { meeting, inviteState: 'sent' };
  } catch {
    return { meeting, inviteState: 'unknown' };
  }
}

/** Cancela uma reunião em aberto, liberando o índice de "uma reunião aberta por lead". */
export async function cancelMeeting(db: DB, scope: Scope, meetingId: string): Promise<void> {
  await db
    .update(schema.meetings)
    .set({ status: 'cancelled' })
    .where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.orgId, scope.orgId), eq(schema.meetings.userId, scope.userId)));
}

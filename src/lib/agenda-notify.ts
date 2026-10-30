import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';
import { buildIcs } from '@/lib/scheduling';
import { sendCalendarInvite, sendSupportMail } from '@/lib/mailer';
import { AkgGateway, akgConfig } from '@/lib/whatsapp/akg';

/**
 * Notificações do ato da reserva da agenda nativa:
 *  1. convite com `.ics` por e-mail (participante + vendedor);
 *  2. aviso ao vendedor de que um lead agendou;
 *  3. confirmação no WhatsApp do participante.
 *
 * Regras de ouro:
 *  - a reserva NUNCA falha por causa da notificação: erro de envio vira estado
 *    'unknown' gravado em `meetings`, sem exceção propagada;
 *  - o envio de WhatsApp usa o gateway da operação (mesmo padrão do
 *    `cadence.ts`); o transporte é injetável (`sendWhatsApp`) para os testes;
 *  - idempotência: convite/aviso já enviados não são repetidos
 *    (`inviteSentAt`, `sellerNotifiedAt`).
 */

export type NotifyOutcome = 'sent' | 'missing_email' | 'missing_phone' | 'unknown' | 'not_required';

/** Estados graváveis em `meetings.invite_state`. */
type InviteOutcome = 'sent' | 'missing_email' | 'unknown' | 'not_required';

export type BookingNotifyInput = {
  meetingId: string;
  orgId: string;
  sellerEmail: string;
  sellerName?: string | null;
  /** Usuário dono da reserva — usado para escopar o envio do WhatsApp. */
  sellerUserId?: string | null;
  /** Telefone do vendedor (canal interno opcional). */
  sellerPhone?: string | null;
  attendeeName: string;
  attendeeEmail?: string | null;
  attendeePhone?: string | null;
  start: Date;
  durationMin: number;
  /** IANA, ex.: 'America/Sao_Paulo'. */
  timezone: string;
  location?: string | null;
  /** Link público de cancelamento (aparece nos avisos). */
  cancelUrl?: string | null;
  /** Convite `.ics` por e-mail (padrão: true). */
  sendInvite?: boolean;
  /** Aviso ao vendedor (padrão: true). */
  notifySeller?: boolean;
  /** Confirmação no WhatsApp do participante (padrão: true). */
  notifyAttendee?: boolean;
  /** Transporte de WhatsApp injetado — sem ele, usa o gateway da operação. */
  sendWhatsApp?: (recipient: string, text: string) => Promise<void>;
};

export type BookingNotifyResult = {
  invite: NotifyOutcome;
  seller: NotifyOutcome;
  attendee: NotifyOutcome;
};

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DEFAULT_DURATION_MIN = 30;

/** Rótulos pt-BR dos fusos brasileiros (o resto mostra o nome IANA). */
const ZONE_LABELS: Record<string, string> = {
  'America/Sao_Paulo': 'horário de Brasília',
  'America/Belem': 'horário de Belém',
  'America/Fortaleza': 'horário de Fortaleza',
  'America/Manaus': 'horário de Manaus',
  'America/Recife': 'horário de Recife',
  'America/Araguaina': 'horário de Tocantins',
  'America/Cuiaba': 'horário de Cuiabá',
  'America/Campo_Grande': 'horário de Campo Grande',
  'America/Porto_Velho': 'horário de Porto Velho',
  'America/Boa_Vista': 'horário de Boa Vista',
  'America/Rio_Branco': 'horário do Acre',
};

function text(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Fuso válido (cai no padrão quando o IANA não existe). */
function safeTimezone(timezone: string | null | undefined): string {
  const candidate = text(timezone);
  if (!candidate) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function zoneLabel(timezone: string): string {
  return ZONE_LABELS[timezone] ?? timezone;
}

/** "12/11/2026, 14:00" no fuso da reunião. */
function formatWhen(start: Date, timezone: string): string {
  const tz = safeTimezone(timezone);
  try {
    return start.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: tz });
  } catch {
    return start.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: DEFAULT_TIMEZONE });
  }
}

/** URL interna da agenda (para o vendedor "ver" a reserva). */
function agendaUrl(): string {
  const base = text(process.env.PUBLIC_APP_URL).replace(/\/$/, '');
  return base ? `${base}/agenda` : '/agenda';
}

type MeetingNotifyRow = {
  id: string;
  inviteState: InviteOutcome | null;
  inviteSentAt: Date | null;
  sellerNotifiedAt: Date | null;
};

async function loadMeeting(database: DB, meetingId: string, orgId: string): Promise<MeetingNotifyRow | undefined> {
  if (!meetingId) return undefined;
  const conditions = [eq(schema.meetings.id, meetingId)];
  if (orgId) conditions.push(eq(schema.meetings.orgId, orgId));
  const [row] = await database
    .select({
      id: schema.meetings.id,
      inviteState: schema.meetings.inviteState,
      inviteSentAt: schema.meetings.inviteSentAt,
      sellerNotifiedAt: schema.meetings.sellerNotifiedAt,
    })
    .from(schema.meetings)
    .where(and(...conditions))
    .limit(1);
  return row;
}

/** Grava o desfecho do convite (`invite_state` + `invite_sent_at`). */
async function markInvite(
  database: DB,
  meetingId: string,
  orgId: string,
  state: InviteOutcome,
  sentAt: Date | null,
): Promise<void> {
  if (!meetingId) return;
  const conditions = [eq(schema.meetings.id, meetingId)];
  if (orgId) conditions.push(eq(schema.meetings.orgId, orgId));
  const values: Partial<typeof schema.meetings.$inferInsert> = { inviteState: state };
  if (sentAt) values.inviteSentAt = sentAt;
  await database.update(schema.meetings).set(values).where(and(...conditions));
}

/** Grava o desfecho do aviso ao vendedor (`seller_notified_at`). */
async function markSellerNotified(database: DB, meetingId: string, orgId: string, at: Date): Promise<void> {
  if (!meetingId) return;
  const conditions = [eq(schema.meetings.id, meetingId)];
  if (orgId) conditions.push(eq(schema.meetings.orgId, orgId));
  await database.update(schema.meetings).set({ sellerNotifiedAt: at }).where(and(...conditions));
}

/**
 * Convite `.ics` por e-mail para o participante e o vendedor.
 * Erro de envio vira 'unknown' — nunca exceção.
 */
async function deliverInvite(args: {
  meetingId: string;
  attendeeName: string;
  attendeeEmail: string;
  sellerEmail: string;
  sellerName: string;
  start: Date;
  durationMin: number;
  location: string;
  cancelUrl: string;
  when: string;
  zone: string;
}): Promise<InviteOutcome> {
  if (!args.attendeeEmail || !args.sellerEmail) return 'missing_email';
  const title = `Reunião Prospectra com ${args.attendeeName}`;
  const ics = buildIcs({
    uid: args.meetingId,
    title,
    start: args.start,
    durationMin: args.durationMin,
    organizerEmail: args.sellerEmail,
    attendeeName: args.attendeeName,
    attendeeEmail: args.attendeeEmail,
    location: args.location || undefined,
  });
  const body = [
    `Olá, ${args.attendeeName}!`,
    '',
    `Sua reunião com ${args.sellerName || args.sellerEmail} está confirmada para ${args.when} (${args.zone}).`,
    `Duração: ${args.durationMin} minutos.`,
    args.location ? `Link da call: ${args.location}` : '',
    '',
    'O convite está em anexo (.ics): abra o anexo para adicionar a reunião à sua agenda.',
    args.cancelUrl ? `Precisa cancelar? ${args.cancelUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await sendCalendarInvite([args.attendeeEmail, args.sellerEmail], title, body, ics);
    return 'sent';
  } catch (error) {
    console.error('[agenda-notify] falha ao enviar o convite', args.meetingId, error);
    return 'unknown';
  }
}

/**
 * Transporte do WhatsApp: o injetado (usado nos testes) tem prioridade; sem
 * ele, usa o gateway da operação — mesmo padrão do `cadence.ts`. Sem gateway
 * configurado ou sem o vendedor identificado, o canal de WhatsApp não existe
 * (o e-mail continua cobrando a reserva).
 */
function createWhatsAppTransport(
  input: BookingNotifyInput,
): ((recipient: string, text: string) => Promise<void>) | null {
  if (input.sendWhatsApp) return input.sendWhatsApp;
  const sellerUserId = text(input.sellerUserId);
  if (!sellerUserId) return null;
  const config = akgConfig();
  if (!config) return null;
  let gateway: AkgGateway;
  try {
    gateway = new AkgGateway(config);
  } catch {
    return null;
  }
  const scope = { orgId: text(input.orgId), userId: sellerUserId };
  return async (recipient: string, message: string) => {
    await gateway.sendText(scope, recipient.replace(/\D/g, ''), message);
  };
}

/**
 * Notificações da reserva. Nunca levanta: o chamador grava a reserva e a
 * notificação é best-effort (o estado final persistido é o que importa).
 */
export async function notifyBooking(
  db: DB | undefined,
  input: BookingNotifyInput,
): Promise<BookingNotifyResult> {
  const database = db ?? (await getDb());

  const meetingId = text(input.meetingId);
  const orgId = text(input.orgId);
  const attendeeName = text(input.attendeeName) || 'Participante';
  const attendeeEmail = text(input.attendeeEmail);
  const attendeePhone = text(input.attendeePhone);
  const sellerEmail = text(input.sellerEmail);
  const sellerName = text(input.sellerName);
  const sellerPhone = text(input.sellerPhone);
  const location = text(input.location);
  const cancelUrl = text(input.cancelUrl);
  const timezone = safeTimezone(input.timezone);
  const start = input.start instanceof Date && !Number.isNaN(input.start.getTime()) ? input.start : new Date();
  const durationMin =
    Number.isFinite(input.durationMin) && input.durationMin > 0 ? Math.round(input.durationMin) : DEFAULT_DURATION_MIN;
  const when = formatWhen(start, timezone);
  const zone = zoneLabel(timezone);
  const sendWhatsApp = createWhatsAppTransport(input);

  const meeting = await loadMeeting(database, meetingId, orgId);
  const inviteAlreadySent = Boolean(meeting?.inviteSentAt);
  const sellerAlreadyNotified = Boolean(meeting?.sellerNotifiedAt);
  // A rodada de notificações já aconteceu: nada é reenviado.
  const firstRound = !inviteAlreadySent && !sellerAlreadyNotified;

  // ------------------------------------------------------------ convite (.ics)
  let invite: NotifyOutcome;
  if (input.sendInvite === false) {
    invite = 'not_required';
    // Não sobrescreve um convite que já saiu em uma rodada anterior.
    if (!inviteAlreadySent) await markInvite(database, meetingId, orgId, 'not_required', null);
  } else if (inviteAlreadySent) {
    invite = meeting?.inviteState ?? 'sent';
  } else {
    const outcome = await deliverInvite({
      meetingId,
      attendeeName,
      attendeeEmail,
      sellerEmail,
      sellerName,
      start,
      durationMin,
      location,
      cancelUrl,
      when,
      zone,
    });
    invite = outcome;
    await markInvite(database, meetingId, orgId, outcome, outcome === 'sent' ? new Date() : null);
  }

  // ------------------------------------------------------------ aviso ao vendedor
  let seller: NotifyOutcome;
  if (input.notifySeller === false) {
    seller = 'not_required';
  } else if (sellerAlreadyNotified) {
    seller = 'sent';
  } else if (!sellerEmail) {
    seller = 'missing_email';
  } else {
    const subject = `Novo agendamento: ${attendeeName}`;
    const body = [
      `Olá, ${sellerName || 'vendedor'}!`,
      '',
      `${attendeeName} agendou uma reunião pela agenda.`,
      `Quando: ${when} (${zone}) — ${durationMin} minutos`,
      `E-mail: ${attendeeEmail || 'não informado'}`,
      attendeePhone ? `Telefone: ${attendeePhone}` : '',
      location ? `Link da call: ${location}` : '',
      '',
      `Ver a reserva na agenda: ${agendaUrl()}`,
      cancelUrl ? `Cancelar a reserva: ${cancelUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await sendSupportMail([sellerEmail], subject, body);
      seller = 'sent';
      await markSellerNotified(database, meetingId, orgId, new Date());
    } catch (error) {
      console.error('[agenda-notify] falha ao avisar o vendedor', meetingId, error);
      seller = 'unknown';
    }
  }

  // WhatsApp interno do vendedor: só quando o e-mail saiu (ou não havia e-mail
  // para enviar) — evita duplicar o aviso.
  if (input.notifySeller !== false && firstRound && sendWhatsApp && sellerPhone && (seller === 'sent' || seller === 'missing_email')) {
    const body = [
      `Novo agendamento na agenda: ${attendeeName}.`,
      `Quando: ${when} (${zone}).`,
      `Ver a reserva: ${agendaUrl()}`,
    ].join('\n');
    try {
      await sendWhatsApp(sellerPhone, body);
    } catch (error) {
      console.error('[agenda-notify] falha no WhatsApp do vendedor', meetingId, error);
    }
  }

  // -------------------------------------------------- WhatsApp do participante
  let attendee: NotifyOutcome;
  if (input.notifyAttendee === false || !sendWhatsApp) {
    attendee = 'not_required';
  } else if (!firstRound) {
    attendee = 'not_required';
  } else if (!attendeePhone) {
    attendee = 'missing_phone';
  } else {
    const body = [
      `Olá, ${attendeeName}! Sua reunião está confirmada: ${when} (${zone}).`,
      `Duração: ${durationMin} minutos.`,
      location ? `Link da call: ${location}` : '',
      cancelUrl ? `Precisa cancelar? ${cancelUrl}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    try {
      await sendWhatsApp(attendeePhone, body);
      attendee = 'sent';
    } catch (error) {
      console.error('[agenda-notify] falha no WhatsApp do participante', meetingId, error);
      attendee = 'unknown';
    }
  }

  return { invite, seller, attendee };
}

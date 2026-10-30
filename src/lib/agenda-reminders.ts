import 'server-only';
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';
import { sendSupportMail } from '@/lib/mailer';
import { AkgGateway, akgConfig } from '@/lib/whatsapp/akg';

/**
 * Lembrete automático de reunião — roda no cron.
 *
 * Regras de ouro:
 *  - janela: reservas `confirmed` com `scheduledAt` entre `now` e `now + withinMinutes`;
 *  - uma vez por reserva: `reminderSentAt` preenchido = pula (skipped);
 *  - `reminderSentAt` só é gravado DEPOIS do envio bem-sucedido: erro de envio
 *    deixa a reserva para a próxima rodada do cron (conta como `failed`, sem
 *    exceção e sem repetir o que já foi enviado);
 *  - lead: WhatsApp quando há telefone e o envio está disponível; senão, e-mail.
 *    Vendedor: e-mail.
 *  - texto em pt-BR com data, hora e fuso.
 *
 * O envio é sempre injetável (WhatsApp e e-mail) para o teste rodar sem
 * gateway e sem Microsoft Graph.
 */

/** Antecedência padrão do lembrete, em minutos. */
export const DEFAULT_REMINDER_MINUTES = 60;

/** Abaixo desta antecedência o tipo de reunião aceita reserva em cima da hora. */
const SHORT_NOTICE_MIN = 5;

/** Teto de reservas por rodada (uma rodada não pode ficar infinita). */
const MAX_MEETINGS_PER_RUN = 500;

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export type ReminderInput = {
  /** Antecedência da janela do lembrete (minutos). Padrão: 60. */
  withinMinutes?: number;
  /** Momento de referência da rodada (default: agora). */
  now?: Date;
  /** Envio de WhatsApp (injetável). Sem ele, o lead é avisado por e-mail. */
  sendWhatsApp?: (recipient: string, text: string) => Promise<void>;
  /** Envio de e-mail (injetável). Default: `sendSupportMail` do repo. */
  sendEmail?: (to: string[], subject: string, text: string) => Promise<void>;
};

export type ReminderOutcome = {
  /** Reservas na janela que a rodada olhou. */
  processed: number;
  /** Lembretes enviados (e `reminderSentAt` gravado). */
  sent: number;
  /** Puladas (já lembradas, ainda não é hora ou sem canal de contato). */
  skipped: number;
  /** Falhas de envio — a próxima rodada tenta de novo. */
  failed: number;
};

type EventTypeInfo = {
  title: string;
  reminderMinutesBefore: number;
  minNoticeMin: number;
  timezone: string;
};

// ------------------------------------------------------------------ helpers

function boundedMinutes(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(24 * 60, Math.max(1, Math.round(value)));
}

function firstName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? value.trim();
}

/** Fuso válido (IANA); cai para São Paulo quando o registro tem lixo. */
function safeTimezone(value: string | null | undefined): string {
  const candidate = (value ?? '').trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Data, hora e fuso em pt-BR — o mesmo texto no WhatsApp e no e-mail. */
export function formatReminderMoment(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(date);
  }
}

/**
 * Antecedência efetiva do lembrete: `reminder_minutes_before` do tipo de
 * reunião, limitado pela janela da rodada. Tipo que aceita reserva com menos
 * de 5 min de antecedência usa a janela da rodada como teto.
 */
function effectiveLeadMinutes(eventType: EventTypeInfo | undefined, withinMinutes: number): number {
  if (!eventType) return withinMinutes;
  if (eventType.minNoticeMin < SHORT_NOTICE_MIN) return withinMinutes;
  const reminder = eventType.reminderMinutesBefore > 0 ? eventType.reminderMinutesBefore : withinMinutes;
  return Math.min(withinMinutes, reminder);
}

function attendeeText(name: string, title: string, moment: string, timezone: string, location: string): string {
  const lines = [`Olá, ${firstName(name)}!`, '', `Lembrete da sua ${title}: ${moment} (${timezone}).`];
  if (location) lines.push(`Link da reunião: ${location}`);
  lines.push('', 'Qualquer coisa, é só chamar.');
  return lines.join('\n');
}

function attendeeEmailBody(name: string, title: string, moment: string, timezone: string, location: string): string {
  const lines = [
    `Olá, ${firstName(name)}!`,
    '',
    `Este é o lembrete da sua reunião "${title}".`,
    '',
    `Data e hora: ${moment}`,
    `Fuso: ${timezone}`,
  ];
  if (location) lines.push(`Link da reunião: ${location}`);
  lines.push('', 'Se precisar remarcar, é só responder este e-mail.');
  return lines.join('\n');
}

function sellerEmailBody(
  sellerName: string,
  attendeeName: string,
  title: string,
  moment: string,
  timezone: string,
  contact: string,
): string {
  const lines = [
    `Olá, ${firstName(sellerName) || 'vendedor'}!`,
    '',
    `Lembrete: ${attendeeName} tem reunião "${title}".`,
    '',
    `Data e hora: ${moment}`,
    `Fuso: ${timezone}`,
  ];
  if (contact) lines.push(`Contato do participante: ${contact}`);
  return lines.join('\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Gateway do WhatsApp da operação (mesmo padrão do `cadence.ts`): o envio
 * padrão sai da sessão do vendedor dono da reserva. Sem gateway configurado,
 * o lead é avisado por e-mail.
 */
function createGateway(): AkgGateway | null {
  const config = akgConfig();
  if (!config) return null;
  try {
    return new AkgGateway(config);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ rotina

/**
 * Manda o lembrete das reuniões que entram na janela e grava `reminderSentAt`
 * — nunca antes do envio bem-sucedido, nunca duas vezes.
 */
export async function sendMeetingReminders(db: DB | undefined, input: ReminderInput = {}): Promise<ReminderOutcome> {
  const database = db ?? (await getDb());
  const now = input.now ?? new Date();
  const withinMinutes = boundedMinutes(input.withinMinutes, DEFAULT_REMINDER_MINUTES);
  const sendEmail = input.sendEmail ?? sendSupportMail;
  const injectedWhatsApp = input.sendWhatsApp;
  const gateway = injectedWhatsApp ? null : createGateway();

  const from = now;
  const to = new Date(now.getTime() + withinMinutes * 60_000);

  const meetings = await database
    .select()
    .from(schema.meetings)
    .where(
      and(
        eq(schema.meetings.status, 'confirmed'),
        gte(schema.meetings.scheduledAt, from),
        lte(schema.meetings.scheduledAt, to),
      ),
    )
    .orderBy(asc(schema.meetings.scheduledAt))
    .limit(MAX_MEETINGS_PER_RUN);

  const outcome: ReminderOutcome = { processed: 0, sent: 0, skipped: 0, failed: 0 };
  if (!meetings.length) return outcome;

  // Dados de apoio em lote (sem N+1): tipo de reunião, vendedor e lead.
  const eventTypeIds = uniqueIds(meetings.map((meeting) => meeting.eventTypeId));
  const userIds = uniqueIds(meetings.map((meeting) => meeting.userId));
  const leadIds = uniqueIds(meetings.map((meeting) => meeting.leadId));

  const eventTypes = eventTypeIds.length
    ? await database
        .select({
          id: schema.agendaEventTypes.id,
          title: schema.agendaEventTypes.title,
          reminderMinutesBefore: schema.agendaEventTypes.reminderMinutesBefore,
          minNoticeMin: schema.agendaEventTypes.minNoticeMin,
          timezone: schema.agendaEventTypes.timezone,
        })
        .from(schema.agendaEventTypes)
        .where(inArray(schema.agendaEventTypes.id, eventTypeIds))
    : [];
  const eventTypeById = new Map(eventTypes.map((row) => [row.id, row]));

  const sellers = userIds.length
    ? await database
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, userIds))
    : [];
  const sellerById = new Map(sellers.map((row) => [row.id, row]));

  const leads = leadIds.length
    ? await database
        .select({ id: schema.leads.id, fullName: schema.leads.fullName, email: schema.leads.email, phone: schema.leads.phone })
        .from(schema.leads)
        .where(inArray(schema.leads.id, leadIds))
    : [];
  const leadById = new Map(leads.map((row) => [row.id, row]));

  for (const meeting of meetings) {
    outcome.processed += 1;

    // Já lembrada: nada de reenviar.
    if (meeting.reminderSentAt) {
      outcome.skipped += 1;
      continue;
    }
    if (!meeting.scheduledAt) {
      outcome.skipped += 1;
      continue;
    }

    const eventType = meeting.eventTypeId ? eventTypeById.get(meeting.eventTypeId) : undefined;
    const seller = sellerById.get(meeting.userId);
    const lead = meeting.leadId ? leadById.get(meeting.leadId) : undefined;

    // Ainda não é hora de lembrar (o tipo pede mais antecedência).
    const minutesUntil = (meeting.scheduledAt.getTime() - now.getTime()) / 60_000;
    if (minutesUntil > effectiveLeadMinutes(eventType, withinMinutes)) {
      outcome.skipped += 1;
      continue;
    }

    const timezone = safeTimezone(meeting.timezone || eventType?.timezone || DEFAULT_TIMEZONE);
    const title = eventType?.title?.trim() || 'Reunião';
    const moment = formatReminderMoment(meeting.scheduledAt, timezone);
    const location = (meeting.location ?? '').trim();
    const attendeeName = (meeting.attendeeName ?? lead?.fullName ?? '').trim() || 'Participante';
    const attendeePhone = (meeting.attendeePhone ?? lead?.phone ?? '').trim();
    const attendeeEmail = (meeting.attendeeEmail ?? lead?.email ?? '').trim();
    const sellerEmail = (seller?.email ?? '').trim();
    const sellerName = (seller?.name ?? '').trim();
    const subject = `Lembrete de reunião — ${title}`;

    const errors: string[] = [];
    let delivered = 0;

    // 1) Lead: WhatsApp quando há telefone e o envio está disponível; senão e-mail.
    const sendWhatsApp = injectedWhatsApp
      ? injectedWhatsApp
      : gateway
        ? async (recipient: string, text: string) => {
            await gateway.sendText({ orgId: meeting.orgId, userId: meeting.userId }, recipient.replace(/\D/g, ''), text);
          }
        : null;

    if (attendeePhone && sendWhatsApp) {
      try {
        await sendWhatsApp(attendeePhone, attendeeText(attendeeName, title, moment, timezone, location));
        delivered += 1;
      } catch (error) {
        errors.push(`whatsapp(${attendeePhone}): ${errorMessage(error)}`);
      }
    } else if (attendeeEmail) {
      try {
        await sendEmail([attendeeEmail], subject, attendeeEmailBody(attendeeName, title, moment, timezone, location));
        delivered += 1;
      } catch (error) {
        errors.push(`email(${attendeeEmail}): ${errorMessage(error)}`);
      }
    } else {
      console.warn('[agenda] lembrete sem canal para o lead', meeting.id);
    }

    // 2) Vendedor: e-mail.
    if (sellerEmail) {
      const contact = attendeePhone || attendeeEmail;
      try {
        await sendEmail([sellerEmail], subject, sellerEmailBody(sellerName, attendeeName, title, moment, timezone, contact));
        delivered += 1;
      } catch (error) {
        errors.push(`email(${sellerEmail}): ${errorMessage(error)}`);
      }
    } else {
      console.warn('[agenda] lembrete sem e-mail do vendedor', meeting.id);
    }

    // Envio falhou: não grava `reminderSentAt` — a próxima rodada tenta de novo.
    if (errors.length) {
      outcome.failed += 1;
      console.error('[agenda] lembrete não enviado', meeting.id, errors.join(' | '));
      continue;
    }
    if (!delivered) {
      outcome.skipped += 1;
      continue;
    }

    await database
      .update(schema.meetings)
      .set({ reminderSentAt: now })
      .where(and(eq(schema.meetings.id, meeting.id), isNull(schema.meetings.reminderSentAt)));
    outcome.sent += 1;
  }

  return outcome;
}

function uniqueIds(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

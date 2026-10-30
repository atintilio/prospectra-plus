'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { confirmMeeting } from '@/lib/scheduling';
import { createEventType, createLink, setAvailability, updateEventType } from '@/lib/agenda-booking';
import { zonedTimeToUtc } from '@/lib/agenda-slots';
import { AkgGateway, akgConfig, assertWhatsAppAccess } from '@/lib/whatsapp/akg';
import type { AgendaActionState } from './agenda-view';

/**
 * Ações da agenda interna.
 *
 * Todas seguem o padrão do repo: `requireOrg()` no topo, escrita pela lib
 * nativa (`@/lib/agenda-booking`), `revalidatePath()` no fim e retorno
 * `{ ok } | { error }` para o `useActionState` do cliente.
 */

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Bloqueio com mais de 1 ano à frente não faz sentido para a agenda. */
const MAX_BLACKOUT_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/** Tolerância de 1 minuto: o formulário manda hora cheia, o relógio corre. */
const BLACKOUT_PAST_TOLERANCE_MS = 60 * 1000;

/** Janela de horário da disponibilidade (minutos desde a meia-noite). */
type Window = { dayOfWeek: number; startMinute: number; endMinute: number };

function readInt(form: FormData, name: string): number | null {
  const raw = String(form.get(name) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

/** Telefone em formato internacional (o gateway exige E.164). */
function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/** Valida as janelas de disponibilidade recebidas do formulário. */
function parseWindows(raw: string): { ok: true; value: Window[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    return { ok: false, error: 'Não foi possível ler os horários informados.' };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'Horários inválidos.' };

  const seen = new Set<string>();
  const windows: Window[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) return { ok: false, error: 'Horários inválidos.' };
    const row = item as Record<string, unknown>;
    const dayOfWeek = Number(row.dayOfWeek);
    const startMinute = Number(row.startMinute);
    const endMinute = Number(row.endMinute);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return { ok: false, error: 'Dia da semana inválido.' };
    }
    if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
      return { ok: false, error: 'Horário inválido.' };
    }
    if (startMinute < 0 || endMinute > 1440 || startMinute >= endMinute) {
      return { ok: false, error: 'A janela de horário precisa ter início antes do fim.' };
    }
    const key = `${dayOfWeek}:${startMinute}:${endMinute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    windows.push({ dayOfWeek, startMinute, endMinute });
  }
  return { ok: true, value: windows };
}

// ------------------------------------------------------------ tipos de reunião

/** Cria um tipo de reunião da operação. */
export async function criarTipoReuniaoAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const title = String(form.get('title') ?? '').trim();
  if (title.length < 2) return { error: 'Informe o título do tipo de reunião.' };
  const durationMin = readInt(form, 'durationMin');
  if (durationMin === null || durationMin < 5 || durationMin > 480) {
    return { error: 'A duração precisa ficar entre 5 e 480 minutos.' };
  }
  const slotIntervalMin = readInt(form, 'slotIntervalMin');
  if (slotIntervalMin === null || slotIntervalMin < 5 || slotIntervalMin > 240) {
    return { error: 'O intervalo entre horários precisa ficar entre 5 e 240 minutos.' };
  }
  const minNoticeMin = readInt(form, 'minNoticeMin');
  if (minNoticeMin === null || minNoticeMin < 0 || minNoticeMin > 20160) {
    return { error: 'A antecedência precisa ficar entre 0 e 20160 minutos.' };
  }
  const timezone = String(form.get('timezone') ?? '').trim() || DEFAULT_TIMEZONE;
  const description = String(form.get('description') ?? '').trim().slice(0, 2000);
  const location = String(form.get('location') ?? '').trim().slice(0, 500);
  const requiresConfirmation = form.getAll('requiresConfirmation').length > 0;

  try {
    const db = await getDb();
    const created = await createEventType(db, { orgId: ctx.org.id, userId: ctx.user.id }, {
      title,
      description,
      durationMin,
      slotIntervalMin,
      minNoticeMin,
      timezone,
      location,
      requiresConfirmation,
    });
    revalidatePath('/agenda');
    revalidatePath('/painel');
    return { ok: 'Tipo de reunião criado. Agora defina os horários disponíveis.', id: created.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível criar o tipo de reunião.' };
  }
}

/** Salva as alterações de um tipo de reunião (inclusive ativar/desativar). */
export async function salvarTipoReuniaoAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const eventTypeId = String(form.get('eventTypeId') ?? '').trim();
  if (!eventTypeId) return { error: 'Tipo de reunião não informado.' };

  const title = String(form.get('title') ?? '').trim();
  if (title.length < 2) return { error: 'Informe o título do tipo de reunião.' };
  const durationMin = readInt(form, 'durationMin');
  if (durationMin === null || durationMin < 5 || durationMin > 480) {
    return { error: 'A duração precisa ficar entre 5 e 480 minutos.' };
  }
  const slotIntervalMin = readInt(form, 'slotIntervalMin');
  if (slotIntervalMin === null || slotIntervalMin < 5 || slotIntervalMin > 240) {
    return { error: 'O intervalo entre horários precisa ficar entre 5 e 240 minutos.' };
  }
  const minNoticeMin = readInt(form, 'minNoticeMin');
  if (minNoticeMin === null || minNoticeMin < 0 || minNoticeMin > 20160) {
    return { error: 'A antecedência precisa ficar entre 0 e 20160 minutos.' };
  }
  const timezone = String(form.get('timezone') ?? '').trim() || DEFAULT_TIMEZONE;
  const description = String(form.get('description') ?? '').trim().slice(0, 2000);
  const location = String(form.get('location') ?? '').trim().slice(0, 500);
  const requiresConfirmation = form.getAll('requiresConfirmation').length > 0;
  const isActive = form.getAll('isActive').length > 0;

  try {
    const db = await getDb();
    await updateEventType(db, { orgId: ctx.org.id, userId: ctx.user.id }, eventTypeId, {
      title,
      description,
      durationMin,
      slotIntervalMin,
      minNoticeMin,
      timezone,
      location,
      requiresConfirmation,
      isActive,
    });
    revalidatePath('/agenda');
    revalidatePath('/painel');
    return { ok: 'Tipo de reunião atualizado.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível atualizar o tipo de reunião.' };
  }
}

// -------------------------------------------------------------- disponibilidade

/** Substitui a disponibilidade semanal do tipo de reunião. */
export async function salvarDisponibilidadeAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const eventTypeId = String(form.get('eventTypeId') ?? '').trim();
  if (!eventTypeId) return { error: 'Escolha o tipo de reunião.' };
  const parsed = parseWindows(String(form.get('availability') ?? '[]'));
  if (!parsed.ok) return { error: parsed.error };

  try {
    const db = await getDb();
    await setAvailability(db, { orgId: ctx.org.id, userId: ctx.user.id }, eventTypeId, parsed.value);
    revalidatePath('/agenda');
    return {
      ok: parsed.value.length
        ? 'Horários salvos. O link público passa a oferecer só esses horários.'
        : 'Horários limpos: este tipo de reunião não oferece horários agora.',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível salvar a disponibilidade.' };
  }
}

// -------------------------------------------------------------------- links

/** Gera um link público (rastreado, quando há lead). */
export async function gerarLinkAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const eventTypeId = String(form.get('eventTypeId') ?? '').trim();
  if (!eventTypeId) return { error: 'Escolha o tipo de reunião.' };
  const leadId = String(form.get('leadId') ?? '').trim() || null;

  try {
    const db = await getDb();
    const link = await createLink(db, { orgId: ctx.org.id, userId: ctx.user.id }, eventTypeId, { leadId, channel: 'link' });
    revalidatePath('/agenda');
    return { ok: leadId ? 'Link gerado e vinculado ao lead.' : 'Link público gerado.', url: link.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível gerar o link.' };
  }
}

/** Gera o link e envia para o WhatsApp do lead (mesmo gateway do resto do app). */
export async function enviarLinkWhatsappAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const eventTypeId = String(form.get('eventTypeId') ?? '').trim();
  if (!eventTypeId) return { error: 'Escolha o tipo de reunião.' };
  const leadId = String(form.get('leadId') ?? '').trim();
  if (!leadId) return { error: 'Escolha o lead que vai receber o link.' };

  const db = await getDb();
  const [lead] = await db
    .select({ id: schema.leads.id, fullName: schema.leads.fullName, phone: schema.leads.phone })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.org.id)))
    .limit(1);
  if (!lead) return { error: 'Lead não encontrado nesta operação.' };

  const phone = normalizePhone(lead.phone);
  if (!phone) return { error: 'O lead não tem telefone com código do país.' };

  const [eventType] = await db
    .select({ title: schema.agendaEventTypes.title })
    .from(schema.agendaEventTypes)
    .where(and(eq(schema.agendaEventTypes.id, eventTypeId), eq(schema.agendaEventTypes.orgId, ctx.org.id)))
    .limit(1);

  let url: string;
  try {
    const link = await createLink(db, { orgId: ctx.org.id, userId: ctx.user.id }, eventTypeId, { leadId, channel: 'whatsapp' });
    url = link.url;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível gerar o link.' };
  }

  const firstName = lead.fullName.split(' ')[0] || lead.fullName;
  const defaultMessage = `Olá, ${firstName}! Aqui está o link para marcar a ${eventType?.title ?? 'reunião'}: ${url}`;
  const message = String(form.get('message') ?? '').trim() || defaultMessage;

  if (ctx.org.isDemo) {
    revalidatePath('/agenda');
    return { ok: 'Demonstração: link gerado e mensagem simulada. Nada foi enviado de verdade.', url };
  }

  const config = akgConfig();
  if (!config) return { error: `O link foi gerado (${url}), mas o WhatsApp não está configurado nesta operação.` };
  try {
    await new AkgGateway(config).sendText(assertWhatsAppAccess(ctx), phone, message);
  } catch (err) {
    return {
      error: `O link foi gerado (${url}), mas o envio falhou: ${err instanceof Error ? err.message : 'tente de novo.'}`,
      url,
    };
  }

  revalidatePath('/agenda');
  return { ok: `Link enviado no WhatsApp de ${lead.fullName}.`, url };
}

// -------------------------------------------------------------- bloqueios

/**
 * Converte o valor do `datetime-local` ("2026-11-12T14:00", hora do fuso
 * escolhido na tela) no instante UTC correspondente.
 */
function parseZonedInput(value: string, timezone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (!Number.isFinite(hour) || hour > 23 || !Number.isFinite(minute) || minute > 59) return null;
  const date = zonedTimeToUtc({ year, month, day, hour, minute, timezone });
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Cria um bloqueio de agenda (compromisso, férias, reunião interna). */
export async function criarBloqueioAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const timezone = String(form.get('timezone') ?? '').trim() || DEFAULT_TIMEZONE;
  const reason = String(form.get('reason') ?? '').trim().slice(0, 200);

  const startAt = parseZonedInput(String(form.get('startAt') ?? ''), timezone);
  if (!startAt) return { error: 'Informe a data e a hora de início do bloqueio.' };
  const endAt = parseZonedInput(String(form.get('endAt') ?? ''), timezone);
  if (!endAt) return { error: 'Informe a data e a hora de fim do bloqueio.' };
  if (endAt.getTime() <= startAt.getTime()) {
    return { error: 'O fim do bloqueio precisa ser depois do início.' };
  }
  const now = Date.now();
  if (startAt.getTime() < now - BLACKOUT_PAST_TOLERANCE_MS) {
    return { error: 'Não é possível criar um bloqueio no passado.' };
  }
  if (endAt.getTime() > now + MAX_BLACKOUT_AHEAD_MS) {
    return { error: 'O bloqueio não pode passar de 1 ano à frente.' };
  }

  try {
    const db = await getDb();
    await db.insert(schema.agendaBlackouts).values({
      orgId: ctx.org.id,
      startAt,
      endAt,
      reason,
    });
    revalidatePath('/agenda');
    return { ok: 'Bloqueio criado. Esse período saiu da agenda pública.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível criar o bloqueio.' };
  }
}

/** Remove um bloqueio: os horários voltam a ficar disponíveis. */
export async function removerBloqueioAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const id = String(form.get('id') ?? '').trim();
  if (!id) return { error: 'Bloqueio não informado.' };

  try {
    const db = await getDb();
    // O filtro por operação impede remover o bloqueio de outra org.
    const deleted = await db
      .delete(schema.agendaBlackouts)
      .where(and(eq(schema.agendaBlackouts.id, id), eq(schema.agendaBlackouts.orgId, ctx.org.id)))
      .returning({ id: schema.agendaBlackouts.id });
    if (!deleted.length) return { error: 'Bloqueio não encontrado nesta operação.' };

    revalidatePath('/agenda');
    return { ok: 'Bloqueio removido. Os horários voltaram a ficar disponíveis.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível remover o bloqueio.' };
  }
}

// ------------------------------------------------------------------ reservas

/** Confirma uma reserva que estava aguardando aprovação. */
export async function confirmarReservaAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const meetingId = String(form.get('meetingId') ?? '').trim();
  if (!meetingId) return { error: 'Reserva não informada.' };

  const db = await getDb();
  const [meeting] = await db
    .select()
    .from(schema.meetings)
    .where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.orgId, ctx.org.id)))
    .limit(1);
  if (!meeting) return { error: 'Reserva não encontrada.' };
  if (meeting.status === 'cancelled') return { error: 'Esta reserva já foi cancelada.' };
  if (meeting.status === 'confirmed') return { ok: 'Esta reserva já está confirmada.' };
  if (!meeting.scheduledAt) return { error: 'Esta reserva ainda não tem horário definido.' };

  try {
    await confirmMeeting(db, { orgId: ctx.org.id, userId: meeting.userId }, meeting.id, meeting.scheduledAt);
    await db.update(schema.meetings).set({ confirmedAt: new Date() }).where(eq(schema.meetings.id, meeting.id));
    revalidatePath('/agenda');
    revalidatePath('/painel');
    revalidatePath('/fila');
    return { ok: 'Reserva confirmada.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível confirmar a reserva.' };
  }
}

/** Cancela uma reserva (libera o horário). */
export async function cancelarReservaAction(_: AgendaActionState, form: FormData): Promise<AgendaActionState> {
  const ctx = await requireOrg();
  const meetingId = String(form.get('meetingId') ?? '').trim();
  if (!meetingId) return { error: 'Reserva não informada.' };

  const db = await getDb();
  const updated = await db
    .update(schema.meetings)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(
      and(
        eq(schema.meetings.id, meetingId),
        eq(schema.meetings.orgId, ctx.org.id),
        sql`${schema.meetings.status} in ('requested','confirmed')`,
      ),
    )
    .returning({ id: schema.meetings.id });
  if (!updated.length) return { error: 'A reserva não existe ou já está cancelada.' };

  revalidatePath('/agenda');
  revalidatePath('/painel');
  revalidatePath('/fila');
  return { ok: 'Reserva cancelada e horário liberado.' };
}

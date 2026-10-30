'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { createMeeting, sendMeetingInvite } from '@/lib/agenda';

export type AgendaState = { error?: string; ok?: string };

const createSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título da reunião.').max(120),
  requesterName: z.string().trim().min(2, 'Informe o nome do convidado.').max(120),
  requesterEmail: z.string().trim().email('E-mail do convidado inválido.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Informe a hora.'),
  durationMin: z.coerce.number().int().min(10).max(180),
  leadId: z.string().uuid().optional().or(z.literal('')).transform((v) => (v || undefined)),
});

export async function createMeetingAction(_prev: AgendaState | undefined, formData: FormData): Promise<AgendaState> {
  const ctx = await requireOrg();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = parsed.data;
  const slot = new Date(`${d.date}T${d.time}:00`); // horário local do servidor (America/Sao_Paulo)
  if (Number.isNaN(slot.getTime())) return { error: 'Data ou hora inválida.' };
  const db = await getDb();
  const meeting = await createMeeting(db, ctx.org.id, ctx.user.id, {
    title: d.title, requesterName: d.requesterName, requesterEmail: d.requesterEmail, slot, durationMin: d.durationMin, leadId: d.leadId ?? null,
  });
  const result = await sendMeetingInvite(db, meeting, { isDemo: ctx.org.isDemo, mailbox: await senderMailbox(db, ctx.org.id) });
  revalidatePath('/agenda');
  return { ok: 'Reunião solicitada' + (result === 'queued' ? '. Convite .ics na fila (simulado).' : result === 'sent' ? '. Invite .ics enviado.' : '. O e-mail falhou — veja o erro na lista.') };
}

export async function confirmMeetingAction(id: string): Promise<void> {
  const ctx = await requireOrg();
  const db = await getDb();
  await db.update(schema.meetings).set({ status: 'confirmed' }).where(and(eq(schema.meetings.id, id), eq(schema.meetings.orgId, ctx.org.id)));
  revalidatePath('/agenda');
}

export async function cancelMeetingAction(id: string): Promise<void> {
  const ctx = await requireOrg();
  const db = await getDb();
  await db.update(schema.meetings).set({ status: 'cancelled' }).where(and(eq(schema.meetings.id, id), eq(schema.meetings.orgId, ctx.org.id)));
  revalidatePath('/agenda');
}

export async function resendInviteAction(id: string): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireOrg();
  const db = await getDb();
  const [m] = await db.select().from(schema.meetings).where(and(eq(schema.meetings.id, id), eq(schema.meetings.orgId, ctx.org.id)));
  if (!m) return { error: 'Reunião não encontrada.' };
  const result = await sendMeetingInvite(db, m, { isDemo: ctx.org.isDemo, mailbox: await senderMailbox(db, ctx.org.id) });
  revalidatePath('/agenda');
  return result === 'error' ? { error: 'O envio falhou novamente — confira o erro registrado.' } : { ok: 'Convite reenviado.' };
}

async function senderMailbox(db: Awaited<ReturnType<typeof getDb>>, orgId: string): Promise<string | null> {
  const [s] = await db.select({ senderEmail: schema.orgSettings.senderEmail }).from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  return s?.senderEmail ?? null;
}

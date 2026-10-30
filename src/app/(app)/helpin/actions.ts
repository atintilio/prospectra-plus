'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';

export type HelpinState = { error?: string; ok?: string } | undefined;

const replySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, 'Escreva a resposta.').max(4000),
});

const createSchema = z.object({
  contactName: z.string().trim().min(2, 'Informe o nome do contato.').max(120),
  subject: z.string().trim().max(140).default(''),
  firstMessage: z.string().trim().max(4000).default(''),
  leadId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
});

async function settingsOf(db: Awaited<ReturnType<typeof getDb>>, orgId: string) {
  const [s] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, orgId));
  return s;
}

function insideAtendimento(start: string, end: string, now = new Date()): boolean {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const t = now.getHours() * 60 + now.getMinutes();
  return t >= sh * 60 + sm && t <= eh * 60 + em;
}

/** Cria conversa com a primeira mensagem do contato. Na demo, tudo é local. */
export async function createConversationAction(_prev: HelpinState, formData: FormData): Promise<HelpinState> {
  const ctx = await requireOrg();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const db = await getDb();
  const first = parsed.data.firstMessage || 'Contato iniciou a conversa.';
  const [conv] = await db.insert(schema.helpinConversations).values({
    orgId: ctx.org.id, subject: parsed.data.subject, contactName: parsed.data.contactName,
    leadId: parsed.data.leadId ?? null, channel: 'helpin', status: 'open',
  }).returning();
  await db.insert(schema.helpinMessages).values({ orgId: ctx.org.id, conversationId: conv.id, sender: 'contact', body: first });
  revalidatePath('/helpin');
  return { ok: `Conversa de ${parsed.data.contactName} aberta.` };
}

/**
 * Resposta da equipe. Demo: grava a mensagem como SIMULADA (nada vai por WhatsApp ou e-mail).
 * Produção: registra a resposta localmente; fallback da autorresposta fora do horário de atendimento.
 */
export async function replyAction(_prev: HelpinState, formData: FormData): Promise<HelpinState> {
  const ctx = await requireOrg();
  const parsed = replySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const db = await getDb();
  const [conv] = await db.select().from(schema.helpinConversations)
    .where(and(eq(schema.helpinConversations.id, parsed.data.conversationId), eq(schema.helpinConversations.orgId, ctx.org.id)));
  if (!conv) return { error: 'Conversa não encontrada.' };
  if (conv.status === 'closed') return { error: 'A conversa está encerrada. Reabra para responder.' };
  await db.insert(schema.helpinMessages).values({
    orgId: ctx.org.id, conversationId: conv.id, sender: 'agent',
    body: parsed.data.body, simulated: ctx.org.isDemo,
  });
  const s = await settingsOf(db, ctx.org.id);
  if (s?.autoReply && !insideAtendimento(s.atendimentoStart, s.atendimentoEnd)) {
    await db.insert(schema.helpinMessages).values({
      orgId: ctx.org.id, conversationId: conv.id, sender: 'agent',
      body: `[Autoresposta enviada às ${s.atendimentoStart}–${s.atendimentoEnd}] ${s.autoReply}`, simulated: true,
    });
  }
  await db.update(schema.helpinConversations).set({ lastMessageAt: new Date() }).where(eq(schema.helpinConversations.id, conv.id));
  revalidatePath('/helpin');
  return { ok: ctx.org.isDemo ? 'Resposta simulada (demo): nada foi enviado por WhatsApp/e-mail.' : 'Resposta registrada.' };
}

export async function assignConversationAction(id: string, assigneeId: string | null): Promise<void> {
  const ctx = await requireOrg();
  const db = await getDb();
  await db.update(schema.helpinConversations).set({ assigneeId })
    .where(and(eq(schema.helpinConversations.id, id), eq(schema.helpinConversations.orgId, ctx.org.id)));
  revalidatePath('/helpin');
}

export async function closeConversationAction(id: string, next: 'open' | 'closed'): Promise<void> {
  const ctx = await requireOrg();
  const db = await getDb();
  await db.update(schema.helpinConversations).set({ status: next })
    .where(and(eq(schema.helpinConversations.id, id), eq(schema.helpinConversations.orgId, ctx.org.id)));
  revalidatePath('/helpin');
}

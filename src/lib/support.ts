import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DB } from '@/db';
import type { Scope } from '@/lib/whatsapp/akg';

// Suporte nativo (Helpin fase 1). Fronteira de confiança: toda entrada é validada aqui.
const bodySchema = z.string().trim().min(1).max(4000);
const nameSchema = z.string().trim().max(120);
const emailSchema = z.string().trim().email().max(200);
const subjectSchema = z.string().trim().min(1).max(120);

export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try { const u = new URL(raw); return `${u.protocol}//${u.host}`; } catch { return null; }
}

export async function originAllowed(db: DB, orgId: string, origin: string | null): Promise<boolean> {
  const o = normalizeOrigin(origin);
  if (!o) return false; // sem origem liberada, o widget recusa (como no Helpin)
  const [row] = await db.select({ id: schema.supportWidgetOrigins.id }).from(schema.supportWidgetOrigins)
    .where(and(eq(schema.supportWidgetOrigins.orgId, orgId), eq(schema.supportWidgetOrigins.origin, o)));
  return Boolean(row);
}

export async function addWidgetOrigin(db: DB, orgId: string, origin: string): Promise<void> {
  const o = normalizeOrigin(origin);
  if (!o) throw new Error('Origem inválida (use o esquema e o host, ex.: https://site.com).');
  await db.insert(schema.supportWidgetOrigins).values({ orgId, origin: o }).onConflictDoNothing();
}

/** Entrada do widget web. Só aceita de uma origem liberada; cria ou anexa à conversa. */
export async function intakeWebMessage(
  db: DB,
  input: { orgId: string; origin: string | null; conversationId?: string; visitorName?: string; visitorEmail?: string; body: string },
): Promise<{ conversationId: string }> {
  if (!(await originAllowed(db, input.orgId, input.origin))) throw new Error('ORIGIN_NOT_ALLOWED');
  const body = bodySchema.parse(input.body);
  const name = input.visitorName ? nameSchema.parse(input.visitorName) : '';
  const email = input.visitorEmail ? emailSchema.parse(input.visitorEmail) : '';
  return db.transaction(async (tx) => {
    let convId = input.conversationId;
    if (convId) {
      const [c] = await tx.select({ id: schema.supportConversations.id }).from(schema.supportConversations)
        .where(and(eq(schema.supportConversations.id, convId), eq(schema.supportConversations.orgId, input.orgId)));
      if (!c) convId = undefined; // id de outra operação/ inexistente: começa uma nova
    }
    if (!convId) {
      const [c] = await tx.insert(schema.supportConversations)
        .values({ orgId: input.orgId, audience: 'customer', channel: 'web', subject: body.slice(0, 80), visitorName: name, visitorEmail: email })
        .returning({ id: schema.supportConversations.id });
      convId = c.id;
    } else {
      await tx.update(schema.supportConversations).set({ status: 'open', lastMessageAt: new Date() }).where(eq(schema.supportConversations.id, convId));
    }
    await tx.insert(schema.supportMessages).values({ conversationId: convId, author: 'visitor', body });
    return { conversationId: convId };
  });
}

/** Chamado interno: usuário do Prospectra+ ↔ suporte Argus. */
export async function openInternalTicket(
  db: DB,
  actor: Scope & { email: string; name: string },
  input: { subject: string; body: string },
): Promise<{ conversationId: string }> {
  const body = bodySchema.parse(input.body);
  const subject = subjectSchema.parse(input.subject);
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(schema.supportConversations)
      .values({ orgId: actor.orgId, audience: 'product', channel: 'internal', subject, visitorName: actor.name, visitorEmail: actor.email })
      .returning({ id: schema.supportConversations.id });
    await tx.insert(schema.supportMessages).values({ conversationId: c.id, author: 'visitor', authorUserId: actor.userId, body });
    return { conversationId: c.id };
  });
}

export async function replyToConversation(db: DB, scope: Scope, conversationId: string, body: string): Promise<void> {
  const text = bodySchema.parse(body);
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.supportConversations)
      .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.orgId, scope.orgId))).for('update');
    if (!c) throw new Error('Conversa não encontrada.');
    await tx.insert(schema.supportMessages).values({ conversationId, author: 'agent', authorUserId: scope.userId, body: text });
    await tx.update(schema.supportConversations).set({ status: 'open', lastMessageAt: new Date(), assignedTo: c.assignedTo ?? scope.userId }).where(eq(schema.supportConversations.id, conversationId));
  });
}

export async function setConversationStatus(db: DB, scope: Scope, conversationId: string, status: 'open' | 'closed'): Promise<void> {
  await db.update(schema.supportConversations).set({ status })
    .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.orgId, scope.orgId)));
}

export async function listInbox(db: DB, orgId: string, status: 'open' | 'closed' = 'open') {
  return db.select().from(schema.supportConversations)
    .where(and(eq(schema.supportConversations.orgId, orgId), eq(schema.supportConversations.status, status)))
    .orderBy(desc(schema.supportConversations.lastMessageAt)).limit(100);
}

export async function conversationThread(db: DB, scope: Scope, conversationId: string) {
  const [conversation] = await db.select().from(schema.supportConversations)
    .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.orgId, scope.orgId)));
  if (!conversation) return null;
  const messages = await db.select().from(schema.supportMessages)
    .where(eq(schema.supportMessages.conversationId, conversationId)).orderBy(schema.supportMessages.createdAt);
  return { conversation, messages };
}

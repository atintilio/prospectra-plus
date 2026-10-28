import 'server-only';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DB } from '@/db';
import type { Scope } from '@/lib/whatsapp/akg';
import type { Role } from '@/lib/auth';

type InboxScope = Scope & { role: Role };
const inboxAccess = (scope: InboxScope) => and(
  eq(schema.supportConversations.orgId, scope.orgId),
  eq(schema.supportConversations.audience, 'customer'),
  ...(scope.role === 'owner' || scope.role === 'manager' ? [] : [eq(schema.supportConversations.assignedTo, scope.userId)]),
);

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
  const result = await db.transaction(async (tx) => {
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
  if (email) await linkConversationToLead(db, input.orgId, result.conversationId, { email }).catch(() => null);
  return result;
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

export async function replyToConversation(db: DB, scope: InboxScope, conversationId: string, body: string): Promise<void> {
  const text = bodySchema.parse(body);
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.supportConversations)
      .where(and(eq(schema.supportConversations.id, conversationId), inboxAccess(scope))).for('update');
    if (!c) throw new Error('Conversa não encontrada.');
    await tx.insert(schema.supportMessages).values({ conversationId, author: 'agent', authorUserId: scope.userId, body: text });
    await tx.update(schema.supportConversations).set({ status: 'open', lastMessageAt: new Date(), assignedTo: c.assignedTo ?? scope.userId }).where(eq(schema.supportConversations.id, conversationId));
  });
}

export async function setConversationStatus(db: DB, scope: InboxScope, conversationId: string, status: 'open' | 'closed'): Promise<void> {
  await db.update(schema.supportConversations).set({ status })
    .where(and(eq(schema.supportConversations.id, conversationId), inboxAccess(scope)));
}

export async function assignConversation(db: DB, scope: InboxScope, conversationId: string, assigneeId: string | null): Promise<void> {
  if (scope.role !== 'owner' && scope.role !== 'manager') throw new Error('Sem permissão para atribuir conversas.');
  if (assigneeId) {
    const [member] = await db.select({ id: schema.memberships.userId }).from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.orgId, scope.orgId), eq(schema.memberships.userId, assigneeId), eq(schema.users.status, 'active')));
    if (!member) throw new Error('Responsável não pertence a esta operação.');
  }
  await db.update(schema.supportConversations).set({ assignedTo: assigneeId })
    .where(and(eq(schema.supportConversations.id, conversationId), inboxAccess(scope)));
}

export async function listInbox(db: DB, scope: InboxScope, status: 'open' | 'closed' = 'open') {
  return db.select().from(schema.supportConversations)
    .where(and(inboxAccess(scope), eq(schema.supportConversations.status, status)))
    .orderBy(desc(schema.supportConversations.lastMessageAt)).limit(100);
}

export async function conversationThread(db: DB, scope: InboxScope, conversationId: string) {
  const [conversation] = await db.select().from(schema.supportConversations)
    .where(and(eq(schema.supportConversations.id, conversationId), inboxAccess(scope)));
  if (!conversation) return null;
  const messages = await db.select().from(schema.supportMessages)
    .where(eq(schema.supportMessages.conversationId, conversationId)).orderBy(schema.supportMessages.createdAt);
  return { conversation, messages };
}

/** Leitura pública para o widget: só os campos seguros das mensagens da conversa. */
export async function publicConversationMessages(db: DB, orgId: string, conversationId: string): Promise<{ author: string; body: string; at: string }[] | null> {
  const [c] = await db.select({ id: schema.supportConversations.id }).from(schema.supportConversations)
    .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.orgId, orgId)));
  if (!c) return null;
  const msgs = await db.select({ author: schema.supportMessages.author, body: schema.supportMessages.body, at: schema.supportMessages.createdAt })
    .from(schema.supportMessages).where(eq(schema.supportMessages.conversationId, conversationId)).orderBy(schema.supportMessages.createdAt);
  return msgs.map((m) => ({ author: m.author, body: m.body, at: m.at.toISOString() }));
}

const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).transform((v) => v.replace(/^\+/, ''));

/** Merge de CRM: liga a conversa ao lead que casa por email/telefone e preenche o contato do lead. */
export async function linkConversationToLead(db: DB, orgId: string, conversationId: string, contact: { email?: string; phone?: string }): Promise<string | null> {
  const email = (contact.email ?? '').trim().toLowerCase();
  const phone = (contact.phone ?? '').replace(/\D/g, '');
  const matchers = [];
  if (email) matchers.push(eq(schema.leads.email, email));
  if (phone) matchers.push(eq(schema.leads.phone, phone));
  if (!matchers.length) return null;
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.orgId, orgId), or(...matchers))).limit(1);
  if (!lead) return null;
  await db.update(schema.supportConversations).set({ leadId: lead.id, assignedTo: sql`coalesce(${schema.supportConversations.assignedTo}, ${lead.ownerId}::uuid)` })
    .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.orgId, orgId), eq(schema.supportConversations.audience, 'customer')));
  // preenche contato ausente no lead a partir do que o suporte trouxe
  const fill: Record<string, string> = {};
  if (email && !lead.email) fill.email = email;
  if (phone && !lead.phone) fill.phone = phone;
  if (Object.keys(fill).length) await db.update(schema.leads).set(fill).where(eq(schema.leads.id, lead.id));
  return lead.id;
}

/** Entrada por WhatsApp (via WA-AKG). Agrupa por telefone na conversa aberta e deduplica por providerId. */
export async function intakeWhatsappMessage(
  db: DB,
  input: { orgId: string; phone: string; name?: string; body: string; providerId: string },
): Promise<{ conversationId: string; deduped: boolean }> {
  const body = bodySchema.parse(input.body);
  const phone = phoneSchema.parse(input.phone);
  const name = input.name ? nameSchema.parse(input.name) : '';
  const providerId = z.string().trim().min(1).max(200).parse(input.providerId);
  const r = await db.transaction(async (tx) => {
    const [dup] = await tx.select({ conversationId: schema.supportMessages.conversationId }).from(schema.supportMessages)
      .where(eq(schema.supportMessages.providerId, providerId));
    if (dup) return { conversationId: dup.conversationId, deduped: true }; // retry do gateway

    let [conv] = await tx.select().from(schema.supportConversations)
      .where(and(eq(schema.supportConversations.orgId, input.orgId), eq(schema.supportConversations.visitorPhone, phone), eq(schema.supportConversations.status, 'open')))
      .orderBy(desc(schema.supportConversations.lastMessageAt)).limit(1);
    if (!conv) {
      [conv] = await tx.insert(schema.supportConversations)
        .values({ orgId: input.orgId, audience: 'customer', channel: 'whatsapp', subject: body.slice(0, 80), visitorName: name, visitorPhone: phone })
        .returning();
    }
    const [inserted] = await tx.insert(schema.supportMessages)
      .values({ conversationId: conv.id, author: 'visitor', body, providerId }).onConflictDoNothing().returning({ id: schema.supportMessages.id });
    if (!inserted) return { conversationId: conv.id, deduped: true }; // corrida: outro processo já gravou
    await tx.update(schema.supportConversations).set({ status: 'open', lastMessageAt: new Date() }).where(eq(schema.supportConversations.id, conv.id));
    return { conversationId: conv.id, deduped: false };
  });
  if (!r.deduped) await linkConversationToLead(db, input.orgId, r.conversationId, { phone }).catch(() => null);
  return r;
}

// ---- Suporte interno (audience 'product') roteado ao Argus: acesso de admin, cross-org ----

export async function listProductTickets(db: DB, status: 'open' | 'closed' = 'open') {
  return db.select({ c: schema.supportConversations, orgName: schema.orgs.name })
    .from(schema.supportConversations).innerJoin(schema.orgs, eq(schema.orgs.id, schema.supportConversations.orgId))
    .where(and(eq(schema.supportConversations.audience, 'product'), eq(schema.supportConversations.status, status)))
    .orderBy(desc(schema.supportConversations.lastMessageAt)).limit(100);
}

export async function adminProductThread(db: DB, conversationId: string) {
  const [conversation] = await db.select().from(schema.supportConversations)
    .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.audience, 'product')));
  if (!conversation) return null;
  const messages = await db.select().from(schema.supportMessages)
    .where(eq(schema.supportMessages.conversationId, conversationId)).orderBy(schema.supportMessages.createdAt);
  return { conversation, messages };
}

/** Resposta do Argus a um chamado interno. Só para admin de plataforma (sem escopo de operação). */
export async function adminReplyProduct(db: DB, adminUserId: string, conversationId: string, body: string): Promise<{ to: string }> {
  const text = bodySchema.parse(body);
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.supportConversations)
      .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.audience, 'product'))).for('update');
    if (!c) throw new Error('Chamado não encontrado.');
    await tx.insert(schema.supportMessages).values({ conversationId, author: 'agent', authorUserId: adminUserId, body: text });
    await tx.update(schema.supportConversations).set({ status: 'open', lastMessageAt: new Date(), assignedTo: c.assignedTo ?? adminUserId }).where(eq(schema.supportConversations.id, conversationId));
    return { to: c.visitorEmail };
  });
}

export async function adminSetProductStatus(db: DB, conversationId: string, status: 'open' | 'closed'): Promise<void> {
  await db.update(schema.supportConversations).set({ status })
    .where(and(eq(schema.supportConversations.id, conversationId), eq(schema.supportConversations.audience, 'product')));
}

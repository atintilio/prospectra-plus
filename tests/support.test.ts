import { test, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema } from '@/db';
import {
  normalizeOrigin, originAllowed, addWidgetOrigin, intakeWebMessage,
  replyToConversation, setConversationStatus, conversationThread, openInternalTicket,
} from '@/lib/support';

test('normalizeOrigin reduz a esquema+host e rejeita lixo', () => {
  expect(normalizeOrigin('https://site.com/path?x=1')).toBe('https://site.com');
  expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  expect(normalizeOrigin('nao-url')).toBeNull();
  expect(normalizeOrigin(null)).toBeNull();
});

test('o widget recusa origem não liberada e aceita a liberada', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Sup A');
  expect(await originAllowed(db, a.org.id, 'https://site.com')).toBe(false);
  await expect(intakeWebMessage(db, { orgId: a.org.id, origin: 'https://site.com', body: 'oi' })).rejects.toThrow('ORIGIN_NOT_ALLOWED');
  await addWidgetOrigin(db, a.org.id, 'https://site.com/qualquer');
  expect(await originAllowed(db, a.org.id, 'https://site.com')).toBe(true);
  const { conversationId } = await intakeWebMessage(db, { orgId: a.org.id, origin: 'https://site.com', visitorName: 'Cliente', body: 'tenho uma dúvida' });
  const convs = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.orgId, a.org.id));
  expect(convs).toHaveLength(1);
  expect(convs[0].channel).toBe('web');
  expect(convs[0].audience).toBe('customer');
  // mesma conversa ao reusar o id
  await intakeWebMessage(db, { orgId: a.org.id, origin: 'https://site.com', conversationId, body: 'segunda mensagem' });
  const msgs = await db.select().from(schema.supportMessages).where(eq(schema.supportMessages.conversationId, conversationId));
  expect(msgs).toHaveLength(2);
  expect(msgs.every((m) => m.author === 'visitor')).toBe(true);
});

test('responder adiciona mensagem de agente e respeita isolamento por operação', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Sup B');
  const b = await seedOrg(db, 'Sup C');
  await addWidgetOrigin(db, a.org.id, 'https://a.com');
  const { conversationId } = await intakeWebMessage(db, { orgId: a.org.id, origin: 'https://a.com', body: 'preciso de ajuda' });
  await replyToConversation(db, { orgId: a.org.id, userId: a.user.id }, conversationId, 'claro, como posso ajudar?');
  const thread = await conversationThread(db, { orgId: a.org.id, userId: a.user.id }, conversationId);
  expect(thread!.messages).toHaveLength(2);
  expect(thread!.messages[1].author).toBe('agent');
  expect(thread!.messages[1].authorUserId).toBe(a.user.id);
  // outra operação não acessa nem responde
  await expect(replyToConversation(db, { orgId: b.org.id, userId: b.user.id }, conversationId, 'xeretando')).rejects.toThrow();
  expect(await conversationThread(db, { orgId: b.org.id, userId: b.user.id }, conversationId)).toBeNull();
});

test('fechar e reabrir muda o status; chamado interno nasce como product/internal', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'Sup D');
  const scope = { orgId: a.org.id, userId: a.user.id };
  await addWidgetOrigin(db, a.org.id, 'https://a.com');
  const { conversationId } = await intakeWebMessage(db, { orgId: a.org.id, origin: 'https://a.com', body: 'oi' });
  await setConversationStatus(db, scope, conversationId, 'closed');
  expect((await conversationThread(db, scope, conversationId))!.conversation.status).toBe('closed');
  await setConversationStatus(db, scope, conversationId, 'open');
  expect((await conversationThread(db, scope, conversationId))!.conversation.status).toBe('open');

  const t = await openInternalTicket(db, { ...scope, email: 'u@x.com', name: 'Usuário' }, { subject: 'Erro ao entrar', body: 'não consigo logar' });
  const [c] = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.id, t.conversationId));
  expect(c.audience).toBe('product');
  expect(c.channel).toBe('internal');
});

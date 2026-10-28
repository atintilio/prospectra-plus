import { test, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema } from '@/db';
import { intakeWhatsappMessage } from '@/lib/support';

test('WhatsApp: agrupa por telefone na conversa aberta e deduplica por providerId', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'WA Sup');
  const base = { orgId: a.org.id, phone: '5511988887777', name: 'Cliente' };

  const first = await intakeWhatsappMessage(db, { ...base, body: 'oi, preciso de ajuda', providerId: 'wamid.1' });
  expect(first.deduped).toBe(false);

  // retry do gateway com o MESMO providerId → não duplica
  const retry = await intakeWhatsappMessage(db, { ...base, body: 'oi, preciso de ajuda', providerId: 'wamid.1' });
  expect(retry.deduped).toBe(true);
  expect(retry.conversationId).toBe(first.conversationId);

  // nova mensagem do mesmo telefone → mesma conversa aberta
  const second = await intakeWhatsappMessage(db, { ...base, body: 'segunda', providerId: 'wamid.2' });
  expect(second.deduped).toBe(false);
  expect(second.conversationId).toBe(first.conversationId);

  const convs = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.orgId, a.org.id));
  expect(convs).toHaveLength(1);
  expect(convs[0].channel).toBe('whatsapp');
  expect(convs[0].visitorPhone).toBe('5511988887777');
  const msgs = await db.select().from(schema.supportMessages).where(eq(schema.supportMessages.conversationId, first.conversationId));
  expect(msgs).toHaveLength(2); // o retry não gerou mensagem
});

test('WhatsApp: telefone diferente abre outra conversa', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'WA Sup 2');
  const x = await intakeWhatsappMessage(db, { orgId: a.org.id, phone: '5511900000001', body: 'a', providerId: 'p1' });
  const y = await intakeWhatsappMessage(db, { orgId: a.org.id, phone: '5511900000002', body: 'b', providerId: 'p2' });
  expect(y.conversationId).not.toBe(x.conversationId);
  const convs = await db.select().from(schema.supportConversations).where(eq(schema.supportConversations.orgId, a.org.id));
  expect(convs).toHaveLength(2);
});

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema } from '@/db';
import { addPrivateNote, conversationThread, publicConversationMessages } from '@/lib/support';
import { seedOrg, testDb } from './helpers';

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const [mate] = await db.insert(schema.users).values({ email: 'colega@x.com', name: 'Colega', status: 'active' }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: mate.id, role: 'member' });
  const [conv] = await db.insert(schema.supportConversations).values({ orgId: org.id, subject: 'Ajuda', visitorName: 'Cliente' }).returning();
  await db.insert(schema.supportMessages).values({ conversationId: conv.id, author: 'visitor', body: 'olá' });
  const scope = { orgId: org.id, userId: user.id, role: 'owner' as const };
  return { db, org, scope, conv, mate };
}

describe('notas internas + menções', () => {
  it('menciona só membros ativos, aparece na inbox e NUNCA no público', async () => {
    const { db, scope, conv, mate } = await setup();
    const res = await addPrivateNote(db, scope, conv.id, 'cuidado com esse cliente', [mate.id, randomUUID()]);
    expect(res.mentioned.map((m) => m.id)).toEqual([mate.id]); // id não-membro é descartado

    const thread = await conversationThread(db, scope, conv.id);
    const note = thread!.messages.find((m) => m.private);
    expect(note?.body).toBe('cuidado com esse cliente');
    expect(note?.mentions).toEqual([mate.id]);

    // o widget/WhatsApp (público) só vê a mensagem do visitante, nunca a nota
    const pub = await publicConversationMessages(db, scope.orgId, conv.id);
    expect(pub!.map((m) => m.body)).toEqual(['olá']);
  });

  it('não adiciona nota em conversa de outra operação', async () => {
    const { db, conv } = await setup();
    const other = await seedOrg(db, 'Parceiro B');
    await expect(addPrivateNote(db, { orgId: other.org.id, userId: other.user.id, role: 'owner' }, conv.id, 'x', [])).rejects.toThrow();
  });
});

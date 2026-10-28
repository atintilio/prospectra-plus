import { describe, expect, it } from 'vitest';
import { schema } from '@/db';
import { listInbox, listOrgLabels, setConversationLabels } from '@/lib/support';
import { seedOrg, testDb } from './helpers';

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db);
  const [conv] = await db.insert(schema.supportConversations).values({ orgId: org.id, subject: 'Ajuda', visitorName: 'Cliente' }).returning();
  const scope = { orgId: org.id, userId: user.id, role: 'owner' as const };
  return { db, scope, conv };
}

describe('etiquetas de suporte', () => {
  it('define (dedup), filtra a inbox e lista o catálogo', async () => {
    const { db, scope, conv } = await setup();
    expect(await setConversationLabels(db, scope, conv.id, ['vip', 'urgente', 'vip'])).toEqual(['vip', 'urgente']);

    expect((await listInbox(db, scope, 'open', 'vip')).map((c) => c.id)).toEqual([conv.id]);
    expect(await listInbox(db, scope, 'open', 'inexistente')).toHaveLength(0);
    expect(await listInbox(db, scope, 'open')).toHaveLength(1); // sem filtro, traz tudo
    expect(await listOrgLabels(db, scope)).toEqual(['urgente', 'vip']);
  });

  it('valida limite de 10 etiquetas e tamanho ≤30', async () => {
    const { db, scope, conv } = await setup();
    await expect(setConversationLabels(db, scope, conv.id, [Array(31).fill('x').join('')])).rejects.toThrow();
    await expect(setConversationLabels(db, scope, conv.id, Array.from({ length: 11 }, (_, i) => `e${i}`))).rejects.toThrow();
  });

  it('não altera conversa de outra operação', async () => {
    const { db, conv } = await setup();
    const other = await seedOrg(db, 'Parceiro B');
    await expect(setConversationLabels(db, { orgId: other.org.id, userId: other.user.id, role: 'owner' }, conv.id, ['x'])).rejects.toThrow();
  });
});

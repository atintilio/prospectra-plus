import { test, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema } from '@/db';
import { slugify, upsertArticle, setArticleStatus, searchPublished, getPublishedBySlug, listArticles } from '@/lib/help';
import { addWidgetOrigin, intakeWebMessage, replyToConversation, publicConversationMessages } from '@/lib/support';

test('slugify remove acentos e normaliza', () => {
  expect(slugify('Como configurar o Aplicativo?')).toBe('como-configurar-o-aplicativo');
  expect(slugify('   ')).toBe('artigo');
});

test('upsert cria com slug único, atualiza por id; busca só vê publicados', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'KB A');
  const a1 = await upsertArticle(db, a.org.id, { title: 'Reembolso', body: 'como pedir reembolso' });
  const a2 = await upsertArticle(db, a.org.id, { title: 'Reembolso', body: 'outro' });
  expect(a1.slug).toBe('reembolso');
  expect(a2.slug).toBe('reembolso-2'); // slug único por operação

  const upd = await upsertArticle(db, a.org.id, { id: a1.id, title: 'Reembolso e troca', body: 'passo a passo do reembolso' });
  expect(upd.id).toBe(a1.id);
  expect(upd.title).toBe('Reembolso e troca');

  expect(await searchPublished(db, a.org.id)).toHaveLength(0); // ainda rascunhos
  await setArticleStatus(db, a.org.id, a1.id, 'published');
  const pub = await searchPublished(db, a.org.id);
  expect(pub).toHaveLength(1);
  expect((await searchPublished(db, a.org.id, 'reembolso')).length).toBe(1); // ILIKE no corpo
  expect((await searchPublished(db, a.org.id, 'inexistente')).length).toBe(0);
  expect(await getPublishedBySlug(db, a.org.id, a1.slug)).not.toBeNull();
  expect(await getPublishedBySlug(db, a.org.id, a2.slug)).toBeNull(); // a2 é rascunho
  expect(await listArticles(db, a.org.id)).toHaveLength(2);
});

test('leitura pública do widget devolve campos seguros e respeita a operação', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'KB B');
  const b = await seedOrg(db, 'KB C');
  await addWidgetOrigin(db, a.org.id, 'https://site.com');
  const { conversationId } = await intakeWebMessage(db, { orgId: a.org.id, origin: 'https://site.com', body: 'dúvida' });
  await replyToConversation(db, { orgId: a.org.id, userId: a.user.id, role: 'owner' }, conversationId, 'resposta do agente');
  const msgs = await publicConversationMessages(db, a.org.id, conversationId);
  expect(msgs).toHaveLength(2);
  expect(msgs![0]).toEqual({ author: 'visitor', body: 'dúvida', at: expect.any(String) });
  expect(msgs![1].author).toBe('agent');
  expect(await publicConversationMessages(db, b.org.id, conversationId)).toBeNull(); // outra operação não lê
});

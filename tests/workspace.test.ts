import { test, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema } from '@/db';
import { listDocs, upsertDoc, deleteDoc, listTasks, createTask, setTaskStatus, assignTask, deleteTask } from '@/lib/workspace';

test('docs: cria, atualiza por id, lista e exclui', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'WS A');
  const d = await upsertDoc(db, a.org.id, a.user.id, { title: 'Onboarding', body: 'passo 1' });
  expect(d.authorId).toBe(a.user.id);
  const upd = await upsertDoc(db, a.org.id, a.user.id, { id: d.id, title: 'Onboarding v2', body: 'passo 1 e 2' });
  expect(upd.title).toBe('Onboarding v2');
  expect(await listDocs(db, a.org.id)).toHaveLength(1);
  await deleteDoc(db, a.org.id, d.id);
  expect(await listDocs(db, a.org.id)).toHaveLength(0);
});

test('docs: título vazio é rejeitado; outra operação não atualiza', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'WS B');
  const b = await seedOrg(db, 'WS C');
  await expect(upsertDoc(db, a.org.id, a.user.id, { title: '  ', body: 'x' })).rejects.toThrow();
  const d = await upsertDoc(db, a.org.id, a.user.id, { title: 'Doc', body: 'x' });
  await expect(upsertDoc(db, b.org.id, b.user.id, { id: d.id, title: 'invadido', body: 'x' })).rejects.toThrow('não encontrado');
});

test('tarefas: criar, mover status, atribuir e excluir, isoladas por operação', async () => {
  const db = await testDb();
  const a = await seedOrg(db, 'WS D');
  const b = await seedOrg(db, 'WS E');
  const t = await createTask(db, a.org.id, { title: 'Ligar para o lead' });
  expect(t.status).toBe('todo');
  await setTaskStatus(db, a.org.id, t.id, 'doing');
  await assignTask(db, a.org.id, t.id, a.user.id);
  const [after] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, t.id));
  expect(after.status).toBe('doing');
  expect(after.assignedTo).toBe(a.user.id);

  // operação B não vê nem altera a tarefa de A
  expect(await listTasks(db, b.org.id)).toHaveLength(0);
  await setTaskStatus(db, b.org.id, t.id, 'done');
  const [unchanged] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, t.id));
  expect(unchanged.status).toBe('doing');

  await deleteTask(db, a.org.id, t.id);
  expect(await listTasks(db, a.org.id)).toHaveLength(0);
});

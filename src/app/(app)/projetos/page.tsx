import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { listTasks } from '@/lib/workspace';
import { Board } from './board';

export const metadata = { title: 'Projetos' };

export default async function ProjetosPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const tasks = (await listTasks(db, ctx.org.id)).map((t) => ({ id: t.id, title: t.title, status: t.status, assignedTo: t.assignedTo }));
  const members = (await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, ctx.org.id)))
    .map((m) => ({ id: m.id, name: m.name || '—' }));
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Projetos" subtitle="Tarefas da equipe: a fazer, fazendo, feito." />
      <Board tasks={tasks} members={members} />
    </>
  );
}

import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { canManage, requireOrg } from '@/lib/auth';
import { mailerConfigured } from '@/lib/mailer';
import { PageHeader } from '@/components/ui';
import { TeamView } from './team-view';

export const metadata = { title: 'Equipe' };

export default async function EquipePage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const members = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, status: schema.users.status, role: schema.memberships.role })
    .from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, ctx.org.id)).orderBy(asc(schema.users.name));
  return (
    <>
      <PageHeader title="Equipe" subtitle={`${members.length} de ${ctx.org.seats} usuários em ${ctx.org.name}`} />
      <TeamView members={members} me={ctx.user.id} myRole={ctx.role} canManage={canManage(ctx.role)} mailOk={mailerConfigured()} />
    </>
  );
}

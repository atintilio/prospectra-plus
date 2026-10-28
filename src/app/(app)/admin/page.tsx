import { asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireAdmin } from '@/lib/auth';
import { canChangeUser } from '@/lib/admin-policy';
import { after } from 'next/server';
import { flushDeletionReports } from '@/lib/deletion-audit';
import { UsersView } from './users-view';
import { mailerConfigured } from '@/lib/mailer';
import { PageHeader } from '@/components/ui';
import { AdminView } from './admin-view';

export const metadata = { title: 'Administração de parceiros' };

export default async function AdminPage() {
  const ctx = await requireAdmin();
  const db = await getDb();
  after(() => flushDeletionReports(db).then(() => undefined));
  const orgs = await db.select({
    o: schema.orgs,
    members: sql<number>`(select count(*) from ${schema.memberships} m where m.org_id = ${schema.orgs.id})`.mapWith(Number),
    leads: sql<number>`(select count(*) from ${schema.leads} l where l.org_id = ${schema.orgs.id})`.mapWith(Number),
    meetings: sql<number>`(select count(*) from ${schema.events} e where e.org_id = ${schema.orgs.id} and e.type = 'meeting_booked')`.mapWith(Number),
    owner: sql<string>`(select u.email from ${schema.memberships} m join ${schema.users} u on u.id = m.user_id where m.org_id = ${schema.orgs.id} and m.role = 'owner' order by m.created_at limit 1)`,
  }).from(schema.orgs).where(eq(schema.orgs.isDemo, false)).orderBy(asc(schema.orgs.name));
  const users = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, status: schema.users.status, platformRole: schema.users.platformRole,
    orgs: sql<string>`coalesce((select string_agg(o.name, ', ') from ${schema.memberships} m join ${schema.orgs} o on o.id = m.org_id where m.user_id = ${schema.users.id}), '')` })
    .from(schema.users).where(sql`${schema.users.email} not like '%@demo.invalid'`).orderBy(asc(schema.users.email));
  const memberships = await db.select().from(schema.memberships);
  return (
    <>
      <PageHeader eyebrow="Admin master" title="Administração de parceiros" subtitle="Crie parceiros, defina cotas e acompanhe o uso de todos." />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className={`pill ${mailerConfigured() ? 'bg-success-soft text-success' : 'bg-red-50 text-danger'}`}>Office 365 {mailerConfigured() ? 'configurado' : 'não configurado'}</span>
      </div>
      <AdminView orgs={orgs.map(({ o, ...rest }) => ({ id: o.id, name: o.name, seats: o.seats, credits: o.searchCreditsMonth, active: o.active, aiEnabled: o.aiEnabled, imageEnabled: o.imageEnabled, callEnabled: o.callEnabled, ...rest }))}
        users={users} />
      <UsersView orgs={orgs.map(({o}) => ({id:o.id,name:o.name}))} users={users.map(u => ({...u, protected:!canChangeUser(ctx.user,u), memberships:memberships.filter(m => m.userId===u.id).map(m=>({orgId:m.orgId,role:m.role}))}))}/>

    </>
  );
}


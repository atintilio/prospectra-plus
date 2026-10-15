import { asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireAdmin } from '@/lib/auth';
import { aiConfigured } from '@/lib/ai';
import { listLegacyUsers } from '@/lib/legacy';
import { mailerConfigured } from '@/lib/mailer';
import { PageHeader } from '@/components/ui';
import { AdminView } from './admin-view';

export const metadata = { title: 'Parceiros' };

export default async function AdminPage() {
  await requireAdmin();
  const db = await getDb();
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
  const legacy = await listLegacyUsers();
  const inDb = new Set(users.map((u) => u.email.toLowerCase()));
  return (
    <>
      <PageHeader eyebrow="Admin master" title="Parceiros e usuários" subtitle="Crie parceiros, defina cotas e acompanhe o uso de todos." />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className={`pill ${mailerConfigured() ? 'bg-success-soft text-success' : 'bg-red-50 text-danger'}`}>Office 365 {mailerConfigured() ? 'configurado' : 'não configurado'}</span>
        <span className={`pill ${aiConfigured() ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>IA {aiConfigured() ? 'ligada' : 'desligada (usa textos base)'}</span>
      </div>
      <AdminView orgs={orgs.map(({ o, ...rest }) => ({ id: o.id, name: o.name, seats: o.seats, credits: o.searchCreditsMonth, active: o.active, ...rest }))}
        users={users} />
      <section className="card mt-8 p-5">
        <h2 className="text-sm font-semibold">Contas do sistema antigo (v1)</h2>
        <p className="mt-1 text-xs text-muted">Diagnóstico de acesso. Não mostra senhas. “No novo” indica se o e-mail já existe no banco atual.</p>
        {legacy.error && <p className="mt-3 text-sm text-danger">{legacy.error}</p>}
        {legacy.users.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-1 pr-4">E-mail</th><th className="pr-4">Nome</th><th className="pr-4">Papel</th><th className="pr-4">Ativo</th><th className="pr-4">Modo</th><th className="pr-4">Senha</th><th>No novo</th></tr></thead>
              <tbody>
                {legacy.users.map((u) => (
                  <tr key={u.email} className="border-t border-border">
                    <td className="py-1.5 pr-4">{u.email}</td><td className="pr-4">{u.name ?? '—'}</td><td className="pr-4">{u.role ?? '—'}</td>
                    <td className="pr-4">{u.active ? 'sim' : 'não'}</td><td className="pr-4">{u.mode ?? '—'}</td><td className="pr-4">{u.hash}</td>
                    <td>{inDb.has(u.email?.toLowerCase()) ? 'sim' : 'não'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

import { asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Relatórios Argus' };

export default async function ArgusReportsPage() {
  await requireAdmin();
  const db = await getDb();
  const [summary] = await db.select({
    total: sql<number>`count(*)`, queued: sql<number>`count(*) filter (where ${schema.enrichmentJobs.state} = 'queued')`,
    running: sql<number>`count(*) filter (where ${schema.enrichmentJobs.state} = 'running')`, completed: sql<number>`count(*) filter (where ${schema.enrichmentJobs.state} = 'completed')`,
    failed: sql<number>`count(*) filter (where ${schema.enrichmentJobs.state} = 'failed')`,
  }).from(schema.enrichmentJobs);
  const byOrg = await db.select({ org: schema.orgs.name, total: sql<number>`count(*)`, completed: sql<number>`count(*) filter (where ${schema.enrichmentJobs.state} = 'completed')` })
    .from(schema.enrichmentJobs).innerJoin(schema.orgs, eq(schema.orgs.id, schema.enrichmentJobs.orgId)).groupBy(schema.orgs.id, schema.orgs.name).orderBy(asc(schema.orgs.name));
  return <>
    <PageHeader eyebrow="Admin master" title="Relatórios Argus" subtitle="Investigações, evidências e sinais comerciais processados por operação."><a className="btn-outline" href="/api/admin/argus/report">Exportar CSV</a></PageHeader>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[['Total', summary?.total], ['Na fila', summary?.queued], ['Processando', summary?.running], ['Concluídas', summary?.completed], ['Falhas', summary?.failed]].map(([label, value]) => <div className="card p-5" key={String(label)}><p className="text-sm text-muted">{label}</p><p className="mt-2 text-3xl font-semibold">{Number(value ?? 0)}</p></div>)}</div>
    <section className="card mt-6 overflow-x-auto p-5"><h2 className="mb-4 font-semibold">Por operação</h2><table className="w-full text-left text-sm"><thead><tr><th className="pb-2">Operação</th><th className="pb-2">Investigações</th><th className="pb-2">Concluídas</th></tr></thead><tbody>{byOrg.map(row => <tr className="border-t border-border" key={row.org}><td className="py-3">{row.org}</td><td className="py-3">{Number(row.total)}</td><td className="py-3">{Number(row.completed)}</td></tr>)}</tbody></table></section>
  </>;
}

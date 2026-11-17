import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getCtx } from '@/lib/auth';

export async function GET() {
  const ctx = await getCtx();
  if (!ctx || ctx.user.platformRole !== 'admin') return new Response('Não autorizado', { status: 403 });
  const db = await getDb();
  const rows = await db.select({ id: schema.enrichmentJobs.id, org: schema.orgs.name, leadId: schema.enrichmentJobs.leadId, state: schema.enrichmentJobs.state, attempts: schema.enrichmentJobs.attempts, createdAt: schema.enrichmentJobs.createdAt, completedAt: schema.enrichmentJobs.completedAt, error: schema.enrichmentJobs.error }).from(schema.enrichmentJobs).innerJoin(schema.orgs, eq(schema.orgs.id, schema.enrichmentJobs.orgId)).orderBy(asc(schema.enrichmentJobs.createdAt));
  const csv = ['id,operacao,lead_id,status,tentativas,criado_em,concluido_em,erro', ...rows.map(row => [row.id, row.org, row.leadId, row.state, row.attempts, row.createdAt.toISOString(), row.completedAt?.toISOString() ?? '', row.error ?? ''].map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))].join('\n');
  return new Response(`\uFEFF${csv}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="argus-investigacoes.csv"', 'Cache-Control': 'no-store' } });
}

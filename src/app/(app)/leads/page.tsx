import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { aiConfigured } from '@/lib/ai';
import { PageHeader } from '@/components/ui';
import { LeadsView } from './leads-view';

export const metadata = { title: 'Leads' };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; etapa?: string; tag?: string; p?: string }> }) {
  const ctx = await requireOrg();
  const sp = await searchParams;
  const db = await getDb();
  const page = Math.max(1, Number(sp.p) || 1);
  const conds = [eq(schema.leads.orgId, ctx.org.id)];
  if (sp.q) conds.push(or(ilike(schema.leads.fullName, `%${sp.q}%`), ilike(schema.leads.company, `%${sp.q}%`), ilike(schema.leads.headline, `%${sp.q}%`))!);
  if (sp.etapa) conds.push(eq(schema.leads.stage, sp.etapa as schema.LeadStage));
  if (sp.tag) conds.push(eq(schema.leads.tag, sp.tag));
  const where = and(...conds);
  const [rows, [{ total }], tags, campaigns] = await Promise.all([
    db.select().from(schema.leads).where(where).orderBy(desc(schema.leads.createdAt)).limit(50).offset((page - 1) * 50),
    db.select({ total: count() }).from(schema.leads).where(where),
    db.selectDistinct({ tag: schema.leads.tag }).from(schema.leads).where(and(eq(schema.leads.orgId, ctx.org.id), sql`${schema.leads.tag} <> ''`)),
    db.select({ id: schema.campaigns.id, name: schema.campaigns.name, status: schema.campaigns.status }).from(schema.campaigns)
      .where(and(eq(schema.campaigns.orgId, ctx.org.id), sql`${schema.campaigns.status} in ('draft','active','paused')`)),
  ]);
  return (
    <>
      <PageHeader title="Leads" subtitle={`${total} ${total === 1 ? 'pessoa' : 'pessoas'} na base de ${ctx.org.name}`} />
      <LeadsView
        leads={rows.map((l) => ({ id: l.id, fullName: l.fullName, headline: l.headline, company: l.company, location: l.location, linkedinUrl: l.linkedinUrl, stage: l.stage, tag: l.tag, source: l.source, createdAt: l.createdAt.toISOString() }))}
        total={total} page={page} tags={tags.map((t) => t.tag)} campaigns={campaigns} filters={{ q: sp.q ?? '', etapa: sp.etapa ?? '', tag: sp.tag ?? '' }}
        aiOn={aiConfigured()} credits={ctx.org.searchCreditsMonth} />
    </>
  );
}

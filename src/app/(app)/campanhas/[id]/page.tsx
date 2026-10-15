import { and, count, eq, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { aiConfigured } from '@/lib/ai';
import { PageHeader } from '@/components/ui';
import { CampaignEditor } from '../editor';
import { CampaignControls } from './controls';

export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [c] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, id), eq(schema.campaigns.orgId, ctx.org.id)));
  if (!c) notFound();
  const [members, states, tags, [{ newLeads }]] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, ctx.org.id)),
    db.select({ state: schema.enrollments.state, n: count() }).from(schema.enrollments).where(eq(schema.enrollments.campaignId, id)).groupBy(schema.enrollments.state),
    db.selectDistinct({ tag: schema.leads.tag }).from(schema.leads).where(and(eq(schema.leads.orgId, ctx.org.id), sql`${schema.leads.tag} <> ''`)),
    db.select({ newLeads: count() }).from(schema.leads).where(and(eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.stage, 'new'))),
  ]);
  const by = Object.fromEntries(states.map((s) => [s.state, s.n])) as Record<string, number>;
  return (
    <>
      <PageHeader title={c.name} subtitle={`${c.steps.length} passos · ${(by.running ?? 0) + (by.waiting_accept ?? 0)} leads em curso · ${by.done ?? 0} concluídos · ${by.stopped ?? 0} encerrados por resposta`}>
        <CampaignControls id={c.id} status={c.status} tags={tags.map((t) => t.tag)} newLeads={newLeads} />
      </PageHeader>
      <CampaignEditor id={c.id} initial={{ name: c.name, aiBrief: c.aiBrief, assignedTo: c.assignedTo ?? c.ownerId, steps: c.steps }} members={members} aiOn={aiConfigured()} />
    </>
  );
}

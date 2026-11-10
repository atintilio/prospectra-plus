import { and, count, eq, sql } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { aiConfigured } from '@/lib/ai';
import { campaignFeatures } from '@/lib/campaign-features';
import { PageHeader } from '@/components/ui';
import { CampaignEditor } from '../editor';
import { listCampaignFlows, loadLinkedFlow } from '../flows';
import { CampaignControls } from './controls';
import { CampaignDraft } from './draft';

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
  const [flows, linkedFlow] = await Promise.all([
    listCampaignFlows(db, ctx.org.id),
    loadLinkedFlow(db, ctx.org.id, c.flowId),
  ]);
  const stepCount = linkedFlow ? linkedFlow.steps.length : c.steps.length;
  const enrolledLeads = await db.selectDistinct({ id: schema.leads.id, fullName: schema.leads.fullName }).from(schema.enrollments)
    .innerJoin(schema.leads, and(eq(schema.leads.id, schema.enrollments.leadId), eq(schema.leads.orgId, ctx.org.id)))
    .where(and(eq(schema.enrollments.orgId, ctx.org.id), eq(schema.enrollments.campaignId, id))).limit(100);
  return (
    <>
      <PageHeader title={c.name} subtitle={`${stepCount} passos${linkedFlow ? ` (fluxo “${linkedFlow.name}”)` : ''} · ${(by.running ?? 0) + (by.waiting_accept ?? 0)} leads em curso · ${by.done ?? 0} concluídos · ${by.stopped ?? 0} encerrados por resposta`}>
        <CampaignControls id={c.id} status={c.status} tags={tags.map((t) => t.tag)} newLeads={newLeads} />
      </PageHeader>
      <CampaignEditor key={c.id} id={c.id} initial={{ name: c.name, aiBrief: c.aiBrief, assignedTo: c.assignedTo ?? c.ownerId, steps: c.steps }} members={members} aiOn={aiConfigured()} features={campaignFeatures(ctx.org)} flows={flows} linkedFlow={linkedFlow} />
      <CampaignDraft key={JSON.stringify([c.id, c.aiBrief, c.steps, c.flowId, c.assignedTo, linkedFlow?.steps, enrolledLeads])} campaignId={c.id} leads={enrolledLeads} steps={linkedFlow?.steps ?? c.steps} enabled={ctx.org.active && ctx.org.aiEnabled && aiConfigured()} />
    </>
  );
}

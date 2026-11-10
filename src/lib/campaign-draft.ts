import { and, eq, ilike, or } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';
import { aiGenerator } from './ai';
import type { Generator } from './cadence';
import { loadCampaignContext } from './campaign-context';
import { resolveSteps } from './flows/resolve';

export async function findCampaignLeads(db: DB, orgId: string, campaignId: string, search: string) {
  const pattern = `%${search.trim().slice(0, 80).replace(/[\\%_]/g, '\\$&')}%`;
  return db.selectDistinct({ id: schema.leads.id, fullName: schema.leads.fullName }).from(schema.enrollments)
    .innerJoin(schema.leads, and(eq(schema.leads.id, schema.enrollments.leadId), eq(schema.leads.orgId, orgId)))
    .where(and(eq(schema.enrollments.orgId, orgId), eq(schema.enrollments.campaignId, campaignId), or(ilike(schema.leads.fullName, pattern), ilike(schema.leads.company, pattern))))
    .orderBy(schema.leads.fullName).limit(50);
}

export async function previewCampaignDraft(db: DB, orgId: string, campaignId: string, leadId: string, stepIndex: number, generate: Generator = aiGenerator): Promise<string> {
  if (!Number.isInteger(stepIndex) || stepIndex < 0) throw new Error('INVALID_STEP');
  const [row] = await db.select({ camp: schema.campaigns, lead: schema.leads }).from(schema.enrollments)
    .innerJoin(schema.campaigns, and(eq(schema.campaigns.id, schema.enrollments.campaignId), eq(schema.campaigns.orgId, orgId)))
    .innerJoin(schema.leads, and(eq(schema.leads.id, schema.enrollments.leadId), eq(schema.leads.orgId, orgId)))
    .where(and(eq(schema.enrollments.orgId, orgId), eq(schema.enrollments.campaignId, campaignId), eq(schema.enrollments.leadId, leadId))).limit(1);
  if (!row) throw new Error('CAMPAIGN_LEAD_NOT_FOUND');
  if (row.lead.stage === 'do_not_contact') throw new Error('DO_NOT_CONTACT');
  const step = (await resolveSteps(db, row.camp))[stepIndex];
  if (!step || step.type === 'react') throw new Error('INVALID_STEP');
  const context = await loadCampaignContext(db, orgId, campaignId, leadId, row.camp.assignedTo ?? row.camp.ownerId);
  const text = await generate({ step, lead: row.lead, brief: row.camp.aiBrief, context });
  return step.type === 'invite' ? text.slice(0, 300) : text;
}

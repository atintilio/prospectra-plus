'use server';

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { createLeadEnrichment, type LeadEnrichment } from './types';

const inputSchema = z.object({ leadId: z.string().uuid() }).strict();

export type ArgusActionState = { id?: string; error?: string; job?: { id: string; state: string; result: LeadEnrichment | null } };

export async function queueArgusInvestigation(raw: unknown): Promise<ArgusActionState> {
  const ctx = await requireOrg();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { error: 'Lead inválido.' };
  const db = await getDb();
  const [lead] = await db.select({ id: schema.leads.id }).from(schema.leads).where(and(eq(schema.leads.id, parsed.data.leadId), eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.ownerId, ctx.user.id))).limit(1);
  if (!lead) return { error: 'Lead fora da sua carteira.' };
  const id = crypto.randomUUID();
  await db.insert(schema.enrichmentJobs).values({ id, orgId: ctx.org.id, userId: ctx.user.id, leadId: lead.id, state: 'queued', result: createLeadEnrichment() });
  return { id };
}

export async function getArgusInvestigation(raw: unknown): Promise<ArgusActionState> {
  const ctx = await requireOrg();
  const parsed = z.object({ id: z.string().uuid() }).safeParse(raw);
  if (!parsed.success) return { error: 'Investigação inválida.' };
  const db = await getDb();
  const [job] = await db.select({ id: schema.enrichmentJobs.id, state: schema.enrichmentJobs.state, result: schema.enrichmentJobs.result }).from(schema.enrichmentJobs).where(and(eq(schema.enrichmentJobs.id, parsed.data.id), eq(schema.enrichmentJobs.orgId, ctx.org.id), eq(schema.enrichmentJobs.userId, ctx.user.id))).limit(1);
  return job ? { job: { ...job, result: job.result ?? null } } : { error: 'Investigação não encontrada.' };
}

export async function listArgusInvestigations(leadId: string) {
  const ctx = await requireOrg();
  const db = await getDb();
  return db.select({ id: schema.enrichmentJobs.id, state: schema.enrichmentJobs.state, result: schema.enrichmentJobs.result, createdAt: schema.enrichmentJobs.createdAt }).from(schema.enrichmentJobs).where(and(eq(schema.enrichmentJobs.leadId, leadId), eq(schema.enrichmentJobs.orgId, ctx.org.id), eq(schema.enrichmentJobs.userId, ctx.user.id))).orderBy(desc(schema.enrichmentJobs.createdAt)).limit(10);
}

'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';

export type SimState = { error?: string; ok?: string } | undefined;

/** Resposta simulada em uma interação do LinkedIn (demo): registra localmente, envia nada. */
export async function demoLinkedInReplyAction(input: { campaignId: string; leadId: string; body: string }): Promise<SimState> {
  const ctx = await requireOrg();
  if (!ctx.org.isDemo) return { error: 'Disponível apenas no ambiente de demonstração.' };
  const body = input.body.trim();
  if (!body) return { error: 'Escreva a mensagem da interação.' };
  if (body.length > 2000) return { error: 'Mensagem muito longa.' };
  const db = await getDb();
  const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, input.leadId), eq(schema.leads.orgId, ctx.org.id)));
  if (!lead) return { error: 'Lead não encontrado na demonstração.' };
  const [campaign] = await db.select().from(schema.campaigns).where(and(eq(schema.campaigns.id, input.campaignId), eq(schema.campaigns.orgId, ctx.org.id)));
  if (!campaign) return { error: 'Campanha não encontrada na demonstração.' };
  let [enr] = await db.select().from(schema.enrollments)
    .where(and(eq(schema.enrollments.leadId, lead.id), eq(schema.enrollments.campaignId, campaign.id), eq(schema.enrollments.orgId, ctx.org.id)))
    .orderBy(sql`created_at desc`).limit(1);
  let stepIndex = 0;
  if (!enr) {
    [enr] = await db.insert(schema.enrollments).values({
      orgId: ctx.org.id, campaignId: campaign.id, leadId: lead.id, stepIndex: 0, state: 'stopped', nextRunAt: new Date(Date.now() + 3650 * 86400_000),
    }).returning();
  } else {
    const [maxRow] = await db.select({ max: sql<number>`coalesce(max(step_index), -1)::int` }).from(schema.actions).where(eq(schema.actions.enrollmentId, enr.id));
    stepIndex = (maxRow.max ?? -1) + 1;
  }
  const done = { status: 'done' as const, executedAt: new Date() };
  await db.insert(schema.actions).values({
    orgId: ctx.org.id, enrollmentId: enr.id, campaignId: campaign.id, leadId: lead.id, userId: ctx.user.id,
    stepIndex, type: 'message', body, dueDate: new Date().toISOString().slice(0, 10),
    dispatchState: 'none', providerId: 'demo-local', ...done,
  }).onConflictDoNothing();
  await db.insert(schema.events).values({ orgId: ctx.org.id, userId: ctx.user.id, type: 'message_sent', campaignId: campaign.id, leadId: lead.id });
  revalidatePath('/simulador');
  return { ok: 'Resposta simulada (demo): nada foi enviado ao LinkedIn real.' };
}

'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { campaignFeatures } from '@/lib/campaign-features';
import { validateFlowSteps } from '@/lib/flows/validate';
import { recordAudit } from '@/lib/audit';

const stepTypeSchema = z.enum(['react', 'comment', 'invite', 'message', 'email', 'whatsapp', 'voice', 'image', 'call']);

const stepSchema = z.object({
  id: z.string().min(1).max(64),
  type: stepTypeSchema,
  name: z.string().max(80),
  delayDays: z.number().int().min(0).max(365),
  condition: z.enum(['always', 'accepted']),
  template: z.string().max(4000),
  useAi: z.boolean(),
  subject: z.string().max(200),
  mediaUrl: z.string().max(500),
});

const flowSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao fluxo.').max(80),
  status: z.enum(['draft', 'active', 'paused']),
  steps: z.array(stepSchema).max(40),
});

/**
 * Cria um fluxo vazio e abre o construtor.
 *
 * Isolamento: o fluxo nasce na operação da sessão (nunca em outra).
 */
export async function createFlowAction(form: FormData): Promise<void> {
  const ctx = await requireOrg();
  const db = await getDb();
  const name = String(form.get('name') ?? '').trim().slice(0, 80) || 'Novo fluxo';
  const [flow] = await db.insert(schema.flows)
    .values({ orgId: ctx.org.id, name, status: 'draft', createdBy: ctx.user.id })
    .returning({ id: schema.flows.id });
  await recordAudit(ctx.org.id, { actorUserId: ctx.user.id, action: 'flow.created', entity: 'flow', entityId: flow.id });
  revalidatePath('/fluxos');
  redirect(`/fluxos/${flow.id}`);
}

/**
 * Salva o fluxo inteiro (nome, status e a ordem das etapas).
 *
 * A gravação é uma transação: apaga as etapas do fluxo e regrava na ordem
 * enviada. Etapa já existente mantém o id; etapa nova recebe id do servidor.
 *
 * Gate: um bloco de recurso desligado na operação **não entra** (etapa nova com
 * tipo travado é recusada). Etapa que **já existe** e ficou travada continua
 * salva — é a mesma regra do editor de campanha (a 2ª camada é a cadência).
 */
export async function saveFlowAction(flowId: string, input: unknown): Promise<{ error?: string; ok?: string }> {
  const ctx = await requireOrg();
  const db = await getDb();
  if (!z.string().uuid().safeParse(flowId).success) return { error: 'Fluxo inválido.' };
  const [flow] = await db.select({ id: schema.flows.id }).from(schema.flows)
    .where(and(eq(schema.flows.id, flowId), eq(schema.flows.orgId, ctx.org.id)));
  if (!flow) return { error: 'Fluxo não encontrado.' };

  const parsed = flowSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const data = parsed.data;

  const features = campaignFeatures(ctx.org);
  const existing = await db.select({ id: schema.flowSteps.id }).from(schema.flowSteps)
    .where(and(eq(schema.flowSteps.flowId, flowId), eq(schema.flowSteps.orgId, ctx.org.id)));
  const known = new Set(existing.map((s) => s.id));

  const invalid = validateFlowSteps(features, data.steps, known, { demo: ctx.org.isDemo });
  if (invalid) return { error: invalid };

  await db.transaction(async tx => {
    await tx.delete(schema.flowSteps).where(and(eq(schema.flowSteps.flowId, flowId), eq(schema.flowSteps.orgId, ctx.org.id)));
    if (data.steps.length) {
      await tx.insert(schema.flowSteps).values(data.steps.map((step, index) => ({
        id: known.has(step.id) ? step.id : crypto.randomUUID(),
        flowId,
        orgId: ctx.org.id,
        position: index,
        type: step.type,
        name: step.name.slice(0, 80),
        delayDays: step.delayDays,
        condition: step.condition,
        template: step.template,
        useAi: step.useAi,
        subject: step.subject,
        mediaUrl: step.mediaUrl,
      })));
    }
    await tx.update(schema.flows)
      .set({ name: data.name, status: data.status, updatedAt: new Date() })
      .where(and(eq(schema.flows.id, flowId), eq(schema.flows.orgId, ctx.org.id)));
  });

  await recordAudit(ctx.org.id, { actorUserId: ctx.user.id, action: 'flow.saved', entity: 'flow', entityId: flowId });
  revalidatePath('/fluxos');
  revalidatePath(`/fluxos/${flowId}`);
  return { ok: 'Fluxo salvo.' };
}

/** Apaga o fluxo (as campanhas vinculadas voltam a usar as próprias etapas). */
export async function deleteFlowAction(form: FormData): Promise<void> {
  const ctx = await requireOrg();
  const db = await getDb();
  const flowId = String(form.get('flowId') ?? '');
  if (!z.string().uuid().safeParse(flowId).success) return;
  const [flow] = await db.select({ id: schema.flows.id }).from(schema.flows)
    .where(and(eq(schema.flows.id, flowId), eq(schema.flows.orgId, ctx.org.id)));
  if (!flow) redirect('/fluxos');
  await db.delete(schema.flows).where(and(eq(schema.flows.id, flowId), eq(schema.flows.orgId, ctx.org.id)));
  await recordAudit(ctx.org.id, { actorUserId: ctx.user.id, action: 'flow.deleted', entity: 'flow', entityId: flowId });
  revalidatePath('/fluxos');
  redirect('/fluxos');
}
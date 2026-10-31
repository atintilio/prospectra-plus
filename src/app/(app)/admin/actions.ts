'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { requireAdmin } from '@/lib/auth';

export type AdminSettingsState = { error?: string; ok?: string } | undefined;

const settingsSchema = z.object({
  senderEmail: z.string().trim().email('E-mail remetente inválido.').or(z.literal('')),
  atendimentoStart: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inicial inválido.'),
  atendimentoEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Horário final inválido.'),
  autoReply: z.string().trim().max(600),
  features: z.array(z.string().max(20)).max(12),
});

/** Configuração por parceiro: e-mail remetente, atendimento, autorresposta e recursos. */
export async function saveOrgSettingsAction(_prev: AdminSettingsState, formData: FormData): Promise<AdminSettingsState> {
  await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(orgId)) return { error: 'Parceiro inválido.' };
  const parsed = settingsSchema.safeParse({
    senderEmail: String(formData.get('senderEmail') ?? ''),
    atendimentoStart: String(formData.get('atendimentoStart') ?? '09:00'),
    atendimentoEnd: String(formData.get('atendimentoEnd') ?? '18:00'),
    autoReply: String(formData.get('autoReply') ?? ''),
    features: ['golinkedin', 'whatsapp', 'helpin', 'inteligencia', 'agenda', 'documentos'].filter((f) => formData.get(`f.${f}`) === 'on'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const db = await getDb();
  const features = Object.fromEntries(parsed.data.features.map((f) => [f, true]));
  const values = {
    orgId,
    senderEmail: parsed.data.senderEmail || null,
    atendimentoStart: parsed.data.atendimentoStart,
    atendimentoEnd: parsed.data.atendimentoEnd,
    autoReply: parsed.data.autoReply,
    features,
    updatedAt: new Date(),
  };
  await db.insert(schema.orgSettings).values(values).onConflictDoUpdate({ target: schema.orgSettings.orgId, set: values });
  revalidatePath('/admin');
  return { ok: 'Configurações do parceiro salvas.' };
}

// ---------- Planos (estrutura configurável, sem preço fixado) ----------

const planSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do plano.').max(60),
  seats: z.coerce.number().int().min(1).max(200),
  credits: z.coerce.number().int().min(0).max(100000),
});

export async function createPlanAction(_prev: AdminSettingsState, formData: FormData): Promise<AdminSettingsState> {
  await requireAdmin();
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const db = await getDb();
  await db.insert(schema.plans).values({
    name: parsed.data.name, seats: parsed.data.seats, searchCreditsMonth: parsed.data.credits,
  });
  revalidatePath('/admin');
  return { ok: `Plano ${parsed.data.name} criado.` };
}

export async function togglePlanAction(planId: string, active: boolean): Promise<void> {
  await requireAdmin();
  const db = await getDb();
  await db.update(schema.plans).set({ active }).where(eq(schema.plans.id, planId));
  revalidatePath('/admin');
}

/** Aplica o plano: copia limites do plano e vincula ao parceiro. planId=null desvincula. */
export async function assignPlanAction(orgId: string, planId: string | null): Promise<{ error?: string }> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(orgId)) return { error: 'Parceiro inválido.' };
  const db = await getDb();
  if (!planId) {
    await db.update(schema.orgs).set({ planId: null }).where(eq(schema.orgs.id, orgId));
    revalidatePath('/admin');
    return {};
  }
  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId));
  if (!plan) return { error: 'Plano não encontrado.' };
  await db.update(schema.orgs)
    .set({ planId: plan.id, seats: plan.seats, searchCreditsMonth: plan.searchCreditsMonth })
    .where(eq(schema.orgs.id, orgId));
  revalidatePath('/admin');
  return {};
}

// ---------- Integrações (visualização; segredos ficam no ambiente, nunca no banco) ----------

export type IntegrationPill = { name: string; ok: boolean; hint: string };


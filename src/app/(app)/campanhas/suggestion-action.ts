'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { aiConfigured } from '@/lib/ai';
import { requireOrg } from '@/lib/auth';
import { campaignFeatures } from '@/lib/campaign-features';
import { suggestCampaignSequence, type SuggestedStep } from '@/lib/campaign-suggestion';

const inputSchema = z.object({
  brief: z.string().trim().max(1200),
  assignedTo: z.string().uuid().nullable(),
}).strict();

export async function suggestCampaignAction(raw: unknown): Promise<{ steps?: SuggestedStep[]; error?: string }> {
  const ctx = await requireOrg();
  if (!ctx.org.active || ctx.user.status !== 'active' || !ctx.org.aiEnabled || !aiConfigured()) {
    return { error: 'A IA não está disponível nesta operação.' };
  }
  const input = inputSchema.safeParse(raw);
  if (!input.success) return { error: 'Revise o contexto da campanha e o responsável.' };
  const db = await getDb();
  const sellerId = input.data.assignedTo ?? ctx.user.id;
  const [member] = await db.select({ id: schema.memberships.userId }).from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.memberships.userId, sellerId))).limit(1);
  if (!member) return { error: 'Responsável inválido nesta operação.' };
  const [profile] = await db.select({
    sellerName: schema.commercialProfiles.sellerName,
    companyName: schema.commercialProfiles.companyName,
    strategy: schema.commercialProfiles.strategy,
    offers: schema.commercialProfiles.offers,
  }).from(schema.commercialProfiles)
    .where(and(eq(schema.commercialProfiles.orgId, ctx.org.id), eq(schema.commercialProfiles.userId, sellerId))).limit(1);
  if (!input.data.brief && !profile) return { error: 'Descreva a oferta no contexto ou cadastre o perfil comercial do responsável.' };
  try {
    const steps = await suggestCampaignSequence({
      brief: input.data.brief,
      seller: profile ?? null,
      linkedinEnabled: campaignFeatures(ctx.org).linkedin,
    });
    return { steps };
  } catch {
    return { error: 'Não foi possível criar uma sequência válida. Tente novamente; nenhuma etapa foi salva.' };
  }
}

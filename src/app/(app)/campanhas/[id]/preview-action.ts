'use server';
import { getDb } from '@/db';
import { aiConfigured } from '@/lib/ai';
import { requireOrg } from '@/lib/auth';
import { findCampaignLeads, previewCampaignDraft } from '@/lib/campaign-draft';

export async function findCampaignLeadsAction(campaignId: string, search: string) {
  const ctx = await requireOrg();
  if (!ctx.org.active || typeof search !== 'string' || !/^[0-9a-f-]{36}$/.test(campaignId)) return [];
  return findCampaignLeads(await getDb(), ctx.org.id, campaignId, search);
}

export async function previewCampaignAction(campaignId: string, leadId: string, stepIndex: number): Promise<{ draft?: string; error?: string }> {
  const ctx = await requireOrg();
  if (!ctx.org.active || !ctx.org.aiEnabled || !aiConfigured()) return { error: 'A personalização por IA não está disponível nesta operação.' };
  if (!/^[0-9a-f-]{36}$/.test(campaignId) || !/^[0-9a-f-]{36}$/.test(leadId)) return { error: 'Campanha ou lead inválido.' };
  try { return { draft: await previewCampaignDraft(await getDb(), ctx.org.id, campaignId, leadId, stepIndex) }; }
  catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'DO_NOT_CONTACT') return { error: 'Este lead está marcado para não receber contatos.' };
    if (code === 'CAMPAIGN_LEAD_NOT_FOUND' || code === 'INVALID_STEP') return { error: 'Lead ou etapa não pertence a esta campanha.' };
    return { error: 'Não foi possível gerar a prévia agora. Nenhuma mensagem foi enviada.' };
  }
}

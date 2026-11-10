import { and, desc, eq } from 'drizzle-orm';
import type { DB } from '@/db';
import * as schema from '@/db/schema';

export async function loadCampaignContext(db: DB, orgId: string, campaignId: string, leadId: string, sellerId: string): Promise<string> {
  const [[campaign], [lead], [profile], actions, events, [conversation], [support], [seller]] = await Promise.all([
    db.select({ name: schema.campaigns.name }).from(schema.campaigns).where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.orgId, orgId))).limit(1),
    db.select({ notes: schema.leads.notes, qualification: schema.leads.qualification, attributes: schema.leads.attributes, stage: schema.leads.stage }).from(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, orgId))).limit(1),
    db.select({ sellerName: schema.commercialProfiles.sellerName, companyName: schema.commercialProfiles.companyName, strategy: schema.commercialProfiles.strategy, offers: schema.commercialProfiles.offers }).from(schema.commercialProfiles).where(and(eq(schema.commercialProfiles.orgId, orgId), eq(schema.commercialProfiles.userId, sellerId))).limit(1),
    db.select({ type: schema.actions.type, body: schema.actions.body, status: schema.actions.status }).from(schema.actions).where(and(eq(schema.actions.orgId, orgId), eq(schema.actions.campaignId, campaignId), eq(schema.actions.leadId, leadId))).orderBy(desc(schema.actions.createdAt)).limit(6),
    db.select({ type: schema.events.type }).from(schema.events).where(and(eq(schema.events.orgId, orgId), eq(schema.events.campaignId, campaignId), eq(schema.events.leadId, leadId))).orderBy(desc(schema.events.at)).limit(6),
    db.select({ id: schema.harveyConversations.id, summary: schema.harveyConversations.summary }).from(schema.harveyConversations).where(and(eq(schema.harveyConversations.orgId, orgId), eq(schema.harveyConversations.leadId, leadId))).limit(1),
    db.select({ id: schema.supportConversations.id }).from(schema.supportConversations).where(and(eq(schema.supportConversations.orgId, orgId), eq(schema.supportConversations.leadId, leadId))).orderBy(desc(schema.supportConversations.lastMessageAt)).limit(1),
    db.select({ name: schema.users.name }).from(schema.users).innerJoin(schema.memberships, and(eq(schema.memberships.userId, schema.users.id), eq(schema.memberships.orgId, orgId))).where(eq(schema.users.id, sellerId)).limit(1),
  ]);
  if (!campaign || !lead) throw new Error('CAMPAIGN_CONTEXT_NOT_FOUND');
  const [inbound, outbound, supportMessages] = await Promise.all([
    conversation ? db.select({ text: schema.harveyInbox.text }).from(schema.harveyInbox).where(eq(schema.harveyInbox.conversationId, conversation.id)).orderBy(desc(schema.harveyInbox.createdAt)).limit(4) : [],
    conversation ? db.select({ body: schema.harveyOutbox.body }).from(schema.harveyOutbox).where(and(eq(schema.harveyOutbox.conversationId, conversation.id), eq(schema.harveyOutbox.kind, 'lead'), eq(schema.harveyOutbox.state, 'sent'))).orderBy(desc(schema.harveyOutbox.createdAt)).limit(4) : [],
    support ? db.select({ author: schema.supportMessages.author, body: schema.supportMessages.body }).from(schema.supportMessages).where(and(eq(schema.supportMessages.conversationId, support.id), eq(schema.supportMessages.private, false))).orderBy(desc(schema.supportMessages.createdAt)).limit(4) : [],
  ]);
  const attributes = lead.attributes && typeof lead.attributes === 'object' && !Array.isArray(lead.attributes) ? JSON.stringify(lead.attributes).slice(0, 1200) : '';
  return [
    `Campanha: ${campaign.name}. Etapa do lead no CRM: ${lead.stage}.`,
    lead.qualification && `Qualificação registrada: ${lead.qualification.slice(0, 1200)}`,
    lead.notes && `Notas de contexto do CRM: ${lead.notes.slice(-1600)}`,
    attributes && `Atributos do CRM: ${attributes}`,
    (profile?.sellerName || seller?.name) && `Vendedor responsável: ${profile?.sellerName || seller?.name}.`,
    profile?.companyName && `Empresa do vendedor: ${profile.companyName}.`,
    profile?.strategy && `Estratégia aprovada: ${profile.strategy.slice(0, 1200)}`,
    profile?.offers?.length && `Ofertas aprovadas: ${profile.offers.slice(0, 8).map(o => `${o.name}: ${o.description}`).join('; ').slice(0, 1800)}`,
    actions.length && `Ações desta campanha para este lead: ${actions.map(a => `${a.type} [${a.status}]: ${a.body.slice(0, 300)}`).join('; ')}`,
    events.length && `Eventos desta campanha para este lead: ${events.map(e => e.type).join(', ')}`,
    conversation?.summary && `Resumo da conversa com este lead: ${conversation.summary.slice(0, 700)}`,
    inbound.length && `Respostas recentes deste lead: ${inbound.reverse().map(m => m.text.slice(0, 500)).join(' | ')}`,
    outbound.length && `Mensagens já enviadas a este lead: ${outbound.reverse().map(m => m.body.slice(0, 500)).join(' | ')}`,
    supportMessages.length && `Conversa recente no atendimento: ${supportMessages.reverse().map(m => `${m.author}: ${m.body.slice(0, 500)}`).join(' | ')}`,
  ].filter(Boolean).join('\n');
}

import { redirect } from 'next/navigation';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { SimuladorView } from './view';
import { demoVoiceProfile } from '@/lib/voice/demo';

export const metadata = { title: 'Simulador' };

export default async function SimuladorPage() {
  const ctx = await requireOrg();
  if (!ctx.org.isDemo) redirect('/painel');
  const db = await getDb();
  const orgId = ctx.org.id;

  const conversations = await db.select({
    id: schema.helpinConversations.id, subject: schema.helpinConversations.subject,
    contactName: schema.helpinConversations.contactName, status: schema.helpinConversations.status,
    lastMessageAt: schema.helpinConversations.lastMessageAt, leadId: schema.helpinConversations.leadId,
  }).from(schema.helpinConversations)
    .where(and(eq(schema.helpinConversations.orgId, orgId), eq(schema.helpinConversations.channel, 'whatsapp')))
    .orderBy(desc(schema.helpinConversations.lastMessageAt));
  const convIds = conversations.map((c) => c.id);
  const messages = convIds.length ? await db.select({
    id: schema.helpinMessages.id, conversationId: schema.helpinMessages.conversationId,
    sender: schema.helpinMessages.sender, body: schema.helpinMessages.body,
    simulated: schema.helpinMessages.simulated, createdAt: schema.helpinMessages.createdAt,
  }).from(schema.helpinMessages).where(inArray(schema.helpinMessages.conversationId, convIds)).orderBy(schema.helpinMessages.createdAt) : [];

  // Interações LinkedIn da demo: leads com atividade da cadência (ações feitas/pendentes) + eventos marcantes
  const threads = await db.select({
    leadId: schema.actions.leadId, leadName: schema.leads.fullName, company: schema.leads.company,
    campaignId: schema.actions.campaignId, campaignName: schema.campaigns.name,
  }).from(schema.actions)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.actions.leadId))
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.actions.campaignId))
    .where(and(eq(schema.actions.orgId, orgId), inArray(schema.actions.status, ['done', 'pending'])))
    .groupBy(schema.actions.leadId, schema.leads.fullName, schema.leads.company, schema.actions.campaignId, schema.campaigns.name)
    .orderBy(desc(sql`max(${schema.actions.createdAt})`)).limit(6);
  const leadIds = threads.map((t) => t.leadId);
  const timeline = leadIds.length ? await db.select({
    leadId: schema.actions.leadId, id: schema.actions.id, type: schema.actions.type, body: schema.actions.body,
    status: schema.actions.status, stepIndex: schema.actions.stepIndex, executedAt: schema.actions.executedAt,
    dueDate: schema.actions.dueDate, dispatchState: schema.actions.dispatchState,
  }).from(schema.actions).where(and(eq(schema.actions.orgId, orgId), inArray(schema.actions.leadId, leadIds)))
    .orderBy(schema.actions.stepIndex) : [];
  const events = leadIds.length ? await db.select({
    leadId: schema.events.leadId, type: schema.events.type, at: schema.events.at,
  }).from(schema.events).where(and(eq(schema.events.orgId, orgId), inArray(schema.events.leadId, leadIds), inArray(schema.events.type, ['invite_accepted', 'reply_received', 'meeting_booked'])))
    .orderBy(schema.events.at) : [];
  const voice = await demoVoiceProfile(db, { orgId, userId: ctx.user.id });

  return <>
    <PageHeader title="Simulador" eyebrow="Demo" subtitle="Conversas e interações simuladas: clique, responda e ouça. Nada sai do ambiente de demonstração." />
    <SimuladorView
      isDemo={ctx.org.isDemo}
      voiceReady={!!voice}
      conversations={conversations.map((c) => ({ ...c, lastMessageAt: c.lastMessageAt.toISOString() }))}
      messages={messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      threads={threads}
      timeline={timeline.map((a) => ({ ...a, executedAt: a.executedAt ? a.executedAt.toISOString() : null }))}
      events={events.map((e) => ({ ...e, leadId: e.leadId!, at: e.at.toISOString() }))}
    />
  </>;
}

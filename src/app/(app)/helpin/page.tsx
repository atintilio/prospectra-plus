import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { HelpinView, type ConversationItem, type LeadContext, type MessageItem } from './view';

export const metadata = { title: 'Helpin · Suporte' };

function fmt(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);
}

export default async function HelpinPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const { conversation: selectedRaw } = await searchParams;
  const ctx = await requireOrg();
  const db = await getDb();
  const convRows = await db.select({
    conv: schema.helpinConversations,
    assigneeName: schema.users.name,
    leadName: schema.leads.fullName,
  }).from(schema.helpinConversations)
    .leftJoin(schema.users, eq(schema.users.id, schema.helpinConversations.assigneeId))
    .leftJoin(schema.leads, eq(schema.leads.id, schema.helpinConversations.leadId))
    .where(eq(schema.helpinConversations.orgId, ctx.org.id))
    .orderBy(desc(schema.helpinConversations.lastMessageAt)).limit(100);

  const conversations: ConversationItem[] = convRows.map(({ conv, assigneeName, leadName }) => ({
    id: conv.id, subject: conv.subject, contactName: conv.contactName, channel: conv.channel,
    status: conv.status, lastMessageAt: fmt(conv.lastMessageAt), assignee: assigneeName ?? null, leadName: leadName ?? null,
  }));

  const selectedId = conversations.find((c) => c.id === selectedRaw)?.id ?? conversations[0]?.id ?? null;
  const [msgRows, members, selectedConv] = await Promise.all([
    selectedId
      ? db.select().from(schema.helpinMessages).where(and(eq(schema.helpinMessages.orgId, ctx.org.id), eq(schema.helpinMessages.conversationId, selectedId))).orderBy(schema.helpinMessages.createdAt)
      : Promise.resolve([]),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, ctx.org.id)),
    selectedId ? db.select().from(schema.helpinConversations).where(and(eq(schema.helpinConversations.id, selectedId), eq(schema.helpinConversations.orgId, ctx.org.id))) : Promise.resolve([]),
  ]);

  const messages: MessageItem[] = msgRows.map((msg) => ({ id: msg.id, sender: msg.sender, body: msg.body, simulated: msg.simulated, at: fmt(msg.createdAt) }));
  let leadContext: LeadContext = null;
  const conv = selectedConv[0];
  if (conv?.leadId) {
    const [lead] = await db.select().from(schema.leads).where(and(eq(schema.leads.id, conv.leadId), eq(schema.leads.orgId, ctx.org.id)));
    if (lead) leadContext = { id: lead.id, fullName: lead.fullName, company: lead.company, stage: lead.stage, headline: lead.headline };
  }

  return (
    <>
      <PageHeader title="Helpin · Suporte" subtitle="Caixa de entrada, resposta, atribuição e histórico — isolados por organização." />
      <HelpinView conversations={conversations} selectedId={selectedId} messages={messages}
        members={members} currentUserId={ctx.user.id} isDemo={ctx.org.isDemo} leadContext={leadContext} />
    </>
  );
}

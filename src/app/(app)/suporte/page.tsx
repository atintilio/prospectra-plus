import { getDb } from '@/db';
import { and, eq } from 'drizzle-orm';
import { schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { conversationThread, listInbox, listOrgLabels, listTeams } from '@/lib/support';
import { SupportInbox } from './inbox';
import { OpenTicket } from './ticket';
import { TeamsManager } from './teams';

export const metadata = { title: 'Suporte' };

export default async function SuportePage({ searchParams }: { searchParams: Promise<{ c?: string; status?: string; label?: string; team?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  const db = await getDb();
  const status = sp.status === 'closed' ? 'closed' as const : 'open' as const;
  const activeLabel = (sp.label ?? '').trim();
  const activeTeam = (sp.team ?? '').trim();
  const scope = { orgId: ctx.org.id, userId: ctx.user.id, role: ctx.role };

  const convs = await listInbox(db, scope, status, activeLabel, activeTeam || undefined);
  const allLabels = await listOrgLabels(db, scope);
  const teams = await listTeams(db, scope);
  const canAssign = ctx.role === 'owner' || ctx.role === 'manager';
  const members = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(and(eq(schema.memberships.orgId, ctx.org.id), eq(schema.users.status, 'active')));
  const list = convs.map((c) => ({
    id: c.id, subject: c.subject || '(sem assunto)', visitorName: c.visitorName, visitorEmail: c.visitorEmail,
    channel: c.channel, status: c.status, assignedTo: c.assignedTo, teamId: c.teamId, labels: c.labels, lastMessageAt: c.lastMessageAt.toISOString(),
  }));

  const thread = sp.c ? await conversationThread(db, scope, sp.c) : null;
  const selected = thread && thread.conversation.audience === 'customer' ? {
    id: thread.conversation.id, subject: thread.conversation.subject, visitorName: thread.conversation.visitorName,
    visitorEmail: thread.conversation.visitorEmail, status: thread.conversation.status, assignedTo: thread.conversation.assignedTo,
    teamId: thread.conversation.teamId, labels: thread.conversation.labels,
    messages: thread.messages.map((m) => ({ id: m.id, author: m.author, body: m.body, at: m.createdAt.toISOString(), private: m.private, mentions: m.mentions })),
  } : null;

  return (
    <>
      <PageHeader eyebrow="Suporte" title="Inbox de suporte" subtitle="Conversas dos clientes chegam aqui. Responda e feche quando resolver." />
      <SupportInbox list={list} selected={selected} status={status} members={members} canAssign={canAssign} allLabels={allLabels} activeLabel={activeLabel} teams={teams.map((t) => ({ id: t.id, name: t.name }))} activeTeam={activeTeam} />
      {canAssign && <TeamsManager teams={teams} members={members} />}
      <OpenTicket />
    </>
  );
}

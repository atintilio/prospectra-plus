import { getDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { conversationThread, listInbox } from '@/lib/support';
import { SupportInbox } from './inbox';
import { OpenTicket } from './ticket';

export const metadata = { title: 'Suporte' };

export default async function SuportePage({ searchParams }: { searchParams: Promise<{ c?: string; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrg();
  const db = await getDb();
  const status = sp.status === 'closed' ? 'closed' as const : 'open' as const;
  const scope = { orgId: ctx.org.id, userId: ctx.user.id };

  const convs = (await listInbox(db, ctx.org.id, status)).filter((c) => c.audience === 'customer');
  const list = convs.map((c) => ({
    id: c.id, subject: c.subject || '(sem assunto)', visitorName: c.visitorName, visitorEmail: c.visitorEmail,
    channel: c.channel, status: c.status, lastMessageAt: c.lastMessageAt.toISOString(),
  }));

  const thread = sp.c ? await conversationThread(db, scope, sp.c) : null;
  const selected = thread && thread.conversation.audience === 'customer' ? {
    id: thread.conversation.id, subject: thread.conversation.subject, visitorName: thread.conversation.visitorName,
    visitorEmail: thread.conversation.visitorEmail, status: thread.conversation.status,
    messages: thread.messages.map((m) => ({ id: m.id, author: m.author, body: m.body, at: m.createdAt.toISOString() })),
  } : null;

  return (
    <>
      <PageHeader eyebrow="Suporte" title="Inbox de suporte" subtitle="Conversas dos clientes chegam aqui. Responda e feche quando resolver." />
      <SupportInbox list={list} selected={selected} status={status} />
      <OpenTicket />
    </>
  );
}

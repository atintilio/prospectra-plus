import { getDb } from '@/db';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { adminProductThread, listProductTickets } from '@/lib/support';
import { ArgusPanel } from './panel';

export const metadata = { title: 'Suporte interno' };

export default async function ArgusPage({ searchParams }: { searchParams: Promise<{ c?: string; status?: string }> }) {
  const sp = await searchParams;
  await requireAdmin();
  const db = await getDb();
  const status = sp.status === 'closed' ? 'closed' as const : 'open' as const;

  const rows = await listProductTickets(db, status);
  const list = rows.map(({ c, orgName }) => ({
    id: c.id, subject: c.subject || '(sem assunto)', orgName, user: c.visitorName, email: c.visitorEmail,
    status: c.status, lastMessageAt: c.lastMessageAt.toISOString(),
  }));

  const thread = sp.c ? await adminProductThread(db, sp.c) : null;
  const selected = thread ? {
    id: thread.conversation.id, subject: thread.conversation.subject, orgName: '', user: thread.conversation.visitorName,
    email: thread.conversation.visitorEmail, status: thread.conversation.status,
    messages: thread.messages.map((m) => ({ id: m.id, author: m.author, body: m.body, at: m.createdAt.toISOString() })),
  } : null;

  return (
    <>
      <PageHeader eyebrow="Argus" title="Suporte interno" subtitle="Chamados dos parceiros e vendedores sobre o Prospectra+. Responda e feche quando resolver." />
      <ArgusPanel list={list} selected={selected} status={status} />
    </>
  );
}

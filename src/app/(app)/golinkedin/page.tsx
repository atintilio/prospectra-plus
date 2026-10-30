import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { STATUS_LABEL } from '@/lib/linkedin';
import { PageHeader } from '@/components/ui';
import { GoLinkedInView, type AccountView } from './view';

export const metadata = { title: 'Go LinkedIn' };

function fmt(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d);
}

export default async function GoLinkedInPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const [account] = await db.select().from(schema.linkedinAccounts)
    .where(and(eq(schema.linkedinAccounts.orgId, ctx.org.id), eq(schema.linkedinAccounts.userId, ctx.user.id)))
    .limit(1);

  const view: AccountView = {
    exists: Boolean(account),
    label: account?.label ?? 'Principal',
    status: account?.status ?? 'disconnected',
    statusLabel: STATUS_LABEL[account?.status ?? 'disconnected'],
    demo: account?.demo ?? ctx.org.isDemo,
    providerId: account?.providerId ?? null,
    hasSession: Boolean(account?.sessionEnc),
    connectedAt: fmt(account?.connectedAt ?? null),
    lastCheckedAt: fmt(account?.lastCheckedAt ?? null),
    lastError: account?.lastError ?? null,
  };

  return (
    <>
      <PageHeader
        title="Go LinkedIn"
        subtitle="Conecte, teste e acompanhe o status da conta que executa suas prospecções."
        eyebrow="Conexão"
      />
      <GoLinkedInView account={view} isDemo={ctx.org.isDemo} dailyInvites={ctx.user.dailyInvites} dailyMessages={ctx.user.dailyMessages} />
    </>
  );
}

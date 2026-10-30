import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { canManage, requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { SettingsForm, type SettingsView } from './view';

export const metadata = { title: 'Configurações' };

export default async function ConfiguracoesPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const [s] = await db.select().from(schema.orgSettings).where(eq(schema.orgSettings.orgId, ctx.org.id));
  const initial: SettingsView = {
    senderEmail: s?.senderEmail ?? '',
    atendimentoStart: s?.atendimentoStart ?? '09:00',
    atendimentoEnd: s?.atendimentoEnd ?? '18:00',
    autoReply: s?.autoReply ?? '',
    features: s?.features ?? {},
  };
  return (
    <>
      <PageHeader title="Configurações" subtitle="E-mail remetente, horário de atendimento, autorresposta e recursos da organização." />
      <SettingsForm initial={initial} canEdit={canManage(ctx.role) || ctx.user.platformRole === 'admin'} />
    </>
  );
}

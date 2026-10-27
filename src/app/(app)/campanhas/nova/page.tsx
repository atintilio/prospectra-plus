import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { aiConfigured } from '@/lib/ai';
import { PageHeader } from '@/components/ui';
import { CampaignEditor, DEFAULT_STEPS } from '../editor';

export const metadata = { title: 'Nova campanha' };

export default async function NovaCampanha() {
  const ctx = await requireOrg();
  const db = await getDb();
  const members = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.orgId, ctx.org.id));
  return (
    <>
      <PageHeader title="Nova campanha" subtitle="Monte a sequência. Os textos usam variáveis e a IA adapta cada um ao lead." />
      <CampaignEditor id={null} initial={{ name: '', aiBrief: '', assignedTo: ctx.user.id, steps: DEFAULT_STEPS }} members={members} aiOn={aiConfigured()} />
    </>
  );
}

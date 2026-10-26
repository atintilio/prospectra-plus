import { and, desc, eq, ne } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { aiConfigured } from '@/lib/ai';
import { PageHeader } from '@/components/ui';
import { IntelligenceView } from './view';

export const metadata = { title: 'Inteligência comercial' };
export const maxDuration = 60;
export default async function IntelligencePage() {
  const ctx = await requireOrg();
  if (!ctx.org.active) return <p className="text-danger">Esta operação está inativa.</p>;
  const db = await getDb();
  const leads = await db.select({ id: schema.leads.id, fullName: schema.leads.fullName, company: schema.leads.company }).from(schema.leads)
    .where(and(eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.ownerId, ctx.user.id), ne(schema.leads.stage, 'do_not_contact')))
    .orderBy(desc(schema.leads.createdAt)).limit(200);
  return <>
    <PageHeader title="Inteligência comercial" subtitle="Prepare conversas com a sua estratégia, ofertas e identidade de vendedor." />
    <IntelligenceView leads={leads} sellerName={ctx.user.name} enabled={ctx.org.aiEnabled && aiConfigured()} demo={ctx.org.isDemo}
      status={!ctx.org.aiEnabled ? 'A IA está desligada nesta operação.' : !aiConfigured() ? 'O provedor de IA ainda não está configurado.' : 'IA disponível para gerar rascunhos sob revisão.'} />
  </>;
}

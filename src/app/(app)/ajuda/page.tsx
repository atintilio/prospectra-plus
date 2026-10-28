import { getDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { listArticles } from '@/lib/help';
import { HelpManager } from './manage';

export const metadata = { title: 'Central de ajuda' };

export default async function AjudaPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const articles = (await listArticles(db, ctx.org.id)).map((a) => ({ id: a.id, title: a.title, slug: a.slug, body: a.body, status: a.status, updatedAt: a.updatedAt.toISOString() }));
  return (
    <>
      <PageHeader eyebrow="Suporte" title="Central de ajuda" subtitle="Escreva artigos de autoatendimento. Os publicados aparecem na página pública de ajuda." />
      <HelpManager articles={articles} orgId={ctx.org.id} />
    </>
  );
}

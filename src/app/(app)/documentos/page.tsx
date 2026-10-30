import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { canManage, requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { DocsView, type DocItem } from './view';

export const metadata = { title: 'Documentos' };

export default async function DocumentosPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const rows = await db.select({ doc: schema.documents, author: schema.users.name }).from(schema.documents)
    .leftJoin(schema.users, eq(schema.users.id, schema.documents.createdById))
    .where(eq(schema.documents.orgId, ctx.org.id)).orderBy(desc(schema.documents.createdAt)).limit(200);
  const docs: DocItem[] = rows.map(({ doc, author }) => ({
    id: doc.id, title: doc.title, url: doc.url, notes: doc.notes,
    created: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(doc.createdAt),
    author: author ?? '—',
  }));
  return (
    <>
      <PageHeader title="Documentos" subtitle="Base de materiais da equipe: propostas, apresentações e scripts, sempre isolados por organização." />
      <DocsView docs={docs} canEdit={canManage(ctx.role) || ctx.user.platformRole === 'admin'} />
    </>
  );
}

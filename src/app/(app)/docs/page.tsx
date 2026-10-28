import { getDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { listDocs } from '@/lib/workspace';
import { DocManager } from './manage';

export const metadata = { title: 'Documentos' };

export default async function DocsPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const docs = (await listDocs(db, ctx.org.id)).map((d) => ({ id: d.id, title: d.title, body: d.body, updatedAt: d.updatedAt.toISOString() }));
  return (
    <>
      <PageHeader eyebrow="Workspace" title="Documentos" subtitle="Base de conhecimento interna da equipe." />
      <DocManager docs={docs} />
    </>
  );
}

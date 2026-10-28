import Link from 'next/link';
import { z } from 'zod';
import { getDb } from '@/db';
import { getPublishedBySlug, searchPublished } from '@/lib/help';

export const metadata = { title: 'Central de ajuda' };
export const dynamic = 'force-dynamic';

export default async function PublicHelpPage({ searchParams }: { searchParams: Promise<{ org?: string; q?: string; a?: string }> }) {
  const sp = await searchParams;
  const org = z.string().uuid().safeParse(sp.org);
  if (!org.success) {
    return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-muted">Central de ajuda indisponível.</main>;
  }
  const db = await getDb();
  const orgId = org.data;
  const base = `/central-de-ajuda?org=${orgId}`;
  const article = sp.a ? await getPublishedBySlug(db, orgId, sp.a) : null;
  const results = article ? [] : await searchPublished(db, orgId, sp.q);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Central de ajuda</h1>
      {article ? (
        <article>
          <Link href={base} className="text-sm text-accent hover:underline">← Voltar</Link>
          <h2 className="mt-4 text-xl font-semibold">{article.title}</h2>
          <div className="mt-4 whitespace-pre-wrap leading-relaxed text-ink">{article.body}</div>
        </article>
      ) : (
        <>
          <form className="mb-6" action={base} method="get">
            <input type="hidden" name="org" value={orgId} />
            <input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar na ajuda…" className="input" aria-label="Buscar" />
          </form>
          {results.length === 0 ? (
            <p className="text-muted">{sp.q ? 'Nenhum artigo encontrado.' : 'Nenhum artigo publicado ainda.'}</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {results.map((a) => (
                <li key={a.id}>
                  <Link href={`${base}&a=${a.slug}`} className="block px-4 py-3 hover:bg-surface">
                    <p className="font-medium">{a.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-muted">{a.body.slice(0, 160)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

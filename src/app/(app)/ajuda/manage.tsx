'use client';

import { ExternalLink, Eye, EyeOff, PenLine, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { deleteArticleAction, saveArticleAction, setArticleStatusAction } from '../actions';

type Article = { id: string; title: string; slug: string; body: string; status: 'draft' | 'published'; updatedAt: string };

export function HelpManager({ articles, orgId }: { articles: Article[]; orgId: string }) {
  const [sel, setSel] = useState<Article | null>(null); // null = novo artigo
  const [state, action, pending] = useActionState(saveArticleAction, undefined);
  const [, start] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Artigos</span>
          <button className="btn-ghost text-sm" onClick={() => setSel(null)}><Plus className="h-4 w-4" /> Novo</button>
        </div>
        {articles.length === 0 ? <p className="px-4 py-6 text-sm text-muted">Nenhum artigo ainda.</p> : (
          <ul className="max-h-[66vh] divide-y divide-border overflow-y-auto">
            {articles.map((a) => (
              <li key={a.id}>
                <button onClick={() => setSel(a)} className={`block w-full px-4 py-3 text-left hover:bg-surface ${sel?.id === a.id ? 'bg-surface' : ''}`}>
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                    <span className={`pill ${a.status === 'published' ? 'bg-surface-accent text-accent' : 'text-muted'}`}>{a.status === 'published' ? 'Publicado' : 'Rascunho'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border px-4 py-3">
          <Link href={`/central-de-ajuda?org=${orgId}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-accent hover:underline"><ExternalLink className="h-3 w-3" /> Ver página pública</Link>
        </div>
      </aside>

      <section className="card p-5">
        <form key={sel?.id ?? 'new'} action={action} className="space-y-3">
          <input type="hidden" name="id" value={sel?.id ?? ''} />
          <div><label className="label" htmlFor="title">Título</label><input id="title" name="title" className="input" defaultValue={sel?.title ?? ''} maxLength={160} required /></div>
          <div><label className="label" htmlFor="body">Conteúdo</label><textarea id="body" name="body" rows={14} className="input resize-y leading-relaxed" defaultValue={sel?.body ?? ''} /></div>
          {state?.error && <p className="text-sm text-warning">{state.error}</p>}
          {state?.ok && <p className="text-sm text-accent">{state.ok}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={pending}><PenLine className="h-4 w-4" /> Salvar</button>
            {sel && (sel.status === 'published'
              ? <button type="button" className="btn-outline" onClick={() => start(() => { void setArticleStatusAction(sel.id, 'draft'); })}><EyeOff className="h-4 w-4" /> Despublicar</button>
              : <button type="button" className="btn-outline" onClick={() => start(() => { void setArticleStatusAction(sel.id, 'published'); })}><Eye className="h-4 w-4" /> Publicar</button>)}
            {sel && <button type="button" className="btn-ghost" onClick={() => { const id = sel.id; setSel(null); start(() => { void deleteArticleAction(id); }); }}><Trash2 className="h-4 w-4" /> Excluir</button>}
          </div>
        </form>
      </section>
    </div>
  );
}

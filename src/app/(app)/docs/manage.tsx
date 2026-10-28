'use client';

import { PenLine, Plus, Trash2 } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { deleteDocAction, saveDocAction } from '../actions';

type Doc = { id: string; title: string; body: string; updatedAt: string };

export function DocManager({ docs }: { docs: Doc[] }) {
  const [sel, setSel] = useState<Doc | null>(null);
  const [state, action, pending] = useActionState(saveDocAction, undefined);
  const [, start] = useTransition();
  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Documentos</span>
          <button className="btn-ghost text-sm" onClick={() => setSel(null)}><Plus className="h-4 w-4" /> Novo</button>
        </div>
        {docs.length === 0 ? <p className="px-4 py-6 text-sm text-muted">Nenhum documento.</p> : (
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {docs.map((d) => (
              <li key={d.id}><button onClick={() => setSel(d)} className={`block w-full truncate px-4 py-3 text-left text-sm hover:bg-surface ${sel?.id === d.id ? 'bg-surface font-medium' : ''}`}>{d.title}</button></li>
            ))}
          </ul>
        )}
      </aside>
      <section className="card p-5">
        <form key={sel?.id ?? 'new'} action={action} className="space-y-3">
          <input type="hidden" name="id" value={sel?.id ?? ''} />
          <div><label className="label" htmlFor="title">Título</label><input id="title" name="title" className="input" defaultValue={sel?.title ?? ''} maxLength={200} required /></div>
          <div><label className="label" htmlFor="body">Conteúdo</label><textarea id="body" name="body" rows={16} className="input resize-y leading-relaxed" defaultValue={sel?.body ?? ''} /></div>
          {state?.error && <p className="text-sm text-warning">{state.error}</p>}
          {state?.ok && <p className="text-sm text-accent">{state.ok}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={pending}><PenLine className="h-4 w-4" /> Salvar</button>
            {sel && <button type="button" className="btn-ghost" onClick={() => { const id = sel.id; setSel(null); start(() => { void deleteDocAction(id); }); }}><Trash2 className="h-4 w-4" /> Excluir</button>}
          </div>
        </form>
      </section>
    </div>
  );
}

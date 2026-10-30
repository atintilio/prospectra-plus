'use client';

import { FileText, Link2, Plus, Trash2 } from 'lucide-react';
import { useActionState, useTransition } from 'react';
import { FormMessage, Submit } from '@/components/form';
import { deleteDocumentAction, createDocumentAction, type DocsState } from './actions';

export type DocItem = { id: string; title: string; url: string; notes: string; created: string; author: string };

export function DocsView({ docs, canEdit }: { docs: DocItem[]; canEdit: boolean }) {
  const [state, action] = useActionState<DocsState, FormData>(createDocumentAction, undefined);
  const [, start] = useTransition();
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      {canEdit && (
        <section className="card space-y-3 p-5 self-start">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Plus className="h-4 w-4 text-accent" /> Cadastrar documento</h2>
          <form action={action} className="space-y-3">
            <div><label className="label" htmlFor="title">Título</label>
              <input id="title" name="title" className="input" placeholder="Proposta padrão — Lucro Real" required /></div>
            <div><label className="label" htmlFor="url">Link</label>
              <input id="url" name="url" type="url" className="input" placeholder="https://…" /></div>
            <div><label className="label" htmlFor="notes">Notas</label>
              <textarea id="notes" name="notes" rows={3} className="input" placeholder="Quando usar, quais leads…" /></div>
            <Submit className="btn-primary" pendingText="Salvando…">Cadastrar</Submit>
          </form>
          {state && <FormMessage state={state} />}
        </section>
      )}
      <section className="space-y-3">
        {docs.map((d) => (
          <article key={d.id} className="card flex items-start gap-3 p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-accent text-accent"><FileText className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="font-semibold">{d.title}</p>
              {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent hover:underline"><Link2 className="h-3 w-3" /> abrir link</a>}
              {d.notes && <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{d.notes}</p>}
              <p className="mt-1 text-xs text-muted">{d.author} · {d.created}</p>
            </div>
            {canEdit && (
              <button className="ml-auto btn-ghost px-2 py-1 hover:text-danger" aria-label="Remover"
                onClick={() => start(async () => deleteDocumentAction(d.id))}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </article>
        ))}
        {!docs.length && <p className="card p-8 text-center text-sm text-muted">Nenhum documento cadastrado ainda.</p>}
      </section>
    </div>
  );
}

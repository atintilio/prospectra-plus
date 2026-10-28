'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useActionState, useTransition } from 'react';
import { assignTaskAction, createTaskAction, deleteTaskAction, setTaskStatusAction } from '../actions';

type Member = { id: string; name: string };
type Task = { id: string; title: string; status: 'todo' | 'doing' | 'done'; assignedTo: string | null };
const COLS = [{ k: 'todo', label: 'A fazer' }, { k: 'doing', label: 'Fazendo' }, { k: 'done', label: 'Feito' }] as const;

export function Board({ tasks, members }: { tasks: Task[]; members: Member[] }) {
  const [state, create, pending] = useActionState(createTaskAction, undefined);
  const [, start] = useTransition();
  return (
    <div>
      <form action={create} className="card mb-6 flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-[200px] flex-1"><label className="label" htmlFor="t">Nova tarefa</label><input id="t" name="title" className="input" placeholder="O que precisa ser feito?" maxLength={200} required /></div>
        <select name="assignedTo" className="input max-w-[180px]" defaultValue=""><option value="">Sem responsável</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <button type="submit" className="btn-primary" disabled={pending}><Plus className="h-4 w-4" /> Adicionar</button>
        {state?.error && <p className="w-full text-sm text-warning">{state.error}</p>}
      </form>
      <div className="grid gap-4 md:grid-cols-3">
        {COLS.map((col) => {
          const items = tasks.filter((t) => t.status === col.k);
          return (
            <section key={col.k} className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">{col.label} <span className="text-muted">({items.length})</span></h2>
              <ul className="space-y-2">
                {items.map((t) => (
                  <li key={t.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">{t.title}</p>
                    <p className="mt-1 text-xs text-muted">{members.find((m) => m.id === t.assignedTo)?.name ?? 'Sem responsável'}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <select className="input h-8 py-0 text-xs" value={t.status} onChange={(e) => start(() => { void setTaskStatusAction(t.id, e.target.value as Task['status']); })}>
                        <option value="todo">A fazer</option><option value="doing">Fazendo</option><option value="done">Feito</option>
                      </select>
                      <select className="input h-8 py-0 text-xs" value={t.assignedTo ?? ''} onChange={(e) => start(() => { void assignTaskAction(t.id, e.target.value || null); })}>
                        <option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <button className="ml-auto text-muted hover:text-accent" title="Excluir" onClick={() => start(() => { void deleteTaskAction(t.id); })}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
                {items.length === 0 && <li className="text-xs text-muted">Vazio.</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

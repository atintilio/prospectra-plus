'use client';

import { useActionState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { saveAttributeDefAction, deleteAttributeDefAction } from '../../actions';

type State = { error?: string; ok?: string } | undefined;

const TYPE_LABELS: Record<string, string> = {
  text: 'Texto', number: 'Número', date: 'Data', bool: 'Sim/Não', select: 'Lista',
};

export function AttributeForm() {
  const [state, action, pending] = useActionState(saveAttributeDefAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nome do campo</span>
          <input className="input w-full" name="name" placeholder="Ex.: Segmento do cliente" maxLength={80} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tipo</span>
          <select className="input w-full" name="type" defaultValue="text">
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Opções (lista) — separadas por vírgula</span>
        <input className="input w-full" name="options" placeholder="Ex.: Pequeno, Médio, Grande" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" /> Campo obrigatório
      </label>
      <button className="btn-primary" disabled={pending}>
        <span className="inline-flex items-center gap-1.5">{pending ? 'Criando…' : <><Plus className="h-4 w-4" />Criar campo</>}</span>
      </button>
      {(state?.ok || state?.error) && <p className={`text-xs ${state?.error ? 'text-danger' : 'text-muted'}`} role="status">{state?.error ?? state?.ok}</p>}
    </form>
  );
}

export function AttributeList({ defs }: {
  defs: { id: string; name: string; key: string; type: string; options: string[]; required: boolean }[];
}) {
  const [, start] = useTransition();
  if (defs.length === 0) {
    return <p className="text-sm text-muted">Nenhum campo personalizado ainda. Crie o primeiro para segmentar seus leads.</p>;
  }
  return (
    <ul className="space-y-2">
      {defs.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
          <span className="font-medium">{d.name}</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">{TYPE_LABELS[d.type] ?? d.type}</span>
          {d.required && <span className="rounded-full bg-surface-accent px-2 py-0.5 text-xs text-accent">obrigatório</span>}
          <span className="text-xs text-muted">{d.key}</span>
          {d.options.length > 0 && <span className="text-xs text-muted">{d.options.join(' · ')}</span>}
          <button className="btn-ghost ml-auto px-2 py-1 hover:text-danger" title={`Remover ${d.name}`}
            onClick={() => start(async () => { await deleteAttributeDefAction(d.id); })}>
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

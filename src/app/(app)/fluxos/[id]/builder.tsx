'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  ArrowDown, ArrowUp, Copy, GripVertical, Lock, Plus, Save, Trash2, X,
} from 'lucide-react';
import { FLOW_STEP_BLOCKS, type FlowStepType } from '@/lib/flows/types';
import { reorderFlowSteps } from '@/lib/flows/order';
import { saveFlowAction } from '../actions';

/** Uma etapa do fluxo, como o construtor a manipula. */
export type EditableFlowStep = {
  id: string;
  position: number;
  type: FlowStepType;
  name: string;
  delayDays: number;
  condition: 'always' | 'accepted';
  template: string;
  useAi: boolean;
  subject: string;
  mediaUrl: string;
};

type Props = {
  flowId: string;
  initialName: string;
  initialStatus: 'draft' | 'active' | 'paused';
  initialSteps: EditableFlowStep[];
  available: FlowStepType[];
  blocked: { type: FlowStepType; reason: string }[];
};

const FEATURE_REASON: Record<string, string> = {
  image: 'O informativo por imagem não está ativado nesta operação.',
  call: 'A ligação assistida não está ativada nesta operação.',
  linkedin: 'O LinkedIn não está ativado nesta operação.',
};

function newId(): string {
  return `novo-${Math.random().toString(36).slice(2, 10)}`;
}

/** Dia em que a etapa acontece (soma das esperas). */
function accumulatedDays(steps: EditableFlowStep[]): number[] {
  let day = 0;
  return steps.map((step) => {
    day += step.delayDays;
    return day;
  });
}

export function FlowBuilder({ flowId, initialName, initialStatus, initialSteps, available, blocked }: Props) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<'draft' | 'active' | 'paused'>(initialStatus);
  const [steps, setSteps] = useState<EditableFlowStep[]>(initialSteps);
  const [selectedId, setSelectedId] = useState<string | null>(initialSteps[0]?.id ?? null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});

  const days = useMemo(() => accumulatedDays(steps), [steps]);
  const selected = steps.find((step) => step.id === selectedId) ?? null;

  function update(id: string, patch: Partial<EditableFlowStep>) {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  }

  function addBlock(type: FlowStepType) {
    const step: EditableFlowStep = {
      id: newId(),
      position: steps.length,
      type,
      name: FLOW_STEP_BLOCKS[type].short,
      delayDays: steps.length === 0 ? 0 : 1,
      condition: 'always',
      template: '',
      useAi: false,
      subject: '',
      mediaUrl: '',
    };
    setSteps((current) => [...current, step]);
    setSelectedId(step.id);
    setMessage({ ok: `Bloco "${FLOW_STEP_BLOCKS[type].short}" adicionado ao final. Arraste para mudar a ordem.` });
  }

  function removeBlock(id: string) {
    setSteps((current) => current.filter((step) => step.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateBlock(id: string) {
    setSteps((current) => {
      const index = current.findIndex((step) => step.id === id);
      if (index < 0) return current;
      const copy = { ...current[index], id: newId() };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next.map((step, i) => ({ ...step, position: i }));
    });
  }

  function move(id: string, delta: number) {
    setSteps((current) => {
      const index = current.findIndex((step) => step.id === id);
      const to = index + delta;
      if (index < 0 || to < 0 || to >= current.length) return current;
      return reorderFlowSteps(current, index, to);
    });
  }

  function onDrop(target: number) {
    if (dragIndex === null) return;
    setSteps((current) => reorderFlowSteps(current, dragIndex, target));
    setDragIndex(null);
  }

  function save() {
    startTransition(async () => {
      const result = await saveFlowAction(flowId, { name, status, steps });
      setMessage(result);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_20rem]">
      {/* Paleta */}
      <section className="card h-fit p-4" aria-label="Blocos disponíveis">
        <h2 className="text-sm font-semibold">Blocos</h2>
        <p className="mt-1 text-xs text-muted">Clique para adicionar ao final da sequência.</p>
        <ul className="mt-3 space-y-1.5">
          {available.map((type) => {
            const block = FLOW_STEP_BLOCKS[type];
            const Icon = block.icon;
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => addBlock(type)}
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-white/70 px-3 py-2 text-left text-sm transition hover:border-accent/40 hover:bg-surface-accent"
                >
                  <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <span className="truncate">{block.short}</span>
                  <Plus className="ml-auto h-3.5 w-3.5 text-muted" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        {blocked.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[.12em] text-muted">Travados na operação</h3>
            <ul className="mt-2 space-y-1.5">
              {blocked.map(({ type, reason }) => {
                const block = FLOW_STEP_BLOCKS[type];
                const Icon = block.icon;
                return (
                  <li key={type} className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted" title={reason || FEATURE_REASON[type]}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{block.short}</span>
                    <Lock className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      {/* Sequência */}
      <section className="card p-5" aria-label="Sequência do fluxo">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="flow-name">Nome do fluxo</label>
            <input id="flow-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="flow-status">Situação</label>
            <select id="flow-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'active' | 'paused')}>
              <option value="draft">Rascunho</option>
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
            </select>
          </div>
          <button className="btn-primary" onClick={save} disabled={pending}>
            <Save className="h-4 w-4" aria-hidden="true" /> {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>

        {message.ok ? <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-sm text-success" role="status">{message.ok}</p> : null}
        {message.error ? <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{message.error}</p> : null}

        <ol className="mt-5 space-y-2">
          {steps.length === 0 ? (
            <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              Nenhum bloco ainda. Escolha um bloco na coluna da esquerda.
            </li>
          ) : null}
          {steps.map((step, index) => {
            const block = FLOW_STEP_BLOCKS[step.type];
            const Icon = block.icon;
            const isSelected = step.id === selectedId;
            return (
              <li
                key={step.id}
                onDragOver={(e) => { if (dragIndex !== null && dragIndex !== index) e.preventDefault(); }}
                onDrop={() => onDrop(index)}
                className={`rounded-xl border bg-white/80 transition ${isSelected ? 'border-accent/60 ring-2 ring-accent/20' : 'border-border'}`}
              >
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span
                    className="cursor-grab text-muted"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => setDragIndex(null)}
                    aria-label={`Arrastar ${block.short}`}
                  >
                    <GripVertical className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedId(isSelected ? null : step.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-left font-medium">{step.name || block.short}</span>
                  </button>
                  <span className="pill bg-surface text-muted">Dia {days[index]}</span>
                  {step.condition === 'accepted' ? <span className="pill bg-surface-accent text-accent">se aceitar</span> : null}
                  {step.useAi ? <span className="pill bg-surface-accent text-accent">IA</span> : null}
                  <span className="flex items-center">
                    <button type="button" onClick={() => move(step.id, -1)} disabled={index === 0} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-text disabled:opacity-30" aria-label="Subir bloco">
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => move(step.id, 1)} disabled={index === steps.length - 1} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-text disabled:opacity-30" aria-label="Descer bloco">
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => duplicateBlock(step.id)} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-text" aria-label="Duplicar bloco">
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => removeBlock(step.id)} className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-danger" aria-label="Remover bloco">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Configuração do bloco */}
      <section className="card h-fit p-4" aria-label="Configuração do bloco">
        <h2 className="text-sm font-semibold">Configurar bloco</h2>
        {!selected ? (
          <p className="mt-3 text-sm text-muted">Escolha um bloco da sequência para configurar o texto, a espera e a condição.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div>
              <label className="label" htmlFor="step-name">Nome do bloco</label>
              <input id="step-name" className="input" value={selected.name} maxLength={80} onChange={(e) => update(selected.id, { name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="step-delay">Espera (dias)</label>
                <input id="step-delay" type="number" min={0} max={365} className="input" value={selected.delayDays} onChange={(e) => update(selected.id, { delayDays: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <label className="label" htmlFor="step-condition">Condição</label>
                <select id="step-condition" className="input" value={selected.condition} onChange={(e) => update(selected.id, { condition: e.target.value as 'always' | 'accepted' })}>
                  <option value="always">Sempre</option>
                  <option value="accepted">Se aceitar</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="step-template">Texto</label>
              <textarea id="step-template" rows={5} className="input" value={selected.template} onChange={(e) => update(selected.id, { template: e.target.value })} placeholder="Olá {nome},…" />
              <p className="mt-1 text-[11px] text-muted">Use <code>{'{nome}'}</code>, <code>{'{empresa}'}</code> e <code>{'{cargo}'}</code>.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.useAi} onChange={(e) => update(selected.id, { useAi: e.target.checked })} />
              Escrever o texto com a IA
            </label>
            {selected.type === 'email' ? (
              <div>
                <label className="label" htmlFor="step-subject">Assunto do e-mail</label>
                <input id="step-subject" className="input" value={selected.subject} onChange={(e) => update(selected.id, { subject: e.target.value })} />
              </div>
            ) : null}
            {selected.type === 'image' ? (
              <div>
                <label className="label" htmlFor="step-media">Link da mídia</label>
                <input id="step-media" className="input" value={selected.mediaUrl} onChange={(e) => update(selected.id, { mediaUrl: e.target.value })} />
              </div>
            ) : null}
            <button type="button" onClick={() => setSelectedId(null)} className="btn-ghost w-full">
              <X className="h-4 w-4" aria-hidden="true" /> Fechar
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

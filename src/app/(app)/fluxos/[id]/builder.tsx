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

/** Canal de cada bloco (linguagem do editor de campanha). */
type Canal = { rotulo: string; cor: string; fundo: string };

const CANAL: Record<FlowStepType, Canal> = {
  react: { rotulo: 'LinkedIn', cor: '#0A66C2', fundo: 'rgba(10,102,194,.12)' },
  comment: { rotulo: 'LinkedIn', cor: '#0A66C2', fundo: 'rgba(10,102,194,.12)' },
  invite: { rotulo: 'LinkedIn', cor: '#0A66C2', fundo: 'rgba(10,102,194,.12)' },
  message: { rotulo: 'LinkedIn', cor: '#0A66C2', fundo: 'rgba(10,102,194,.12)' },
  email: { rotulo: 'E-mail', cor: '#475467', fundo: 'rgba(71,84,103,.10)' },
  whatsapp: { rotulo: 'WhatsApp', cor: '#128C4A', fundo: 'rgba(37,211,102,.16)' },
  voice: { rotulo: 'WhatsApp', cor: '#128C4A', fundo: 'rgba(37,211,102,.16)' },
  image: { rotulo: 'WhatsApp', cor: '#128C4A', fundo: 'rgba(37,211,102,.16)' },
  call: { rotulo: 'WhatsApp', cor: '#128C4A', fundo: 'rgba(37,211,102,.16)' },
};

/** O que o arraste carrega: mover uma etapa ou trazer um bloco novo. */
type Carga =
  | { tipo: 'mover'; id: string }
  | { tipo: 'novo'; bloco: FlowStepType };

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
  const [hotGap, setHotGap] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});

  const days = useMemo(() => accumulatedDays(steps), [steps]);
  const totalDays = days.length ? days[days.length - 1] : 0;
  const selected = steps.find((step) => step.id === selectedId) ?? null;

  function update(id: string, patch: Partial<EditableFlowStep>) {
    setSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  }

  function makeStep(type: FlowStepType): EditableFlowStep {
    return {
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
  }

  function insertStep(step: EditableFlowStep, index: number) {
    setSteps((current) => {
      const next = [...current];
      next.splice(index, 0, step);
      return next.map((s, i) => ({ ...s, position: i }));
    });
    setSelectedId(step.id);
  }

  function addBlock(type: FlowStepType, index = steps.length) {
    const step = makeStep(type);
    insertStep(step, Math.min(index, steps.length));
    setMessage({ ok: `Bloco "${FLOW_STEP_BLOCKS[type].short}" adicionado. Salve para gravar.` });
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

  /** Início do arraste: guarda a carga (mover ou bloco novo). */
  function startDrag(e: React.DragEvent, carga: Carga) {
    e.dataTransfer.effectAllowed = carga.tipo === 'mover' ? 'move' : 'copy';
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify(carga));
    } catch {
      /* navegador sem suporte: o drop usa o estado local */
    }
    if (carga.tipo === 'mover') setDraggingId(carga.id);
  }

  /** Fim do arraste (se o drop não aconteceu). */
  function endDrag() {
    setDraggingId(null);
    setHotGap(null);
  }

  /** Solta a carga no vão `index` (posição entre os blocos). */
  function dropAt(index: number, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setHotGap(null);
    setDraggingId(null);

    let carga: Carga | null = null;
    const raw = e.dataTransfer.getData('text/plain');
    if (raw) {
      try {
        carga = JSON.parse(raw) as Carga;
      } catch {
        carga = null;
      }
    }
    if (!carga) return;

    if (carga.tipo === 'novo') {
      addBlock(carga.bloco, index);
      return;
    }

    setSteps((current) => {
      const from = current.findIndex((step) => step.id === carga.id);
      if (from < 0) return current;
      // `index` e a posicao do vao (antes de remover o bloco arrastado).
      let to = index;
      if (from < to) to -= 1;
      to = Math.max(0, Math.min(to, current.length - 1));
      if (from === to) return current;
      return reorderFlowSteps(current, from, to);
    });
    setSelectedId(carga.id);
  }

  function save() {
    startTransition(async () => {
      const result = await saveFlowAction(flowId, { name, status, steps });
      setMessage(result);
    });
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho do fluxo */}
      <section className="card p-5" aria-label="Dados do fluxo">
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
      </section>

      {/* Visão geral: leitura horizontal do fluxo inteiro */}
      <section className="card p-4" aria-label="Visão geral do fluxo">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-[.14em] text-muted">Visão geral</h2>
          <p className="text-xs text-muted">
            {steps.length} {steps.length === 1 ? 'etapa' : 'etapas'} · termina no dia {totalDays}
          </p>
        </div>
        {steps.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            Nenhuma etapa ainda. Arraste um bloco de baixo para o fluxo começar.
          </p>
        ) : (
          <ol className="mt-3 flex flex-wrap items-stretch gap-2">
            {steps.map((step, index) => {
              const block = FLOW_STEP_BLOCKS[step.type];
              const Icon = block.icon;
              const canal = CANAL[step.type];
              return (
                <li key={step.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(step.id)}
                    className={`min-w-[9.5rem] rounded-xl border bg-white px-3 py-2 text-left transition hover:border-accent/50 ${step.id === selectedId ? 'border-accent/60 ring-2 ring-accent/20' : 'border-border'}`}
                    title={`${index + 1}. ${step.name || block.short}`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: canal.cor }} aria-hidden="true" />
                      <span className="truncate">{index + 1}. {step.name || block.short}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {canal.rotulo} · dia {days[index]}
                    </span>
                  </button>
                  {index < steps.length - 1 ? <span className="text-muted" aria-hidden="true">→</span> : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Paleta: blocos que vão para o fluxo */}
      <section className="card p-4" aria-label="Blocos disponíveis">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Blocos disponíveis</h2>
          <p className="text-xs text-muted">Arraste para o fluxo (na posição desejada) ou clique para adicionar ao final.</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {available.map((type) => {
            const block = FLOW_STEP_BLOCKS[type];
            const Icon = block.icon;
            const canal = CANAL[type];
            return (
              <button
                key={type}
                type="button"
                draggable
                onDragStart={(e) => startDrag(e, { tipo: 'novo', bloco: type })}
                onDragEnd={endDrag}
                onClick={() => addBlock(type)}
                className="inline-flex cursor-grab items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium transition hover:border-accent hover:bg-surface-accent hover:text-accent active:cursor-grabbing"
              >
                <Icon className="h-4 w-4 shrink-0" style={{ color: canal.cor }} aria-hidden="true" />
                <span>{block.label}</span>
                <Plus className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {blocked.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.12em] text-muted">
              <Lock className="h-3 w-3" aria-hidden="true" /> Travados na operação
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {blocked.map(({ type, reason }) => {
                const block = FLOW_STEP_BLOCKS[type];
                const Icon = block.icon;
                return (
                  <span
                    key={type}
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted"
                    title={reason || FEATURE_REASON[type]}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{block.label}</span>
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Canvas: a sequência arrastável */}
        <section className="card p-5" aria-label="Sequência do fluxo">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Sequência</h2>
            <p className="text-xs text-muted">Arraste a alça para reordenar · solte entre os blocos.</p>
          </div>

          <ol className="mt-4">
            {steps.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                Nenhum bloco ainda. Arraste um bloco de cima para cá.
              </li>
            ) : null}
            {steps.map((step, index) => {
              const block = FLOW_STEP_BLOCKS[step.type];
              const Icon = block.icon;
              const canal = CANAL[step.type];
              const isSelected = step.id === selectedId;
              return (
                <li key={step.id}>
                  <Vao
                    index={index}
                    hot={hotGap === index}
                    onHot={setHotGap}
                    onDrop={dropAt}
                  />
                  <article
                    className={`rounded-2xl border bg-white transition ${isSelected ? 'border-accent/60 ring-2 ring-accent/20' : 'border-border'} ${draggingId === step.id ? 'opacity-45' : ''}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span
                        className="cursor-grab text-muted hover:bg-surface-accent hover:text-accent active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => startDrag(e, { tipo: 'mover', id: step.id })}
                        onDragEnd={endDrag}
                        role="button"
                        tabIndex={0}
                        aria-label={`Arrastar ${step.name || block.short}`}
                        title="Arraste para reordenar"
                      >
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-accent text-xs font-bold text-accent">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedId(isSelected ? null : step.id)}
                        className="flex min-w-0 flex-1 flex-col items-start text-left"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0" style={{ color: canal.cor }} aria-hidden="true" />
                          <span className="truncate font-semibold">{step.name || block.short}</span>
                        </span>
                        <span className="mt-0.5 text-xs text-muted">
                          {canal.rotulo} · {block.label.split('· ')[1] ?? block.short} · dia {days[index]} · espera {step.delayDays} dia(s)
                        </span>
                      </button>
                      <span className="flex shrink-0 items-center gap-1.5">
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
                          <button type="button" onClick={() => removeBlock(step.id)} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label="Remover bloco">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      </span>
                    </div>
                  </article>
                </li>
              );
            })}
            {steps.length > 0 ? (
              <li>
                <Vao index={steps.length} hot={hotGap === steps.length} onHot={setHotGap} onDrop={dropAt} />
                <p className="pb-1 text-center text-xs text-muted">Solte aqui para adicionar ao final</p>
              </li>
            ) : null}
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
    </div>
  );
}

/** Vão entre dois blocos: alvo do arraste. */
function Vao({
  index,
  hot,
  onHot,
  onDrop,
}: {
  index: number;
  hot: boolean;
  onHot: (index: number | null) => void;
  onDrop: (index: number, e: React.DragEvent) => void;
}) {
  return (
    <div
      data-gap={index}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onHot(index);
      }}
      onDragLeave={() => onHot(null)}
      onDrop={(e) => onDrop(index, e)}
      className={`my-1 h-2.5 rounded-full transition ${hot ? 'bg-accent/20 ring-1 ring-accent/40' : ''}`}
      aria-hidden="true"
    />
  );
}

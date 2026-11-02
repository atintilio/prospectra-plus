'use client';

import { ArrowDown, ArrowRight, ArrowUp, GripVertical, Heart, Image, Mail, MessageCircle, MessageSquare, Mic, Phone, Plus, Send, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CampaignStep, StepType } from '@/db/schema';
import { stepTypeEnabled, type CampaignFeatures } from '@/lib/campaign-features';
import { saveCampaignAction, setCampaignFlowAction } from '../actions';

export const DEFAULT_STEPS: CampaignStep[] = [
  { id: 's1', type: 'react', delayDays: 0, condition: 'always', template: '', useAi: false },
  { id: 's2', type: 'invite', delayDays: 1, condition: 'always', template: 'Olá {nome}, acompanho o trabalho da {empresa} e gostaria de trocar ideias com você por aqui.', useAi: true },
  { id: 's3', type: 'message', delayDays: 1, condition: 'accepted', template: 'Obrigado por aceitar, {nome}! Trabalho com empresas como a {empresa} em [seu tema]. Como vocês lidam hoje com [dor]?', useAi: true },
  { id: 's4', type: 'message', delayDays: 4, condition: 'always', template: '{nome}, faz sentido uma conversa rápida de 15 minutos nesta semana?', useAi: false },
];

const TYPES: Record<StepType, { label: string; short: string; icon: typeof Send }> = {
  react: { label: 'LinkedIn · reagir a post', short: 'Reagir', icon: Heart }, comment: { label: 'LinkedIn · comentar post', short: 'Comentar', icon: MessageCircle },
  invite: { label: 'LinkedIn · convite', short: 'Convite', icon: UserPlus }, message: { label: 'LinkedIn · mensagem', short: 'Mensagem', icon: Send },
  email: { label: 'E-mail', short: 'E-mail', icon: Mail }, whatsapp: { label: 'WhatsApp', short: 'WhatsApp', icon: MessageSquare },
  voice: { label: 'WhatsApp · voz', short: 'Voz', icon: Mic },
  image: { label: 'WhatsApp · imagem/informativo', short: 'Imagem', icon: Image },
  call: { label: 'WhatsApp · ligação (assistida)', short: 'Ligação', icon: Phone },
};

/**
 * Passo editável: o `name` é o rótulo dado pelo vendedor à etapa (RF7 do PRD).
 * Vive no editor porque o tipo persistido do passo (`CampaignStep`) é do schema.
 */
export type EditableStep = CampaignStep & { name?: string };

type Initial = { name: string; aiBrief: string; assignedTo: string | null; steps: EditableStep[] };

/** Fluxo disponível na operação (modelo de cadência). */
export type CampaignFlow = { id: string; name: string; status: string; stepCount: number };
/** Fluxo já vinculado à campanha, com as etapas que ele executa. */
export type LinkedFlow = { id: string; name: string; steps: EditableStep[] };

/** Dia acumulado de cada etapa (mesma conta da prévia). */
function accumulatedDays(steps: EditableStep[]): number[] {
  let acc = 0;
  return steps.map((s) => (acc += s.delayDays));
}

/** Mini-mapa do fluxo: os blocos na ordem em que a cadência acontece (RF7). */
function FlowPreview({ steps }: { steps: EditableStep[] }) {
  const days = accumulatedDays(steps);
  const total = days.length ? days[days.length - 1] : 0;
  return (
    <section className="card p-4" aria-label="Prévia do fluxo">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted">Prévia do fluxo</p>
        <p className="text-xs text-muted">{steps.length} passos · {total === 0 ? 'começa hoje' : `termina no dia ${total}`}</p>
      </header>
      {steps.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Adicione um passo para ver a sequência do fluxo.</p>
      ) : (
        <ol className="mt-3 flex flex-wrap items-stretch gap-y-2">
          {steps.map((s, i) => {
            const T = TYPES[s.type];
            return (
              <li key={s.id} className="flex items-center gap-2">
                <div className="min-w-[124px] rounded-xl border border-border bg-surface px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-text">
                    <T.icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="truncate">{i + 1}. {T.short}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {s.name?.trim() ? `${s.name.trim()} · dia ${days[i]}` : `dia ${days[i]}`}
                  </p>
                </div>
                {i < steps.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function CampaignEditor({ id, initial, members, aiOn, features, flows = [], linkedFlow = null }: { id: string | null; initial: Initial; members: { id: string; name: string; email: string }[]; aiOn: boolean; features: CampaignFeatures; flows?: CampaignFlow[]; linkedFlow?: LinkedFlow | null }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, start] = useTransition();
  // Vínculo campanha ↔ fluxo: com fluxo, a cadência executa as etapas do fluxo (modelo).
  const [flowId, setFlowId] = useState<string | null>(linkedFlow?.id ?? null);
  const [flowChoice, setFlowChoice] = useState<string>(linkedFlow?.id ?? '');
  const [flowMsg, setFlowMsg] = useState<{ ok?: string; error?: string }>();
  const [flowPending, startFlow] = useTransition();

  const setStep = (i: number, patch: Partial<EditableStep>) => { setSaved(false); setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })); };
  const move = (i: number, d: -1 | 1) => setForm((f) => { const s = [...f.steps]; [s[i], s[i + d]] = [s[i + d], s[i]]; return { ...f, steps: s }; });
  const reorder = (from: number, to: number) => { setSaved(false); setForm((f) => { if (from === to || from < 0 || from >= f.steps.length) return f; const s = [...f.steps]; const [m] = s.splice(from, 1); s.splice(to, 0, m); return { ...f, steps: s }; }); };
  const add = (type: StepType) => setForm((f) => ({ ...f, steps: [...f.steps, { id: `s${Date.now()}`, type, delayDays: 2, condition: f.steps.some((s) => s.type === 'invite') && type === 'message' ? 'accepted' : 'always', template: '', useAi: type !== 'react', name: '' }] }));
  const save = () => start(async () => {
    setError(undefined);
    const r = await saveCampaignAction(id, form);
    if (r.error) return setError(r.error);
    setSaved(true);
    if (!id && r.id) router.push(`/campanhas/${r.id}`); else router.refresh();
  });
  const linkFlow = () => startFlow(async () => {
    if (!id || !flowChoice) return;
    const r = await setCampaignFlowAction(id, flowChoice);
    setFlowMsg(r.error ? { error: r.error } : { ok: r.ok });
    if (!r.error) { setFlowId(flowChoice); router.refresh(); }
  });
  const unlinkFlow = () => startFlow(async () => {
    if (!id) return;
    const r = await setCampaignFlowAction(id, null);
    setFlowMsg(r.error ? { error: r.error } : { ok: r.ok });
    if (!r.error) { setFlowId(null); setFlowChoice(''); router.refresh(); }
  });
  const linkedSteps = linkedFlow?.steps ?? [];
  const linkedDays = accumulatedDays(linkedSteps);

  let day = 0;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {flowId ? (
          <>
            <FlowPreview steps={linkedSteps} />
            <section className="card p-4" aria-label="Etapas do fluxo vinculado">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-mono text-[10px] uppercase tracking-[.14em] text-muted">Etapas do fluxo</p>
                <p className="text-xs text-muted">{linkedFlow?.name ?? 'fluxo'} · {linkedSteps.length} etapas</p>
              </header>
              {linkedSteps.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Este fluxo ainda não tem etapas. Edite-o no construtor de fluxos.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {linkedSteps.map((s, i) => {
                    const T = TYPES[s.type];
                    return (
                      <li key={s.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-accent text-xs font-semibold text-accent">{i + 1}</span>
                        <T.icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm">{s.name?.trim() || T.label}</span>
                        <span className="shrink-0 text-xs text-muted">dia {linkedDays[i]}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                Enquanto a campanha estiver vinculada ao fluxo, a cadência executa estas etapas. As etapas da campanha só voltam a valer quando você desvincular.
              </p>
            </section>
          </>
        ) : (
          <>
            <FlowPreview steps={form.steps} />
            {form.steps.map((s, i) => {
              day += s.delayDays;
              const T = TYPES[s.type];
              return (
                <div key={s.id} className={`card p-4 ${dragIndex === i ? 'opacity-50' : ''}`}
                  onDragOver={(e) => { if (dragIndex !== null && dragIndex !== i) e.preventDefault(); }}
                  onDrop={() => { if (dragIndex !== null) { reorder(dragIndex, i); setDragIndex(null); } }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cursor-grab text-muted" draggable onDragStart={() => setDragIndex(i)} onDragEnd={() => setDragIndex(null)} aria-label="Arrastar para reordenar"><GripVertical className="h-4 w-4" /></span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-accent text-sm font-semibold text-accent">{i + 1}</span>
                    <select className="input w-auto font-medium" value={s.type} onChange={(e) => setStep(i, { type: e.target.value as StepType })} aria-label="Tipo do passo">
                      {Object.entries(TYPES).filter(([k]) => stepTypeEnabled(features, k) || k === s.type).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <T.icon className="h-4 w-4 text-muted" />
                    <span className="text-xs text-muted">dia {day}</span>
                    <div className="ml-auto flex gap-1">
                      <button className="btn-ghost px-2 py-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                      <button className="btn-ghost px-2 py-1" disabled={i === form.steps.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                      <button className="btn-ghost px-2 py-1 hover:text-danger" onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))} aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="label" htmlFor={`passo-nome-${s.id}`}>Nome da etapa</label>
                    <input id={`passo-nome-${s.id}`} className="input" value={s.name ?? ''} maxLength={60}
                      placeholder="Ex.: Primeiro contato" onChange={(e) => setStep(i, { name: e.target.value })} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">Esperar
                      <input type="number" min={0} max={60} className="input w-16 py-1" value={s.delayDays} onChange={(e) => setStep(i, { delayDays: Number(e.target.value) })} />
                      dia(s) {i === 0 ? 'após inscrever' : 'após o passo anterior'}</label>
                    <label className="flex items-center gap-2">
                      <select className="input w-auto py-1" value={s.condition} onChange={(e) => setStep(i, { condition: e.target.value as CampaignStep['condition'] })}>
                        <option value="always">sempre</option><option value="accepted">só depois que aceitar o convite</option>
                      </select></label>
                  </div>
                  {s.type !== 'react' && (
                    <>
                      {s.type === 'email' && (
                        <input className="input mt-3" value={s.subject ?? ''} maxLength={160}
                          placeholder="Assunto do e-mail" onChange={(e) => setStep(i, { subject: e.target.value })} />
                      )}
                      {s.type === 'image' && (
                        <input className="input mt-3" value={s.mediaUrl ?? ''} maxLength={2000} type="url" inputMode="url"
                          placeholder="URL pública da imagem ou PDF (https://…)" onChange={(e) => setStep(i, { mediaUrl: e.target.value })} />
                      )}
                      <textarea rows={3} className="input mt-3 leading-relaxed" value={s.template} maxLength={s.type === 'invite' ? 300 : 1500}
                        placeholder={s.type === 'invite' ? 'Nota do convite (até 300 caracteres)' : s.type === 'email' ? 'Corpo do e-mail' : s.type === 'whatsapp' ? 'Mensagem de WhatsApp' : s.type === 'voice' ? 'Roteiro da mensagem de voz (vira áudio na sua voz)' : s.type === 'image' ? 'Legenda da imagem/informativo (opcional)' : s.type === 'call' ? 'Roteiro da ligação (abertura, pergunta, próximo passo)' : 'Texto base'} onChange={(e) => setStep(i, { template: e.target.value })} />
                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={s.useAi} onChange={(e) => setStep(i, { useAi: e.target.checked })} />
                        <Sparkles className="h-4 w-4 text-violet" /> Personalizar com IA para cada lead {!aiOn && <span className="text-xs text-muted">(IA não configurada: usa o texto base)</span>}
                      </label>
                    </>
                  )}
                  {!stepTypeEnabled(features, s.type) && (
                    <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">Este recurso está desligado nesta operação: o passo não age na cadência até o administrador liberá-lo.</p>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-border p-3">
              {Object.entries(TYPES).filter(([k]) => stepTypeEnabled(features, k)).map(([k, v]) => (
                <button key={k} className="btn-outline py-1.5" onClick={() => add(k as StepType)}><Plus className="h-4 w-4" />{v.label}</button>
              ))}
            </div>
            {(!stepTypeEnabled(features, 'image') || !stepTypeEnabled(features, 'call') || !stepTypeEnabled(features, 'linkedin')) && (
              <p className="text-xs text-muted">
                Imagem/informativo, ligação e LinkedIn são recursos activados por operação: só aparecem aqui quando o administrador os liberar.
              </p>
            )}
          </>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="card space-y-4 p-5">
          <div><label className="label" htmlFor="name">Nome da campanha</label>
            <input id="name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: CFOs indústria SC" /></div>
          <div><label className="label" htmlFor="assigned">Quem executa</label>
            <select id="assigned" className="input" value={form.assignedTo ?? ''} onChange={(e) => setForm({ ...form, assignedTo: e.target.value || null })}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select></div>
          <div><label className="label" htmlFor="brief">Contexto para a IA</label>
            <textarea id="brief" rows={5} className="input text-sm" value={form.aiBrief} onChange={(e) => setForm({ ...form, aiBrief: e.target.value })}
              placeholder="O que você oferece, para quem, tom de voz, o que evitar. Ex.: recuperação de créditos tributários para indústrias do Lucro Real; tom consultivo, sem citar preços." /></div>
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">Variáveis: {'{nome}'} {'{nome_completo}'} {'{cargo}'} {'{empresa}'} {'{cidade}'}</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" onClick={save} disabled={pending}>{pending ? 'Salvando…' : saved ? 'Salvo ✓' : id ? 'Salvar alterações' : 'Criar campanha'}</button>
        </div>

        <div className="card space-y-3 p-5">
          <div>
            <label className="label" htmlFor="fluxo">Fluxo da operação</label>
            {id ? (
              <>
                <select id="fluxo" className="input" value={flowChoice} disabled={flowPending}
                  onChange={(e) => { setFlowChoice(e.target.value); setFlowMsg(undefined); }}>
                  <option value="">Escolher um fluxo…</option>
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} · {f.stepCount} etapas{f.status === 'active' ? '' : ` · ${f.status}`}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted">
                  O fluxo é o modelo da cadência: vinculado, a campanha executa as etapas do fluxo; desvinculado, volta às etapas da campanha.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-outline flex-1" disabled={flowPending || !flowChoice || flowChoice === flowId} onClick={linkFlow}>Vincular fluxo</button>
                  {flowId && <button className="btn-ghost" disabled={flowPending} onClick={unlinkFlow}>Desvincular</button>}
                </div>
                {flowMsg && <p className={`text-xs ${flowMsg.error ? 'text-danger' : 'text-success'}`}>{flowMsg.error ?? flowMsg.ok}</p>}
              </>
            ) : (
              <p className="text-xs text-muted">Salve a campanha para vincular um fluxo da operação.</p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

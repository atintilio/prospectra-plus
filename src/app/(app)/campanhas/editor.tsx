'use client';

import { ArrowDown, ArrowUp, Heart, MessageCircle, Plus, Send, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CampaignStep, StepType } from '@/db/schema';
import { saveCampaignAction } from '../actions';

export const DEFAULT_STEPS: CampaignStep[] = [
  { id: 's1', type: 'react', delayDays: 0, condition: 'always', template: '', useAi: false },
  { id: 's2', type: 'invite', delayDays: 1, condition: 'always', template: 'Olá {nome}, acompanho o trabalho da {empresa} e gostaria de trocar ideias com você por aqui.', useAi: true },
  { id: 's3', type: 'message', delayDays: 1, condition: 'accepted', template: 'Obrigado por aceitar, {nome}! Trabalho com empresas como a {empresa} em [seu tema]. Como vocês lidam hoje com [dor]?', useAi: true },
  { id: 's4', type: 'message', delayDays: 4, condition: 'always', template: '{nome}, faz sentido uma conversa rápida de 15 minutos nesta semana?', useAi: false },
];

const TYPES: Record<StepType, { label: string; icon: typeof Send }> = {
  react: { label: 'Reagir a post', icon: Heart }, comment: { label: 'Comentar post', icon: MessageCircle },
  invite: { label: 'Convite de conexão', icon: UserPlus }, message: { label: 'Mensagem', icon: Send },
};

type Initial = { name: string; aiBrief: string; assignedTo: string | null; steps: CampaignStep[] };

export function CampaignEditor({ id, initial, members, aiOn }: { id: string | null; initial: Initial; members: { id: string; name: string; email: string }[]; aiOn: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const setStep = (i: number, patch: Partial<CampaignStep>) => { setSaved(false); setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })); };
  const move = (i: number, d: -1 | 1) => setForm((f) => { const s = [...f.steps]; [s[i], s[i + d]] = [s[i + d], s[i]]; return { ...f, steps: s }; });
  const add = (type: StepType) => setForm((f) => ({ ...f, steps: [...f.steps, { id: `s${Date.now()}`, type, delayDays: 2, condition: f.steps.some((s) => s.type === 'invite') && type === 'message' ? 'accepted' : 'always', template: '', useAi: type !== 'react' }] }));
  const save = () => start(async () => {
    setError(undefined);
    const r = await saveCampaignAction(id, form);
    if (r.error) return setError(r.error);
    setSaved(true);
    if (!id && r.id) router.push(`/campanhas/${r.id}`); else router.refresh();
  });

  let day = 0;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {form.steps.map((s, i) => {
          day += s.delayDays;
          const T = TYPES[s.type];
          return (
            <div key={s.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-accent text-sm font-semibold text-accent">{i + 1}</span>
                <select className="input w-auto font-medium" value={s.type} onChange={(e) => setStep(i, { type: e.target.value as StepType })} aria-label="Tipo do passo">
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <T.icon className="h-4 w-4 text-muted" />
                <span className="text-xs text-muted">dia {day}</span>
                <div className="ml-auto flex gap-1">
                  <button className="btn-ghost px-2 py-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                  <button className="btn-ghost px-2 py-1" disabled={i === form.steps.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                  <button className="btn-ghost px-2 py-1 hover:text-danger" onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))} aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
                </div>
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
                  <textarea rows={3} className="input mt-3 leading-relaxed" value={s.template} maxLength={s.type === 'invite' ? 300 : 1500}
                    placeholder={s.type === 'invite' ? 'Nota do convite (até 300 caracteres)' : 'Texto base'} onChange={(e) => setStep(i, { template: e.target.value })} />
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={s.useAi} onChange={(e) => setStep(i, { useAi: e.target.checked })} />
                    <Sparkles className="h-4 w-4 text-violet" /> Personalizar com IA para cada lead {!aiOn && <span className="text-xs text-muted">(IA não configurada: usa o texto base)</span>}
                  </label>
                </>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-border p-3">
          {Object.entries(TYPES).map(([k, v]) => (
            <button key={k} className="btn-outline py-1.5" onClick={() => add(k as StepType)}><Plus className="h-4 w-4" />{v.label}</button>
          ))}
        </div>
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
      </aside>
    </div>
  );
}

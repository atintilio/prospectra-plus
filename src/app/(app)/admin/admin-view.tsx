'use client';

import { LogIn, Plug, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { createPartnerAction, switchOrgAction, updatePartnerAction } from '../actions';
import { assignPlanAction, createPlanAction, saveOrgSettingsAction, togglePlanAction, type AdminSettingsState } from './actions';
import type { IntegrationPill } from '@/lib/integrations';
import { FormMessage, Submit } from '@/components/form';

type Org = { id: string; name: string; seats: number; credits: number; active: boolean; aiEnabled: boolean; members: number; leads: number; meetings: number; owner: string | null; planId: string | null };
type User = { id: string; name: string; email: string; status: string; platformRole: string; orgs: string };
export type OrgSettings = { senderEmail: string; atendimentoStart: string; atendimentoEnd: string; autoReply: string; features: Record<string, boolean> };
export type Plan = { id: string; name: string; seats: number; credits: number; active: boolean };

const FEATURES: { key: string; label: string }[] = [
  { key: 'golinkedin', label: 'Go LinkedIn' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'helpin', label: 'Helpin' },
  { key: 'inteligencia', label: 'Inteligência' }, { key: 'agenda', label: 'Agenda' }, { key: 'documentos', label: 'Documentos' },
];

export function AdminView({ orgs, users, plans, settings, integrations }: {
  orgs: Org[]; users: User[]; plans: Plan[]; settings: Record<string, OrgSettings>; integrations: IntegrationPill[];
}) {
  const [state, action] = useActionState(createPartnerAction, undefined);
  const [planState, planAction] = useActionState<AdminSettingsState, FormData>(createPlanAction, undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string }>();
  const patch = (id: string, p: Parameters<typeof updatePartnerAction>[1]) => start(async () => {
    try { await updatePartnerAction(id, p); setFeedback({ ok: 'Configuração salva.' }); router.refresh(); }
    catch { setFeedback({ error: 'Não foi possível salvar a configuração.' }); }
  });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <FormMessage state={feedback} />

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs" aria-label="Integrações">
        {integrations.map((i) => (
          <span key={i.name} className={`pill ${i.ok ? 'bg-success-soft text-success' : 'bg-red-50 text-danger'} inline-flex items-center gap-1`} title={i.hint}>
            <Plug className="h-3 w-3" /> {i.name} {i.ok ? 'configurado' : 'não configurado'}
          </span>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-surface/60">
              <tr>
                <th className="th">Parceiro</th><th className="th text-right">Usuários</th><th className="th text-right">Créditos/mês</th>
                <th className="th text-right">Leads</th><th className="th text-right">Reuniões</th>
                <th className="th">Plano</th><th className="th">Ativo</th><th className="th">Usar IA</th><th className="th" /><th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orgs.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="td"><p className="font-medium">{o.name}</p><p className="text-xs text-muted">{o.owner ?? 'sem dono'}</p></td>
                  <td className="td text-right"><span className="text-muted">{o.members} /</span>{' '}
                    <input type="number" min={1} className="input inline w-16 py-1 text-right" defaultValue={o.seats}
                      onBlur={(e) => Number(e.target.value) !== o.seats && patch(o.id, { seats: Number(e.target.value) })} aria-label="Usuários" /></td>
                  <td className="td text-right"><input type="number" min={0} className="input inline w-20 py-1 text-right" defaultValue={o.credits}
                    onBlur={(e) => Number(e.target.value) !== o.credits && patch(o.id, { searchCreditsMonth: Number(e.target.value) })} aria-label="Créditos" /></td>
                  <td className="td text-right">{o.leads}</td>
                  <td className="td text-right font-medium">{o.meetings}</td>
                  <td className="td">
                    <select className="input w-40 py-1 text-xs" value={o.planId ?? ''} disabled={pending}
                      onChange={(e) => start(async () => { const r = await assignPlanAction(o.id, e.target.value || null); setFeedback(r.error ? { error: r.error } : { ok: 'Plano aplicado.' }); router.refresh(); })}>
                      <option value="">sem plano</option>
                      {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="td"><input type="checkbox" checked={o.active} disabled={pending} onChange={(e) => patch(o.id, { active: e.target.checked })} aria-label="Ativo" /></td>
                  <td className="td"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={o.aiEnabled} disabled={pending}
                    onChange={(e) => patch(o.id, { aiEnabled: e.target.checked })} aria-label={`Usar IA em ${o.name}`} />{o.aiEnabled ? 'Ligada' : 'Desligada'}</label></td>
                  <td className="td"><button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpenId(openId === o.id ? null : o.id)}>
                    {openId === o.id ? 'Fechar' : 'Configurar'}</button></td>
                  <td className="td text-right"><button className="btn-ghost px-2 py-1 text-xs" onClick={() => start(() => switchOrgAction(o.id))}><LogIn className="h-3.5 w-3.5" /> Entrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {openId && (
            <OrgSettingsForm orgId={openId} initial={settings[openId] ?? { senderEmail: '', atendimentoStart: '09:00', atendimentoEnd: '18:00', autoReply: '', features: {} }} />
          )}
        </div>

        <div className="space-y-4 self-start">
          <form action={action} className="card space-y-3 p-5">
            <h2 className="font-semibold">Novo parceiro</h2>
            <input name="name" className="input" placeholder="Nome do parceiro *" required />
            <input name="ownerName" className="input" placeholder="Nome do responsável" />
            <input name="ownerEmail" type="email" className="input" placeholder="E-mail do responsável *" required />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">Usuários<input name="seats" type="number" min={1} defaultValue={5} className="input mt-1" /></label>
              <label className="text-xs text-muted">Créditos/mês<input name="credits" type="number" min={0} defaultValue={300} className="input mt-1" /></label>
            </div>
            <FormMessage state={state} />
            <Submit pendingText="Criando…">Criar e enviar convite</Submit>
          </form>

          <section className="card space-y-3 p-5">
            <h2 className="font-semibold">Planos e limites</h2>
            <p className="text-xs text-muted">Estrutura configurável — preços ficam fora do MVP. Aplicar um plano copia os limites para o parceiro.</p>
            <ul className="space-y-1 text-sm">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                  <span><strong>{p.name}</strong> · {p.seats} usuários · {p.credits} créd./mês</span>
                  <button className="text-xs text-muted hover:text-danger" onClick={() => start(async () => { await togglePlanAction(p.id, !p.active); router.refresh(); })}>
                    {p.active ? 'desativar' : 'ativar'}
                  </button>
                </li>
              ))}
              {!plans.length && <li className="text-muted">Nenhum plano criado.</li>}
            </ul>
            <form action={planAction} className="grid grid-cols-2 gap-2 text-xs">
              <input name="name" className="input col-span-2" placeholder="Nome do plano (ex.: Crescimento) *" required />
              <label>Usuários<input name="seats" type="number" min={1} defaultValue={5} className="input mt-1" /></label>
              <label>Créditos/mês<input name="credits" type="number" min={0} defaultValue={300} className="input mt-1" /></label>
              <Submit className="btn-outline col-span-2 justify-center" pendingText="Criando…"><Plus className="h-4 w-4" /> Criar plano</Submit>
            </form>
            {planState && <FormMessage state={planState} />}
          </section>
        </div>
      </div>
    </div>
  );
}

function OrgSettingsForm({ orgId, initial }: { orgId: string; initial: OrgSettings }) {
  const [state, action] = useActionState<AdminSettingsState, FormData>(saveOrgSettingsAction, undefined);
  return (
    <form action={action} className="grid gap-3 border-t border-border bg-surface/40 p-5 sm:grid-cols-2">
      <input type="hidden" name="orgId" value={orgId} />
      <label className="text-xs text-muted sm:col-span-2">E-mail remetente (Office 365)
        <input name="senderEmail" type="email" className="input mt-1" defaultValue={initial.senderEmail} placeholder="contato@suaempresa.com.br" /></label>
      <label className="text-xs text-muted">Atendimento — início<input name="atendimentoStart" type="time" className="input mt-1" defaultValue={initial.atendimentoStart} /></label>
      <label className="text-xs text-muted">Atendimento — fim<input name="atendimentoEnd" type="time" className="input mt-1" defaultValue={initial.atendimentoEnd} /></label>
      <label className="text-xs text-muted sm:col-span-2">Autorresposta simples (fora do atendimento)
        <textarea name="autoReply" rows={2} className="input mt-1" defaultValue={initial.autoReply} /></label>
      <fieldset className="sm:col-span-2">
        <legend className="text-xs text-muted">Recursos ativados</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {FEATURES.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`f.${f.key}`} defaultChecked={initial.features[f.key] ?? true} /> {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2"><Submit className="btn-primary" pendingText="Salvando…">Salvar configurações</Submit></div>
      {state && <div className="sm:col-span-2"><FormMessage state={state} /></div>}
    </form>
  );
}

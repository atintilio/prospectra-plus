'use client';

import { LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { createPartnerAction, switchOrgAction, updatePartnerAction } from '../actions';
import { FormMessage, Submit } from '@/components/form';
import { Avatar } from '@/components/ui';

type Org = { id: string; name: string; seats: number; credits: number; active: boolean; aiEnabled: boolean; imageEnabled: boolean; callEnabled: boolean; linkedinEnabled: boolean; members: number; leads: number; meetings: number; owner: string | null };
type User = { id: string; name: string; email: string; status: string; platformRole: string; orgs: string };

export function AdminView({ orgs, users }: { orgs: Org[]; users: User[] }) {
  const [state, action] = useActionState(createPartnerAction, undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ok?:string;error?:string}>();
  const patch = (id: string, p: Parameters<typeof updatePartnerAction>[1]) => start(async () => { try { await updatePartnerAction(id, p); setFeedback({ok:"Configuração salva."}); router.refresh(); } catch {setFeedback({error:"Não foi possível salvar a configuração."});} });
  return (
    <div className="space-y-6">
      <FormMessage state={feedback}/>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-surface/60"><tr><th className="th">Parceiro</th><th className="th text-right">Usuários</th><th className="th text-right">Créditos/mês</th><th className="th text-right">Leads</th><th className="th text-right">Reuniões</th><th className="th">Ativo</th><th className="th">Usar IA</th><th className="th">Imagem</th><th className="th">Ligação</th><th className="th">LinkedIn</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-border">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="td"><p className="font-medium">{o.name}</p><p className="text-xs text-muted">{o.owner ?? 'sem dono'}</p></td>
                  <td className="td text-right"><span className="text-muted">{o.members} /</span>{' '}
                    <input type="number" min={1} className="input inline w-16 py-1 text-right" defaultValue={o.seats} onBlur={(e) => Number(e.target.value) !== o.seats && patch(o.id, { seats: Number(e.target.value) })} aria-label="Usuários" /></td>
                  <td className="td text-right"><input type="number" min={0} className="input inline w-20 py-1 text-right" defaultValue={o.credits} onBlur={(e) => Number(e.target.value) !== o.credits && patch(o.id, { searchCreditsMonth: Number(e.target.value) })} aria-label="Créditos" /></td>
                  <td className="td text-right">{o.leads}</td>
                  <td className="td text-right font-medium">{o.meetings}</td>
                  <td className="td"><input type="checkbox" checked={o.active} disabled={pending} onChange={(e) => patch(o.id, { active: e.target.checked })} aria-label="Ativo" /></td>
                  <td className="td"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={o.aiEnabled} disabled={pending} onChange={(e) => patch(o.id, { aiEnabled: e.target.checked })} aria-label={`Usar IA em ${o.name}`} />{o.aiEnabled ? 'Ligada' : 'Desligada'}</label></td>
                  <td className="td"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={o.imageEnabled} disabled={pending} onChange={(e) => patch(o.id, { imageEnabled: e.target.checked })} aria-label={`Envio de imagem em ${o.name}`} />{o.imageEnabled ? 'Liberada' : 'Desligada'}</label></td>
                  <td className="td"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={o.callEnabled} disabled={pending} onChange={(e) => patch(o.id, { callEnabled: e.target.checked })} aria-label={`Passo de ligação em ${o.name}`} />{o.callEnabled ? 'Liberada' : 'Desligada'}</label></td>
                  <td className="td"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={o.linkedinEnabled} disabled={pending} onChange={(e) => patch(o.id, { linkedinEnabled: e.target.checked })} aria-label={`LinkedIn automático em ${o.name}`} />{o.linkedinEnabled ? 'Ligado' : 'Desligado'}</label></td>
                  <td className="td text-right"><button className="btn-ghost px-2 py-1 text-xs" onClick={() => start(() => switchOrgAction(o.id))}><LogIn className="h-3.5 w-3.5" /> Entrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={action} className="card space-y-3 self-start p-5">
          <h2 className="font-semibold">Novo parceiro</h2>
          <input name="name" className="input" placeholder="Nome do parceiro *" required />
          <input name="ownerName" className="input" placeholder="Nome do responsável" />
          <input name="ownerEmail" type="email" className="input" placeholder="E-mail do responsável *" required />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">Usuários<input name="seats" type="number" min={1} defaultValue={5} className="input mt-1" /></label>
            <label className="text-xs text-muted">Créditos de busca/mês<input name="credits" type="number" min={0} defaultValue={300} className="input mt-1" /></label>
          </div>
          <FormMessage state={state} />
          <Submit pendingText="Criando…">Criar e enviar convite</Submit>
        </form>
      </div>

    </div>
  );
}


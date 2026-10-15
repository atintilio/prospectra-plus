'use client';

import { LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useTransition } from 'react';
import { createPartnerAction, setUserStatusAction, switchOrgAction, updatePartnerAction } from '../actions';
import { FormMessage, Submit } from '@/components/form';
import { Avatar } from '@/components/ui';

type Org = { id: string; name: string; seats: number; credits: number; active: boolean; members: number; leads: number; meetings: number; owner: string | null };
type User = { id: string; name: string; email: string; status: string; platformRole: string; orgs: string };

export function AdminView({ orgs, users }: { orgs: Org[]; users: User[] }) {
  const [state, action] = useActionState(createPartnerAction, undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  const patch = (id: string, p: Parameters<typeof updatePartnerAction>[1]) => start(async () => { await updatePartnerAction(id, p); router.refresh(); });
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-surface/60"><tr><th className="th">Parceiro</th><th className="th text-right">Usuários</th><th className="th text-right">Créditos/mês</th><th className="th text-right">Leads</th><th className="th text-right">Reuniões</th><th className="th">Ativo</th><th className="th" /></tr></thead>
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
      <div className="card overflow-x-auto">
        <h2 className="border-b border-border px-5 py-4 font-semibold">Todos os usuários ({users.length})</h2>
        <table className="w-full min-w-[640px]">
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="td"><div className="flex items-center gap-3"><Avatar name={u.name || u.email} size={28} /><div><p className="font-medium">{u.name || '—'} {u.platformRole === 'admin' && <span className="pill ml-1 bg-violet-soft text-violet">admin</span>}</p><p className="text-xs text-muted">{u.email}</p></div></div></td>
                <td className="td text-muted">{u.orgs || '—'}</td>
                <td className="td">{u.status === 'active' ? <span className="pill bg-success-soft text-success">Ativo</span> : u.status === 'invited' ? <span className="pill bg-warning-soft text-warning">Convidado</span> : <span className="pill bg-red-50 text-danger">Desativado</span>}</td>
                <td className="td text-right">{u.platformRole !== 'admin' && u.status !== 'invited' && (
                  <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => start(async () => { await setUserStatusAction(u.id, u.status === 'active' ? 'disabled' : 'active'); router.refresh(); })}>
                    {u.status === 'active' ? 'Desativar' : 'Reativar'}</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import { Mail, UserMinus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { inviteMemberAction, removeMemberAction, resendInviteAction, setMemberRoleAction } from '../actions';
import { FormMessage, Submit } from '@/components/form';
import { Avatar } from '@/components/ui';

type Role = 'owner' | 'manager' | 'sdr' | 'closer';
const ROLES: Record<Role, string> = { owner: 'Dono', manager: 'Gestor', sdr: 'SDR', closer: 'Closer' };

export function TeamView({ members, me, myRole, canManage, mailOk }: {
  members: { id: string; name: string; email: string; status: string; role: Role }[]; me: string; myRole: Role; canManage: boolean; mailOk: boolean;
}) {
  const [state, action] = useActionState(inviteMemberAction, undefined);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>();
  const router = useRouter();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="bg-surface/60"><tr><th className="th">Pessoa</th><th className="th">Papel</th><th className="th">Situação</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="td"><div className="flex items-center gap-3"><Avatar name={m.name || m.email} /><div><p className="font-medium">{m.name || '—'}</p><p className="text-xs text-muted">{m.email}</p></div></div></td>
                <td className="td">
                  {canManage && m.id !== me ? (
                    <select className="input w-auto py-1" value={m.role} disabled={pending}
                      onChange={(e) => start(async () => { await setMemberRoleAction(m.id, e.target.value as Role); router.refresh(); })}>
                      {(Object.keys(ROLES) as Role[]).filter((r) => r !== 'owner' || myRole === 'owner').map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
                    </select>
                  ) : ROLES[m.role]}
                </td>
                <td className="td">{m.status === 'active' ? <span className="pill bg-success-soft text-success">Ativo</span> : m.status === 'invited' ? <span className="pill bg-warning-soft text-warning">Convite pendente</span> : <span className="pill bg-red-50 text-danger">Desativado</span>}</td>
                <td className="td text-right">
                  {canManage && m.id !== me && (
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => start(async () => setMsg(await resendInviteAction(m.id)))}><Mail className="h-3.5 w-3.5" />{m.status === 'active' ? 'Link de senha' : 'Reenviar convite'}</button>
                      <button className="btn-ghost px-2 py-1 text-xs hover:text-danger" disabled={pending}
                        onClick={() => { if (confirm(`Remover ${m.email} da equipe?`)) start(async () => { await removeMemberAction(m.id); router.refresh(); }); }}><UserMinus className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {msg && <div className="p-4"><FormMessage state={msg} /></div>}
      </div>
      {canManage && (
        <form action={action} className="card space-y-4 self-start p-5">
          <h2 className="font-semibold">Convidar pessoa</h2>
          <div><label className="label" htmlFor="iname">Nome</label><input id="iname" name="name" className="input" /></div>
          <div><label className="label" htmlFor="iemail">E-mail</label><input id="iemail" name="email" type="email" required className="input" /></div>
          <div><label className="label" htmlFor="irole">Papel</label>
            <select id="irole" name="role" className="input" defaultValue="sdr">
              {(Object.keys(ROLES) as Role[]).filter((r) => r !== 'owner' || myRole === 'owner').map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select></div>
          <p className="text-xs text-muted">O convite sai pelo Office 365 da Argus. {mailOk ? '' : 'Atenção: o envio de e-mail ainda não está configurado no servidor.'}</p>
          <FormMessage state={state} />
          <Submit pendingText="Enviando…">Enviar convite</Submit>
        </form>
      )}
    </div>
  );
}

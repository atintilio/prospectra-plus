'use client';
import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FormMessage, Submit } from '@/components/form';
import { saveAdminUserAction, adminStatusAction, adminAccessEmailAction } from './user-actions';
type Member = { orgId: string; role: string };
type User = { id: string; name: string; email: string; status: string; platformRole: string; memberships: Member[]; protected: boolean };
type Org = { id: string; name: string };
export function UsersView({ users, orgs }: { users: User[]; orgs: Org[] }) {
 const [editing, setEditing] = useState<User | null>(null);
 const [state, action] = useActionState(saveAdminUserAction, undefined);
 const [message, setMessage] = useState<{ok?:string;error?:string}>();
 const [pending,start] = useTransition(); const router=useRouter();
 return <section className="space-y-4" id="usuarios">
  <div><h2 className="text-xl font-semibold">Gestão de usuários</h2><p className="text-sm text-muted">Cadastre pessoas, altere permissões e controle o acesso à ferramenta.</p></div>
  <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
   <div className="card overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr><th className="th">Usuário</th><th className="th">Permissão</th><th className="th">Equipe</th><th className="th">Situação</th><th className="th">Ações</th></tr></thead><tbody className="divide-y divide-border">{users.map(u=><tr key={u.id}><td className="td"><strong>{u.name || 'Sem nome'}</strong><p className="text-xs text-muted">{u.email}</p></td><td className="td">{u.platformRole==='admin'?'Administrador':'Usuário'}</td><td className="td">{u.memberships.map(m=><div key={m.orgId}>{orgs.find(o=>o.id===m.orgId)?.name ?? 'Demonstração'} · {({owner:'Dono',manager:'Gestor',sdr:'SDR',closer:'Closer'} as Record<string,string>)[m.role]}</div>)}</td><td className="td">{u.status==='active'?'Ativo':u.status==='invited'?'Convite pendente':'Desativado'}</td><td className="td">{u.protected?<span className="text-xs text-muted">Conta protegida</span>:<div className="flex flex-wrap gap-2"><button className="btn-ghost text-xs" onClick={()=>setEditing(u)}>Editar permissões</button><button className="btn-ghost text-xs" disabled={pending||u.status==='disabled'} onClick={()=>start(async()=>{setMessage(await adminAccessEmailAction(u.id));})}>Reenviar acesso</button><button className="btn-ghost text-xs" disabled={pending} onClick={()=>{if(u.status==='disabled'||confirm(`Remover o acesso de ${u.email}? Os dados serão preservados.`))start(async()=>{setMessage(await adminStatusAction(u.id,u.status==='disabled'?'active':'disabled'));router.refresh();});}}>{u.status==='disabled'?'Reativar':'Remover acesso'}</button></div>}</td></tr>)}</tbody></table><div className="p-4"><FormMessage state={message}/></div></div>
   <form key={editing?.id ?? 'new'} action={action} className="card space-y-3 self-start p-5"><h3 className="font-semibold">{editing?'Editar usuário':'Novo usuário'}</h3>{editing&&<input type="hidden" name="id" value={editing.id}/>}
    <label className="label">Nome<input name="name" className="input mt-1" defaultValue={editing?.name} required/></label>
    <label className="label">E-mail<input type="email" name="email" className="input mt-1" defaultValue={editing?.email} readOnly={!!editing} required/></label>
    <label className="label">Equipe<select name="orgId" className="input mt-1" defaultValue={editing?.memberships.find(m=>orgs.some(o=>o.id===m.orgId))?.orgId} required>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label className="label">Papel na equipe<select name="role" className="input mt-1" defaultValue={editing?.memberships.find(m=>orgs.some(o=>o.id===m.orgId))?.role ?? 'sdr'}><option value="owner">Dono</option><option value="manager">Gestor</option><option value="sdr">SDR</option><option value="closer">Closer</option></select></label>
    <label className="label">Acesso à plataforma<select name="platformRole" className="input mt-1" defaultValue={editing?.platformRole ?? 'user'}><option value="user">Usuário</option><option value="admin">Administrador</option></select></label>
    <FormMessage state={state}/><Submit pendingText="Salvando…">{editing?'Salvar permissões':'Cadastrar e enviar convite'}</Submit>{editing&&<button type="button" className="btn-ghost" onClick={()=>setEditing(null)}>Novo cadastro</button>}
   </form>
  </div>
 </section>;
}

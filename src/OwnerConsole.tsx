import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, Building2, LoaderCircle, MailCheck, MoreHorizontal, Pencil, ShieldCheck, Trash2, UserCog, UserPlus, UsersRound } from 'lucide-react';
import type { SessionRole, SessionUser } from './AuthGate';
import type { Team, TeamMember } from './types';

type ManagedRole = 'admin' | 'leader' | 'member';
type TeamColor = Team['color'];

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: ManagedRole;
  teamId: string | null;
  active: boolean;
  passwordSet: boolean;
  invitationState: 'pending' | 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ManagedTeam {
  id: string;
  name: string;
  leaderId: string;
  memberIds: string[];
  color: TeamColor;
}

export interface OrganizationSnapshot {
  users: ManagedUser[];
  teams: ManagedTeam[];
}

interface ApiResult {
  ok?: boolean;
  error?: string;
  organization?: OrganizationSnapshot;
}

function roleLabel(role: ManagedRole) {
  return role === 'admin' ? 'Administrador' : role === 'leader' ? 'Líder' : 'Liderado';
}

function teamName(user: ManagedUser, teams: ManagedTeam[]) {
  return teams.find((team) => team.id === user.teamId)?.name ?? 'Sem equipe';
}

function errorText(code?: string) {
  const messages: Record<string, string> = {
    invalid_user_input: 'Preencha nome, e-mail válido e papel.',
    user_already_exists: 'Este e-mail já está cadastrado.',
    admin_cannot_join_team: 'Administradores têm acesso global e não precisam de equipe.',
    create_team_leader_through_team_editor: 'Cadastre o líder sem equipe e atribua-o ao criar o time.',
    invalid_team_input: 'Informe nome da equipe e um líder elegível.',
    leader_must_have_leader_role: 'Selecione um usuário com papel Líder.',
    leader_already_assigned: 'Este líder já pertence a outra equipe. Reatribua-o antes.',
    team_leader_must_be_reassigned: 'Escolha outro líder da equipe antes de mudar este acesso.',
    master_user_protected: 'O usuário Owner não pode ser desativado nem perder o papel de administrador.',
    invalid_team_member: 'O usuário precisa estar ativo e não pode ser administrador para entrar em uma equipe.',
    team_not_found: 'A equipe escolhida não existe mais. Atualize o painel e tente novamente.',
    invite_delivery_failed: 'O convite não foi entregue pelo Office 365. Confira o serviço e tente novamente.',
    inactive_user: 'Ative o usuário antes de enviar um convite.',
    owner_access_required: 'Somente o Owner pode administrar usuários e equipes.',
  };
  return messages[code ?? ''] ?? 'Não foi possível salvar esta alteração. Tente novamente.';
}

async function organizationRequest(method: 'GET' | 'POST' | 'PATCH', body?: Record<string, unknown>): Promise<OrganizationSnapshot> {
  const response = await fetch('/api/admin/organization', {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({})) as ApiResult;
  if (!response.ok || !data.organization) throw new Error(data.error ?? 'organization_request_failed');
  return data.organization;
}

export default function OwnerConsole({ currentUser, onOrganizationChange }: { currentUser: SessionUser; onOrganizationChange: (organization: OrganizationSnapshot) => void }) {
  const [organization, setOrganization] = useState<OrganizationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'member' as ManagedRole, teamId: '', sendInvite: false });
  const [newTeam, setNewTeam] = useState({ name: '', leaderId: '', color: 'purple' as TeamColor });

  const apply = (next: OrganizationSnapshot) => {
    setOrganization(next);
    onOrganizationChange(next);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try { apply(await organizationRequest('GET')); }
    catch (issue) { setError(errorText(issue instanceof Error ? issue.message : undefined)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('create-user'); setError(''); setNotice('');
    try {
      const next = await organizationRequest('POST', {
        action: 'create-user', name: newUser.name, email: newUser.email, role: newUser.role,
        teamId: newUser.role === 'member' && newUser.teamId ? newUser.teamId : undefined,
        sendInvite: newUser.sendInvite,
      });
      apply(next);
      setNewUser({ name: '', email: '', role: 'member', teamId: '', sendInvite: false });
      setNotice(newUser.sendInvite ? 'Usuário criado e convite enviado pelo Office 365.' : 'Usuário criado. Envie o convite quando estiver pronto.');
    } catch (issue) { setError(errorText(issue instanceof Error ? issue.message : undefined)); }
    finally { setBusy(''); }
  };

  const createTeam = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('create-team'); setError(''); setNotice('');
    try {
      const next = await organizationRequest('POST', { action: 'create-team', ...newTeam });
      apply(next);
      setNewTeam({ name: '', leaderId: '', color: 'purple' });
      setNotice('Equipe criada. Agora inclua os liderados no editor da equipe.');
    } catch (issue) { setError(errorText(issue instanceof Error ? issue.message : undefined)); }
    finally { setBusy(''); }
  };

  const updateUser = async (user: ManagedUser, patch: Partial<Pick<ManagedUser, 'name' | 'email' | 'role' | 'active' | 'teamId'>>) => {
    setBusy(`user-${user.id}`); setError(''); setNotice('');
    try {
      const next = await organizationRequest('PATCH', { action: 'update-user', userId: user.id, ...patch });
      apply(next); setNotice(`Acesso de ${user.name} atualizado.`);
      return true;
    } catch (issue) { setError(errorText(issue instanceof Error ? issue.message : undefined)); return false; }
    finally { setBusy(''); }
  };

  const inviteUser = async (user: ManagedUser) => {
    setBusy(`invite-${user.id}`); setError(''); setNotice('');
    try {
      const next = await organizationRequest('PATCH', { action: 'send-invite', userId: user.id });
      apply(next); setNotice(`Link de acesso enviado para ${user.email} pelo Office 365.`);
    } catch (issue) { setError(errorText(issue instanceof Error ? issue.message : undefined)); }
    finally { setBusy(''); }
  };

  const updateTeam = async (team: ManagedTeam, patch: Pick<ManagedTeam, 'name' | 'leaderId' | 'memberIds' | 'color'>) => {
    setBusy(`team-${team.id}`); setError(''); setNotice('');
    try {
      const next = await organizationRequest('PATCH', { action: 'update-team', teamId: team.id, ...patch });
      apply(next); setNotice(`Equipe ${patch.name} atualizada.`);
    } catch (issue) { setError(errorText(issue instanceof Error ? issue.message : undefined)); }
    finally { setBusy(''); }
  };

  const leaders = useMemo(() => organization?.users.filter((user) => user.active && user.role === 'leader' && !user.teamId) ?? [], [organization]);
  const pending = organization?.users.filter((user) => user.invitationState === 'pending').length ?? 0;

  if (loading) return <div className="owner-loading"><LoaderCircle className="spin" size={19} /> Carregando administração segura…</div>;
  if (!organization) return <div className="owner-error"><strong>Não foi possível abrir o painel Owner.</strong><span>{error || 'Tente atualizar a página.'}</span><button className="outline-button" onClick={() => void load()}>Tentar novamente</button></div>;

  return <>
    <div className="section-title">
      <div><p className="eyebrow">PAINEL OWNER · WORKSPACE</p><h1>Pessoas, equipes e <em>acessos.</em></h1><p>Cadastre a operação, defina quem lidera cada frente e mantenha a visualização de negócios limitada ao papel de cada pessoa.</p></div>
      <div className="owner-identity"><ShieldCheck size={16}/><div><strong>{currentUser.name ?? 'Owner'}</strong><span>Administrador master</span></div></div>
    </div>
    <div className="owner-rule"><ShieldCheck size={17}/><span><strong>Controle centralizado:</strong> o Owner vê todas as equipes, negócios e diagnósticos completos. Líderes veem apenas suas equipes e o consolidado; liderados veem somente a própria carteira.</span></div>
    {notice && <div className="owner-feedback good"><BadgeCheck size={16}/>{notice}</div>}
    {error && <div className="owner-feedback error"><span>{error}</span></div>}
    <div className="owner-metrics">
      <article><UsersRound size={19}/><span>Usuários ativos</span><strong>{organization.users.filter((user) => user.active).length}</strong></article>
      <article><MailCheck size={19}/><span>Convites pendentes</span><strong>{pending}</strong></article>
      <article><Building2 size={19}/><span>Equipes estruturadas</span><strong>{organization.teams.length}</strong></article>
      <article><UserCog size={19}/><span>Líderes em operação</span><strong>{organization.users.filter((user) => user.active && user.role === 'leader').length}</strong></article>
    </div>
    <div className="owner-setup-grid">
      <section className="panel owner-form-card"><div className="panel-head"><div><span className="eyebrow">NOVO USUÁRIO</span><h2>Cadastrar e convidar</h2></div><UserPlus size={19}/></div><form onSubmit={createUser} className="owner-form"><label>Nome completo<input required value={newUser.name} onChange={(event) => setNewUser((current) => ({ ...current, name: event.target.value }))} placeholder="Nome da pessoa" /></label><label>E-mail corporativo<input required type="email" value={newUser.email} onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))} placeholder="pessoa@argusprime.com.br" /></label><div className="owner-form-row"><label>Papel<select value={newUser.role} onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value as ManagedRole, teamId: event.target.value === 'member' ? current.teamId : '' }))}><option value="member">Liderado</option><option value="leader">Líder</option><option value="admin">Administrador</option></select></label><label>Equipe<select disabled={newUser.role !== 'member'} value={newUser.teamId} onChange={(event) => setNewUser((current) => ({ ...current, teamId: event.target.value }))}><option value="">Sem equipe agora</option>{organization.teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label></div><label className="owner-check"><input type="checkbox" checked={newUser.sendInvite} onChange={(event) => setNewUser((current) => ({ ...current, sendInvite: event.target.checked }))} /><span>Enviar convite de criação de senha pelo Office 365 agora</span></label><button className="new-button" disabled={busy === 'create-user'}>{busy === 'create-user' ? <LoaderCircle className="spin" size={16}/> : <UserPlus size={16}/>} Criar usuário</button></form></section>
      <section className="panel owner-form-card"><div className="panel-head"><div><span className="eyebrow">NOVA EQUIPE</span><h2>Definir liderança</h2></div><Building2 size={19}/></div><form onSubmit={createTeam} className="owner-form"><label>Nome da equipe<input required value={newTeam.name} onChange={(event) => setNewTeam((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Receita Enterprise" /></label><label>Líder<select required value={newTeam.leaderId} onChange={(event) => setNewTeam((current) => ({ ...current, leaderId: event.target.value }))}><option value="">Selecione um líder</option>{leaders.map((leader) => <option value={leader.id} key={leader.id}>{leader.name}</option>)}</select></label><label>Identidade visual<select value={newTeam.color} onChange={(event) => setNewTeam((current) => ({ ...current, color: event.target.value as TeamColor }))}><option value="purple">Roxo</option><option value="emerald">Esmeralda</option><option value="lilac">Lilás</option></select></label><p className="owner-help">Primeiro cadastre a pessoa como <strong>Líder</strong>. Depois, crie a equipe e inclua os liderados no editor abaixo.</p><button className="outline-button" disabled={busy === 'create-team'}>{busy === 'create-team' ? <LoaderCircle className="spin" size={16}/> : <UsersRound size={16}/>} Criar equipe</button></form></section>
    </div>
    <section className="panel owner-roster"><div className="panel-head"><div><span className="eyebrow">DIRETÓRIO DO WORKSPACE</span><h2>Acessos e convites</h2></div><span className="status-tag neutral">{organization.users.length} cadastrados</span></div><div className="owner-user-list">{organization.users.map((user) => <UserRow key={user.id} user={user} teams={organization.teams} ownerId={currentUser.id} busy={busy} onSave={updateUser} onInvite={inviteUser} />)}</div></section>
    <section className="owner-team-section"><div className="section-label"><UsersRound size={17}/><strong>Editor de equipes</strong></div>{organization.teams.length === 0 ? <div className="panel owner-empty">Nenhuma equipe foi criada. Cadastre um líder e monte a primeira frente acima.</div> : <div className="owner-team-grid">{organization.teams.map((team) => <TeamEditor key={team.id} team={team} users={organization.users} busy={busy} onSave={updateTeam} />)}</div>}</section>
  </>;
}

function UserRow({ user, teams, ownerId, busy, onSave, onInvite }: { user: ManagedUser; teams: ManagedTeam[]; ownerId: string; busy: string; onSave: (user: ManagedUser, patch: Partial<Pick<ManagedUser, 'name' | 'email' | 'role' | 'active' | 'teamId'>>) => boolean | Promise<boolean> | void; onInvite: (user: ManagedUser) => void | Promise<void> }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<ManagedRole>(user.role);
  const [teamId, setTeamId] = useState(user.teamId ?? '');
  const [active, setActive] = useState(user.active);
  const isOwner = user.id === ownerId;
  const saving = busy === `user-${user.id}`;
  const inviting = busy === `invite-${user.id}`;
  useEffect(() => { setName(user.name); setEmail(user.email); setRole(user.role); setTeamId(user.teamId ?? ''); setActive(user.active); }, [user.name, user.email, user.role, user.teamId, user.active]);
  const openEditor = () => { setMenuOpen(false); setEditing(true); };
  const save = () => { Promise.resolve(onSave(user, { name, email, role, active, teamId: role === 'member' && teamId ? teamId : null })).then((success) => { if (success !== false) setEditing(false); }); };
  const deactivate = () => {
    setMenuOpen(false);
    if (isOwner) return;
    if (window.confirm(`Desativar o acesso de ${user.name}? O histórico será preservado e o acesso poderá ser reativado depois.`)) void onSave(user, { active: false });
  };
  return <>
    <div className="owner-user-row">
      <div className="owner-person"><div className="owner-avatar">{user.name.slice(0, 1)}</div><div><strong>{user.name}{isOwner && <small>Owner</small>}</strong><span>{user.email}</span></div></div>
      <span className="owner-team-name">{teamName(user, teams)}</span>
      <span className="owner-role-badge">{roleLabel(user.role)}</span>
      <span className={`owner-active-label ${user.active ? 'active' : 'inactive'}`}>{user.active ? 'Ativo' : 'Inativo'}</span>
      <div className="owner-user-actions">
        <button className="icon-button compact owner-more-button" aria-label={`Ações de ${user.name}`} aria-expanded={menuOpen} disabled={isOwner} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={17}/></button>
        {menuOpen && <div className="owner-action-menu"><button onClick={openEditor}><Pencil size={14}/> Editar usuário</button><button disabled={inviting || !user.active} onClick={() => { setMenuOpen(false); void onInvite(user); }}><MailCheck size={14}/> {user.passwordSet ? 'Enviar novo link' : 'Enviar convite'}</button><button className="danger-menu-item" onClick={deactivate}><Trash2 size={14}/> {user.active ? 'Desativar acesso' : 'Acesso já desativado'}</button></div>}
      </div>
      <span className={`owner-invite-state ${user.invitationState}`}>{user.invitationState === 'active' ? 'Acesso ativo' : user.invitationState === 'pending' ? 'Convite pendente' : 'Inativo'}</span>
    </div>
    {editing && <div className="owner-inline-editor"><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isOwner} /></label><label>Papel<select value={role} onChange={(event) => { const next = event.target.value as ManagedRole; setRole(next); if (next !== 'member') setTeamId(''); }} disabled={isOwner}><option value="admin">Administrador</option><option value="leader">Líder</option><option value="member">Liderado</option></select></label><label>Equipe<select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={isOwner || role !== 'member'}><option value="">Sem equipe</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><div className="owner-inline-actions"><label className="owner-check"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={isOwner} /><span>Acesso ativo</span></label><button className="outline-button" onClick={() => setEditing(false)}>Cancelar</button><button className="new-button" disabled={saving || isOwner || !name.trim() || !email.trim()} onClick={save}>{saving ? <LoaderCircle className="spin" size={15}/> : <BadgeCheck size={15}/>} Salvar alterações</button></div><small>Alterar o papel ou a equipe pode mudar imediatamente a visão de negócios. O Owner não pode ser rebaixado, removido ou alterado.</small></div>}
  </>;
}

function TeamEditor({ team, users, busy, onSave }: { team: ManagedTeam; users: ManagedUser[]; busy: string; onSave: (team: ManagedTeam, patch: Pick<ManagedTeam, 'name' | 'leaderId' | 'memberIds' | 'color'>) => void }) {
  const [name, setName] = useState(team.name);
  const [leaderId, setLeaderId] = useState(team.leaderId);
  const [color, setColor] = useState<TeamColor>(team.color);
  const [memberIds, setMemberIds] = useState<string[]>(team.memberIds);
  useEffect(() => { setName(team.name); setLeaderId(team.leaderId); setColor(team.color); setMemberIds(team.memberIds); }, [team.id, team.name, team.leaderId, team.color, team.memberIds]);
  const leaderCandidates = users.filter((user) => user.active && user.role === 'leader' && (!user.teamId || user.teamId === team.id));
  const memberCandidates = users.filter((user) => user.active && user.role !== 'admin' && (!user.teamId || user.teamId === team.id));
  const toggle = (userId: string) => setMemberIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  const saving = busy === `team-${team.id}`;
  return <section className={`panel owner-team-card ${color}`}><div className="owner-team-card-head"><div className="team-orb">{name.slice(0, 1) || 'E'}</div><div><span className="eyebrow">EQUIPE</span><strong>{team.name}</strong></div></div><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Líder<select value={leaderId} onChange={(event) => { setLeaderId(event.target.value); if (!memberIds.includes(event.target.value)) setMemberIds((current) => [...current, event.target.value]); }}><option value="">Selecione</option>{leaderCandidates.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>Cor<select value={color} onChange={(event) => setColor(event.target.value as TeamColor)}><option value="purple">Roxo</option><option value="emerald">Esmeralda</option><option value="lilac">Lilás</option></select></label><div className="owner-member-pick"><span>Integrantes</span>{memberCandidates.map((user) => <label key={user.id}><input type="checkbox" checked={memberIds.includes(user.id) || user.id === leaderId} disabled={user.id === leaderId} onChange={() => toggle(user.id)} /><span>{user.name} <small>· {roleLabel(user.role)}</small></span></label>)}</div><button className="new-button" disabled={saving || !leaderId} onClick={() => onSave(team, { name, leaderId, color, memberIds: [...new Set([leaderId, ...memberIds])] })}>{saving ? <LoaderCircle className="spin" size={15}/> : <BadgeCheck size={15}/>} Salvar equipe</button></section>;
}

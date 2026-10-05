import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, BadgeCheck, Bell, Bot, BriefcaseBusiness, Building2,
  ChevronRight, CircleAlert, ClipboardCheck, Compass, CopyCheck, Database,
  ExternalLink, FileSearch, FileText, Gauge, LayoutDashboard, Link2, LoaderCircle,
  MessageSquareText, MoreHorizontal, PauseCircle, Plus, Search, Settings2,
  ShieldCheck, Sparkles, Target, UsersRound, X,
} from 'lucide-react';
import { seedState } from './data';
import { useAuthUser } from './AuthGate';
import TeamsAndDiagnoses from './Teams';
import OwnerConsole from './OwnerConsole';
import type { Account, Activity as ActivityItem, AgentProfile, Campaign, ChannelConnection, PlaybookStep, ProspectraState, Signal } from './types';

type View = 'dashboard' | 'crm' | 'enrichment' | 'automation' | 'campaigns' | 'operations' | 'teams' | 'owner' | 'settings';
const STORAGE_KEY = 'prospectra-plus-mvp-v2';
const nav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'crm', label: 'CRM', icon: Building2 },
  { id: 'enrichment', label: 'Enriquecimento', icon: Sparkles },
  { id: 'automation', label: 'Automação', icon: Bot },
  { id: 'campaigns', label: 'Campanhas', icon: Target },
  { id: 'operations', label: 'Operações', icon: ClipboardCheck },
  { id: 'teams', label: 'Equipes e diagnósticos', icon: FileText },
  { id: 'owner', label: 'Painel Owner', icon: ShieldCheck },
  { id: 'settings', label: 'Configurações', icon: Settings2 },
];
const viewPaths: Record<View, string> = {
  dashboard: '/',
  crm: '/crm',
  enrichment: '/enriquecimento',
  automation: '/automacao',
  campaigns: '/campanhas',
  operations: '/operacoes',
  teams: '/equipes',
  owner: '/owner',
  settings: '/configuracoes',
};
const pathViews = Object.fromEntries(Object.entries(viewPaths).map(([view, path]) => [path, view])) as Record<string, View>;

function resolveView(pathname: string): View {
  return pathViews[pathname] ?? 'dashboard';
}

function nowLabel() {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
}

function scoreTone(score: number) {
  if (score >= 80) return 'score-high';
  if (score >= 65) return 'score-medium';
  return 'score-low';
}

function statusTone(value: string) {
  if (['Ativa', 'Aprovado', 'Revisado', 'Concluído'].includes(value)) return 'good';
  if (['Pausado', 'Invalidado'].includes(value)) return 'danger';
  return 'neutral';
}

export default function App() {
  const [view, setView] = useState<View>(() => resolveView(window.location.pathname));
  const [state, setState] = useState<ProspectraState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return seedState;
    const parsed = JSON.parse(saved) as Partial<ProspectraState>;
    return { ...seedState, ...parsed, teams: parsed.teams ?? seedState.teams, members: parsed.members ?? seedState.members, opportunities: parsed.opportunities ?? seedState.opportunities, diagnoses: parsed.diagnoses ?? seedState.diagnoses };
  });
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const authUser = useAuthUser();

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3400);
    return () => window.clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const onPopState = () => setView(resolveView(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const selectedAccount = state.accounts.find((account) => account.id === state.selectedAccountId) ?? state.accounts[0];
  const selectedCampaign = state.campaigns.find((campaign) => campaign.id === state.selectedCampaignId) ?? state.campaigns[0];
  const activeAccounts = state.accounts.filter((account) => !account.paused && !account.suppressed).length;
  const reviewedContacts = state.accounts.flatMap((account) => account.contacts).filter((contact) => contact.status === 'Revisado').length;
  const verifiedEvidence = state.accounts.flatMap((account) => account.evidence).filter((evidence) => evidence.verified).length;
  const pendingTasks = selectedCampaign.tasks.filter((task) => task.state !== 'Concluído').length;

  const updateAccount = (accountId: string, patch: Partial<Account>, activity?: Omit<ActivityItem, 'id' | 'createdAt'>) => {
    setState((current) => ({
      ...current,
      accounts: current.accounts.map((account) => account.id !== accountId ? account : {
        ...account,
        ...patch,
        activities: activity ? [{ id: crypto.randomUUID(), createdAt: nowLabel(), ...activity }, ...account.activities] : account.activities,
      }),
    }));
  };

  const openAccount = (id: string) => {
    setState((current) => ({ ...current, selectedAccountId: id }));
    navigate('crm');
  };

  const navigate = (nextView: View) => {
    setView(nextView);
    const path = viewPaths[nextView];
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
  };

  const resetDemo = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState(seedState);
    setToast('Dados demonstrativos restaurados.');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><img src="/prospectra-logo.svg" alt="Símbolo Trilha do Prospectra+" /></div>
          <div><strong>prospectra<span>+</span></strong><small>revenue intelligence</small></div>
        </div>
        <div className="workspace-card">
          <div className="workspace-dot">AP</div>
          <div><span>Workspace</span><strong>Argus Prime</strong></div>
          <ChevronRight size={16} />
        </div>
        <nav>
          {nav.filter((item) => item.id !== 'owner' || authUser?.role === 'admin').map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => navigate(id)} className={`nav-item ${view === id ? 'active' : ''}`}>
              <Icon size={18} /><span>{label}</span>{id === 'operations' && pendingTasks > 0 && <b>{pendingTasks}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="operator"><div className="avatar">{(authUser?.name ?? 'AT').slice(0, 2).toUpperCase()}</div><div><strong>{authUser?.name ?? 'André Tintilio'}</strong><span>{authUser?.role === 'admin' ? 'Owner' : authUser?.role === 'leader' ? 'Líder' : 'Liderado'}</span></div><MoreHorizontal size={18}/></div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="crumb"><span>Prospectra+</span><ChevronRight size={14}/><strong>{nav.find((item) => item.id === view)?.label}</strong></div>
          <div className="top-actions">
            <label className="global-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conta, contato ou sinal" /></label>
            <button className="icon-button"><Bell size={18}/><i></i></button>
            <button className="new-button" onClick={() => { navigate('crm'); setToast('Use a área de CRM para iniciar uma nova conta.'); }}><Plus size={17}/> Nova conta</button>
          </div>
        </header>

        <section className="content">
          <DemoNotice />
          {view === 'dashboard' && <Dashboard accounts={state.accounts} activeAccounts={activeAccounts} reviewedContacts={reviewedContacts} verifiedEvidence={verifiedEvidence} pendingTasks={pendingTasks} onOpen={openAccount} />}
          {view === 'crm' && <CRM accounts={state.accounts} selected={selectedAccount} search={search} onSelect={(id) => setState((current) => ({ ...current, selectedAccountId: id }))} onReply={() => { updateAccount(selectedAccount.id, { paused: true }, { kind: 'Resposta', actor: 'Inbox assistido', text: 'Resposta registrada. Todas as ações comerciais pendentes da conta foram pausadas para revisão.' }); setToast('Conta pausada para revisão humana.'); }} onSuppress={() => { updateAccount(selectedAccount.id, { suppressed: true, paused: true }, { kind: 'Nota', actor: 'Gestor', text: 'Oposição registrada. A conta permanece suprimida sem reativação automática.' }); setToast('Oposição registrada e conta suprimida.'); }} />}
          {view === 'enrichment' && <Enrichment selected={selectedAccount} onEvidence={(url) => { const host = url.replace(/^https?:\/\//, '').split('/')[0] || 'fonte externa'; updateAccount(selectedAccount.id, {}, { kind: 'Evidência', actor: 'Fila de enriquecimento', text: `Solicitação de enriquecimento registrada para ${host}. Sem chave ScrapeGraphAI, o resultado permanece como demonstração revisável.` }); setToast('Solicitação registrada com proveniência. Nenhum scraping real foi executado.'); }} />}
          {view === 'automation' && <Automation channels={state.channels} agent={state.agent} playbook={state.playbook} signals={state.signals} accounts={state.accounts} onChange={(next) => setState((current) => ({ ...current, ...next }))} onToast={setToast} />}
          {view === 'campaigns' && <Campaigns campaign={selectedCampaign} accounts={state.accounts} onChange={(next) => setState((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === next.id ? next : campaign) }))} onPauseAccount={(accountId) => { updateAccount(accountId, { paused: true }, { kind: 'Tarefa', actor: 'Campanha', text: 'Ações da campanha pausadas manualmente pelo operador.' }); setToast('Ações da conta pausadas.'); }} />}
          {view === 'operations' && <Operations accounts={state.accounts} campaign={selectedCampaign} onComplete={(taskId) => { const next: Campaign = { ...selectedCampaign, tasks: selectedCampaign.tasks.map((task) => task.id === taskId ? { ...task, state: 'Concluído' } : task) }; setState((current) => ({ ...current, campaigns: current.campaigns.map((campaign) => campaign.id === next.id ? next : campaign) })); setToast('Tarefa assistida concluída e auditada.'); }} />}
          {view === 'teams' && <TeamsAndDiagnoses user={authUser} teams={state.teams} members={state.members} opportunities={state.opportunities} diagnoses={state.diagnoses} accounts={state.accounts} />}
          {view === 'owner' && authUser?.role === 'admin' && <OwnerConsole currentUser={authUser} onOrganizationChange={(organization) => setState((current) => ({ ...current, members: organization.users.map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role === 'admin' ? 'Administrador' : user.role === 'leader' ? 'Líder' : 'Liderado', teamId: user.teamId ?? undefined })), teams: organization.teams.map((team) => ({ id: team.id, name: team.name, leaderId: team.leaderId, memberIds: team.memberIds, color: team.color })) }))} />}
          {view === 'owner' && authUser?.role !== 'admin' && <AccessRestricted />}
          {view === 'settings' && <Settings onReset={resetDemo} />}
        </section>
      </main>
      {toast && <div className="toast"><BadgeCheck size={18}/>{toast}<button onClick={() => setToast('')}><X size={15}/></button></div>}
    </div>
  );
}

function DemoNotice() {
  return <div className="demo-notice"><CircleAlert size={16}/><span><strong>CRM em demonstração.</strong> Contas e campanhas exibidas são fictícias; autenticação, usuários, equipes e convites do painel Owner usam armazenamento privado e Office 365.</span><button>Ver limites</button></div>;
}

function AccessRestricted() { return <div className="owner-error"><strong>Acesso restrito ao Owner.</strong><span>Usuários líderes e liderados não administram pessoas, equipes ou permissões do workspace.</span></div>; }

function Dashboard({ accounts, activeAccounts, reviewedContacts, verifiedEvidence, pendingTasks, onOpen }: { accounts: Account[]; activeAccounts: number; reviewedContacts: number; verifiedEvidence: number; pendingTasks: number; onOpen: (id: string) => void }) {
  return <>
    <div className="page-intro"><div><p className="eyebrow">OPERAÇÃO DE RECEITA</p><h1>Decisões comerciais com <em>proveniência.</em></h1><p>Priorize contas com contexto verificável, mantenha a aprovação humana e acompanhe o que realmente avança.</p></div><button className="outline-button"><FileSearch size={17}/> Ver auditoria</button></div>
    <div className="metrics-grid">
      <Metric icon={Target} label="Contas elegíveis" value={activeAccounts.toString()} detail="+2 nesta semana" tone="purple" />
      <Metric icon={Gauge} label="Score médio" value="73" detail="baseado em sinais visíveis" tone="emerald" />
      <Metric icon={BadgeCheck} label="Evidências verificadas" value={verifiedEvidence.toString()} detail="fonte e data preservadas" tone="lilac" />
      <Metric icon={ClipboardCheck} label="Ações em revisão" value={pendingTasks.toString()} detail={`${reviewedContacts} contatos revisados`} tone="neutral" />
    </div>
    <div className="dashboard-grid">
      <section className="panel opportunity-panel"><div className="panel-head"><div><span className="eyebrow">FILA DE PRIORIDADE</span><h2>Contas que merecem atenção</h2></div><button className="text-button">Ver CRM <ArrowUpRight size={15}/></button></div><div className="account-list">{accounts.map((account) => <button className="account-row" onClick={() => onOpen(account.id)} key={account.id}><div className="company-glyph">{account.name.slice(0, 1)}</div><div className="account-main"><strong>{account.name}</strong><span>{account.sector} · {account.journey}</span></div><div className="account-signal"><span className={`dot ${account.paused ? 'paused' : ''}`}></span>{account.paused ? 'Pausada' : account.scoreReason}</div><div className={`score-pill ${scoreTone(account.score)}`}>{account.score}</div><ChevronRight size={17}/></button>)}</div></section>
      <section className="panel insight-panel"><div className="panel-head"><div><span className="eyebrow">MOTOR DE CONTEXTO</span><h2>O que mudou hoje</h2></div><Sparkles size={19} className="spark"/></div><div className="insight-orbit"><div className="orbit-ring ring-a"></div><div className="orbit-ring ring-b"></div><div className="center-signal"><Compass size={24}/></div><span className="signal-node node-one"></span><span className="signal-node node-two"></span><span className="signal-node node-three"></span></div><div className="insight-copy"><strong>3 sinais novos correlacionados</strong><p>Nexo Logística ganhou prioridade por expansão pública e decisor revisado.</p><button className="text-button">Abrir evidências <ArrowUpRight size={15}/></button></div></section>
    </div>
  </>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Target; label: string; value: string; detail: string; tone: string }) { return <article className={`metric-card ${tone}`}><div className="metric-icon"><Icon size={19}/></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }

function CRM({ accounts, selected, search, onSelect, onReply, onSuppress }: { accounts: Account[]; selected: Account; search: string; onSelect: (id: string) => void; onReply: () => void; onSuppress: () => void }) {
  const filtered = useMemo(() => accounts.filter((account) => `${account.name} ${account.sector} ${account.contacts.map((contact) => contact.name).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [accounts, search]);
  return <>
    <div className="section-title"><div><p className="eyebrow">CRM NATIVO</p><h1>Contas, contexto e próximo passo.</h1><p>O CRM é a memória operacional do Prospectra. Fatos, tarefas e decisões ficam juntos.</p></div><button className="new-button"><Plus size={17}/> Adicionar conta</button></div>
    <div className="crm-layout"><section className="panel crm-list"><div className="list-tools"><strong>{filtered.length} contas</strong><button className="filter-chip">Todos os estágios <ChevronRight size={14}/></button></div>{filtered.map((account) => <button onClick={() => onSelect(account.id)} key={account.id} className={`crm-row ${account.id === selected.id ? 'selected' : ''}`}><div className="company-glyph">{account.name[0]}</div><div><strong>{account.name}</strong><span>{account.stage} · {account.owner}</span></div><div className={`score-pill ${scoreTone(account.score)}`}>{account.score}</div></button>)}</section>
      <section className="panel account-detail"><div className="detail-top"><div><div className="account-heading"><div className="company-glyph large">{selected.name[0]}</div><div><p className="eyebrow">{selected.relationship} · {selected.tier}</p><h2>{selected.name}</h2><a href={`https://${selected.domain}`} target="_blank" rel="noreferrer">{selected.domain}<ExternalLink size={13}/></a></div></div><div className="detail-tags"><span className={`status-tag ${selected.paused ? 'danger' : 'good'}`}>{selected.paused ? 'Ações pausadas' : 'Apta para ação'}</span><span className="status-tag neutral">{selected.journey}</span></div></div><button className="icon-button"><MoreHorizontal size={19}/></button></div>
        <div className="score-explainer"><div className={`score-disc ${scoreTone(selected.score)}`}><strong>{selected.score}</strong><span>score</span></div><div><span className="eyebrow">SCORE EXPLICADO</span><strong>{selected.scoreReason}</strong><p>O score não autoriza contato: evidência, revisão, permissão e aprovação continuam obrigatórias.</p></div><button className="text-button">Ver critérios <ArrowUpRight size={15}/></button></div>
        <div className="detail-grid"><div><SectionLabel icon={UsersRound} label="Contatos" /><div className="contact-stack">{selected.contacts.map((contact) => <div className="contact-card" key={contact.id}><div className="avatar small">{contact.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div><strong>{contact.name}</strong><span>{contact.role}</span><small>{contact.status} · {contact.reviewedAt}</small></div><button className="icon-button compact"><ChevronRight size={16}/></button></div>)}</div></div><div><SectionLabel icon={Link2} label="Evidências" />{selected.evidence.map((evidence) => <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer" className="evidence-card"><div className="evidence-icon"><BadgeCheck size={16}/></div><div><strong>{evidence.title}</strong><span>{evidence.excerpt}</span><small>{evidence.source} · {evidence.collectedAt}</small></div><ExternalLink size={15}/></a>)}</div></div>
        <div className="timeline"><SectionLabel icon={Activity} label="Linha do tempo" />{selected.activities.map((activity) => <div className="timeline-item" key={activity.id}><span className={`timeline-dot ${activity.kind.toLowerCase()}`}></span><div><strong>{activity.kind}</strong><p>{activity.text}</p><small>{activity.actor} · {activity.createdAt}</small></div></div>)}</div>
        <div className="detail-actions"><button onClick={onReply} className="outline-button"><PauseCircle size={17}/> Registrar resposta</button><button onClick={onSuppress} className="danger-button"><ShieldCheck size={17}/> Registrar oposição</button></div>
      </section></div>
  </>;
}

function SectionLabel({ icon: Icon, label }: { icon: typeof UsersRound; label: string }) { return <div className="section-label"><Icon size={16}/><strong>{label}</strong></div>; }

function Enrichment({ selected, onEvidence }: { selected: Account; onEvidence: (url: string) => void }) {
  const [url, setUrl] = useState(`https://${selected.domain}`);
  const [submitting, setSubmitting] = useState(false);
  const submit = () => { if (!url.startsWith('http')) return; setSubmitting(true); window.setTimeout(() => { setSubmitting(false); onEvidence(url); }, 520); };
  return <>
    <div className="section-title"><div><p className="eyebrow">ENRIQUECIMENTO COM EVIDÊNCIA</p><h1>Pesquisa que mostra de onde veio.</h1><p>Extraia contexto de fontes autorizadas e promova apenas fatos que alguém possa revisar.</p></div><span className="integration-state"><span></span> ScrapeGraphAI não configurado</span></div>
    <div className="enrichment-grid"><section className="panel enrich-form"><div className="illustration-mark"><Sparkles size={28}/><div></div><i></i></div><span className="eyebrow">NOVA SOLICITAÇÃO</span><h2>Enriquecer uma fonte pública</h2><p>O resultado entra como sugestão com URL, trecho e data. Nada substitui um campo aprovado automaticamente.</p><label>URL da página ou domínio<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://empresa.com" /></label><button className="new-button full" onClick={submit} disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>} {submitting ? 'Registrando…' : 'Solicitar enriquecimento'}</button><small><ShieldCheck size={14}/> Modo atual: demonstração local. A chave `SGAI_API_KEY` não foi configurada.</small></section>
      <section className="panel extraction-preview"><div className="panel-head"><div><span className="eyebrow">CONTRATO DE EXTRAÇÃO</span><h2>O que será proposto</h2></div><FileSearch size={19}/></div><div className="schema-list"><SchemaRow label="Descrição da empresa" state="Sugestão revisável"/><SchemaRow label="Setor e porte" state="Sugestão revisável"/><SchemaRow label="Sinais públicos recentes" state="Exigem evidência"/><SchemaRow label="URLs e canais públicos" state="Preservar origem"/></div><div className="provenance-box"><BadgeCheck size={18}/><div><strong>Proveniência obrigatória</strong><p>Fonte, URL, data de coleta e trecho são armazenados antes de qualquer aprovação.</p></div></div></section>
    </div>
    <section className="panel queue-panel"><div className="panel-head"><div><span className="eyebrow">FILA DE PESQUISA</span><h2>Histórico de solicitações</h2></div><button className="text-button">Ver todas <ArrowUpRight size={15}/></button></div><div className="queue-row"><div className="queue-icon"><Bot size={17}/></div><div><strong>{selected.name} · {selected.domain}</strong><span>Fonte selecionada pela operação · aguardando conector</span></div><span className="status-tag neutral">Demonstração local</span><small>agora</small></div></section>
  </>;
}

function SchemaRow({ label, state }: { label: string; state: string }) { return <div className="schema-row"><div><span className="schema-check"><CheckIcon/></span><strong>{label}</strong></div><span>{state}</span></div>; }
function CheckIcon() { return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>; }

function Campaigns({ campaign, accounts, onChange, onPauseAccount }: { campaign: Campaign; accounts: Account[]; onChange: (campaign: Campaign) => void; onPauseAccount: (accountId: string) => void }) {
  const [draft, setDraft] = useState(campaign.copy.text);
  useEffect(() => setDraft(campaign.copy.text), [campaign.id, campaign.copy.text]);
  const hasChanged = draft !== campaign.copy.text;
  const saveCopy = () => onChange({ ...campaign, copy: { text: draft, revision: campaign.copy.revision + 1, state: 'Invalidado' } });
  const approveCopy = () => onChange({ ...campaign, copy: { ...campaign.copy, text: draft, state: 'Aprovado', approvedAt: nowLabel() } });
  const createTask = () => { const account = accounts.find((item) => item.id === campaign.accounts[0]); const contact = account?.contacts[0]; if (!account || !contact) return; onChange({ ...campaign, tasks: [...campaign.tasks, { id: crypto.randomUUID(), accountId: account.id, contactId: contact.id, title: `Preparar abertura multicanal para ${contact.name}`, channel: 'WhatsApp', capability: 'API não oficial configurável', state: 'Aprovado', due: 'Próximo dia útil' }] }); };
  return <>
    <div className="section-title"><div><p className="eyebrow">CAMPANHAS MULTICANAL</p><h1>{campaign.name}</h1><p>Cadência com contexto, revisão e guardas — WhatsApp e LinkedIn no mesmo playbook.</p></div><span className="status-tag good">{campaign.status}</span></div>
    <div className="campaign-stats"><div><span>ICP</span><strong>{campaign.icp}</strong></div><div><span>Contas</span><strong>{campaign.accounts.length} selecionadas</strong></div><div><span>Canais prioritários</span><strong><i className="linkedin-dot">in</i> LinkedIn + <i className="whatsapp-dot">wa</i> WhatsApp</strong></div></div>
    <div className="campaign-grid"><section className="panel copy-editor"><div className="panel-head"><div><span className="eyebrow">COPY COM CONTEXTO</span><h2>Mensagem de abertura</h2></div><span className={`status-tag ${statusTone(hasChanged ? 'Invalidado' : campaign.copy.state)}`}>{hasChanged ? 'Alterada — aprovação inválida' : campaign.copy.state}</span></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} /><div className="copy-meta"><span>Revisão {campaign.copy.revision}{campaign.copy.approvedAt ? ` · aprovada em ${campaign.copy.approvedAt}` : ''}</span><div>{hasChanged && <button className="outline-button" onClick={saveCopy}>Salvar nova revisão</button>}<button className="new-button" onClick={approveCopy} disabled={hasChanged}> <CopyCheck size={16}/> Aprovar texto</button></div></div><div className="copy-rule"><ShieldCheck size={17}/><p>A aprovação está vinculada ao texto, ao destinatário, ao canal e às evidências. Qualquer edição exige nova decisão.</p></div></section>
      <section className="panel sequence-panel"><div className="panel-head"><div><span className="eyebrow">JORNADA</span><h2>Cadência segura</h2></div></div><ol className="sequence"><li className="done"><span>1</span><div><strong>Contexto e evidência</strong><small>Fonte pública verificada</small></div><BadgeCheck size={17}/></li><li className="current"><span>2</span><div><strong>Revisão de copy</strong><small>Gestor aprova a revisão atual</small></div><CopyCheck size={17}/></li><li><span>3</span><div><strong>Tarefa assistida</strong><small>Operador executa na plataforma</small></div><UsersRound size={17}/></li><li><span>4</span><div><strong>Resposta ou pausa</strong><small>Inbox interrompe pendências</small></div><PauseCircle size={17}/></li></ol></section>
    </div>
    <section className="panel task-board"><div className="panel-head"><div><span className="eyebrow">FILA DE AÇÕES</span><h2>Próximas ações</h2></div><button className="new-button" onClick={createTask}><Plus size={16}/> Criar ação multicanal</button></div>{campaign.tasks.map((task) => { const account = accounts.find((item) => item.id === task.accountId); const contact = account?.contacts.find((item) => item.id === task.contactId); return <div className="task-row" key={task.id}><div className={`task-channel ${task.channel === 'WhatsApp' ? 'wa' : ''}`}>{task.channel === 'LinkedIn' ? 'in' : 'wa'}</div><div><strong>{task.title}</strong><span>{task.channel} · {account?.name} · {contact?.role} · {task.due}</span></div><span className="status-tag neutral">{task.capability}</span><span className={`status-tag ${statusTone(task.state)}`}>{task.state}</span><button className="icon-button compact" onClick={() => onPauseAccount(task.accountId)} title="Pausar ações da conta"><PauseCircle size={16}/></button></div>; })}</section>
  </>;
}

function Operations({ accounts, campaign, onComplete }: { accounts: Account[]; campaign: Campaign; onComplete: (taskId: string) => void }) {
  const events = accounts.flatMap((account) => account.activities.map((activity) => ({ ...activity, account: account.name }))).slice(0, 7);
  return <>
    <div className="section-title"><div><p className="eyebrow">OPERAÇÃO E AUDITORIA</p><h1>O que foi decidido, por quem e por quê.</h1><p>Resultados de canal, aprovações e guardas não se confundem com promessas de entrega.</p></div><button className="outline-button"><Database size={17}/> Exportar auditoria</button></div>
    <div className="operations-grid"><section className="panel"><div className="panel-head"><div><span className="eyebrow">FILA DE EXECUÇÃO</span><h2>Mensagens e handoffs</h2></div><span className="status-tag neutral">APIs não oficiais configuráveis</span></div>{campaign.tasks.map((task) => <div className="operation-task" key={task.id}><div className={`task-channel ${task.channel === 'WhatsApp' ? 'wa' : ''}`}>{task.channel === 'LinkedIn' ? 'in' : 'wa'}</div><div><strong>{task.title}</strong><span>{task.channel} · Conector externo · aprovação e limite diário exigidos</span></div>{task.state === 'Concluído' ? <span className="status-tag good">Concluído</span> : <button className="new-button small" onClick={() => onComplete(task.id)}><ClipboardCheck size={15}/> Concluir</button>}</div>)}</section>
      <section className="panel capability-panel"><div className="panel-head"><div><span className="eyebrow">MATRIZ DE CAPACIDADE</span><h2>Canais e permissões</h2></div></div><Capability name="WhatsApp" detail="Primeiro contato, follow-up e webhook" state="API não oficial" good={false}/><Capability name="LinkedIn" detail="Convite, mensagem e follow-up" state="API não oficial" good={false}/><Capability name="ScrapeGraphAI" detail="Enriquecimento estruturado" state="Aguardando chave" good={false}/></section>
    </div>
    <section className="panel audit-log"><div className="panel-head"><div><span className="eyebrow">TRILHA DE AUDITORIA</span><h2>Eventos recentes</h2></div></div>{events.map((event) => <div className="audit-row" key={event.id}><span className="audit-symbol">{event.kind[0]}</span><div><strong>{event.kind} · {event.account}</strong><p>{event.text}</p></div><small>{event.actor}<br/>{event.createdAt}</small></div>)}</section>
  </>;
}

function Capability({ name, detail, state, good }: { name: string; detail: string; state: string; good: boolean }) { return <div className="capability"><div><strong>{name}</strong><span>{detail}</span></div><span className={`status-tag ${good ? 'good' : 'neutral'}`}>{state}</span></div>; }

function Settings({ onReset }: { onReset: () => void }) { return <>
  <div className="section-title"><div><p className="eyebrow">CONFIGURAÇÕES</p><h1>Integrações ligadas apenas quando comprovadas.</h1><p>O Prospectra mostra o estado real de cada conector e não representa simulações como produção.</p></div></div>
  <div className="settings-grid"><section className="panel settings-card"><div className="setting-icon purple"><Sparkles size={20}/></div><div><span className="eyebrow">ENRIQUECIMENTO</span><h2>ScrapeGraphAI</h2><p>Adaptador preparado para extração estruturada com fonte e evidência. Configure `SGAI_API_KEY` para ativar chamadas reais.</p><span className="status-tag neutral">Não configurado</span></div><button className="outline-button">Ver contrato</button></section><section className="panel settings-card"><div className="setting-icon emerald"><MessageSquareText size={20}/></div><div><span className="eyebrow">CANAL PRIORITÁRIO</span><h2>WhatsApp</h2><p>Conector por API não oficial configurável: primeiro contato, follow-up, respostas, status e handoff no mesmo playbook.</p><span className="status-tag neutral">Pronto para configurar</span></div><button className="outline-button">Rotas e secrets</button></section><section className="panel settings-card"><div className="setting-icon lilac"><UsersRound size={20}/></div><div><span className="eyebrow">CANAL PRIORITÁRIO</span><h2>LinkedIn</h2><p>Conector por API não oficial configurável para convite, mensagem e follow-up; sem cookies, browser automation ou envio fingido.</p><span className="status-tag neutral">Pronto para configurar</span></div><button className="outline-button">Rotas e secrets</button></section><section className="panel settings-card"><div className="setting-icon lilac"><BriefcaseBusiness size={20}/></div><div><span className="eyebrow">CRM</span><h2>Modelo agentic-first</h2><p>Estrutura inspirada em contas, contatos, negócios, atividades e tarefas de pesquisa; multi-organização permanece obrigatória no backend.</p><span className="status-tag good">MVP local</span></div><button className="outline-button">Arquitetura</button></section></div>
  <section className="panel data-controls"><div><span className="eyebrow">DADOS DEMONSTRATIVOS</span><h2>Restaurar ambiente local</h2><p>Esta ação só remove as alterações deste navegador e recarrega o conjunto fictício inicial.</p></div><button className="danger-button" onClick={onReset}>Restaurar demonstração</button></section>
</>; }


function Automation({ channels, agent, playbook, signals, accounts, onChange, onToast }: { channels: ChannelConnection[]; agent: AgentProfile; playbook: PlaybookStep[]; signals: Signal[]; accounts: Account[]; onChange: (next: Partial<ProspectraState>) => void; onToast: (message: string) => void }) {
  const [voice, setVoice] = useState(agent.voice);
  const [instruction, setInstruction] = useState(agent.instruction);
  useEffect(() => { setVoice(agent.voice); setInstruction(agent.instruction); }, [agent.voice, agent.instruction]);
  const saveAgent = () => {
    onChange({ agent: { ...agent, voice, instruction, enabled: true, mode: 'Teste' } });
    onToast('Agente salvo no modo Teste. Nenhuma mensagem externa foi enviada.');
  };
  const toggleStep = (id: string) => onChange({ playbook: playbook.map((step) => step.id === id ? { ...step, active: !step.active } : step) });
  const prepareChannel = (channel: ChannelConnection) => onToast(`${channel.name}: contrato preparado para ${channel.provider}. Configure a base URL e a credencial do servidor para conectar.`);
  const simulate = () => onToast('Simulação local: o agente pesquisaria contexto, escolheria o canal e aguardaria a aprovação antes do primeiro envio.');
  return <>
    <div className="section-title"><div><p className="eyebrow">AUTOMAÇÃO MULTICANAL</p><h1>Contexto antes do contato. <em>Conversa depois do sinal.</em></h1><p>Um agente, dois canais prioritários e um handoff claro para o time. A automação começa no contexto e termina quando uma pessoa precisa entrar.</p></div><button className="new-button" onClick={simulate}><Bot size={17}/> Simular próxima ação</button></div>
    <div className="automation-banner"><div className="automation-orb"><Bot size={19}/></div><div><strong>Evolution API será o conector prioritário de WhatsApp</strong><span>Arquitetura externa e persistente, separada do Vercel: QR Code, instâncias, mensagens, webhooks e status chegam ao Prospectra pelo adaptador.</span></div><span className="status-tag neutral">Modo Teste</span></div>
    <div className="channel-grid">{channels.map((channel) => <section className="panel channel-card" key={channel.id}><div className="channel-head"><div className={`channel-logo ${channel.id}`}>{channel.id === 'whatsapp' ? 'wa' : 'in'}</div><div><span className="eyebrow">CANAL PRIORITÁRIO</span><h2>{channel.name}</h2></div><span className="status-tag neutral">{channel.status}</span></div><p>{channel.detail}</p><div className="provider-line"><span>Provedor</span><strong>{channel.provider}</strong></div><div className="provider-line"><span>Limite diário</span><strong>{channel.dailyCap} ações configuráveis</strong></div><div className="route-pills">{channel.routes.map((route) => <code key={route}>{route}</code>)}</div><button className="outline-button full-button" onClick={() => prepareChannel(channel)}><Link2 size={16}/> Preparar conexão</button></section>)}</div>
    <div className="automation-grid"><section className="panel agent-studio"><div className="panel-head"><div><span className="eyebrow">AGENT STUDIO</span><h2>Prospectra Context Agent</h2></div><span className={`status-tag ${agent.enabled ? 'good' : 'neutral'}`}>{agent.enabled ? 'Ativo em Teste' : 'Rascunho'}</span></div><div className="agent-form"><label>Voz do agente<textarea value={voice} onChange={(event) => setVoice(event.target.value)} /></label><label>Regra de comportamento<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label><label>Revisão<select value={agent.reviewMode} onChange={(event) => onChange({ agent: { ...agent, reviewMode: event.target.value as AgentProfile['reviewMode'] } })}><option>Toda mensagem</option><option>Somente respostas</option><option>Autonomia por playbook</option></select></label><div className="agent-actions"><button className="new-button" onClick={saveAgent}><BadgeCheck size={16}/> Salvar agente</button><span><ShieldCheck size={14}/> Produção só depois de configurar canal, limite e webhook.</span></div></div></section>
      <section className="panel playbook-panel"><div className="panel-head"><div><span className="eyebrow">PLAYBOOK</span><h2>Outbound · Contexto → Conversa</h2></div><span className="status-tag good">{playbook.filter((step) => step.active).length} etapas ativas</span></div><div className="playbook-list">{playbook.map((step, index) => <div className={`playbook-step ${step.active ? 'active' : ''}`} key={step.id}><button className="step-number" onClick={() => toggleStep(step.id)}>{step.active ? '✓' : index + 1}</button><div><strong>{step.title}</strong><p>{step.detail}</p><small>{step.channel} · {step.wait}</small></div><ChevronRight size={16}/></div>)}</div></section></div>
    <section className="panel signals-panel"><div className="panel-head"><div><span className="eyebrow">SIGNALS + HUMAN HANDOFF</span><h2>Conversas que merecem atenção</h2></div><button className="text-button">Abrir inbox <ArrowUpRight size={15}/></button></div><div className="signals-list">{signals.map((signal) => { const account = accounts.find((item) => item.id === signal.accountId); return <div className="signal-row" key={signal.id}><div className={`channel-logo tiny ${signal.channel === 'WhatsApp' ? 'whatsapp' : 'linkedin'}`}>{signal.channel === 'WhatsApp' ? 'wa' : 'in'}</div><div className="signal-body"><strong>{signal.title}</strong><span>{account?.name} · {signal.detail}</span></div><span className={`priority ${signal.priority.toLowerCase()}`}>{signal.priority}</span><span className={`status-tag ${signal.state === 'Em handoff' ? 'danger' : signal.state === 'Resolvido' ? 'good' : 'neutral'}`}>{signal.state}</span><small>{signal.createdAt}</small></div>; })}</div></section>
    <div className="automation-note"><CircleAlert size={16}/><span><strong>Modo de operação:</strong> APIs não oficiais podem mudar, limitar ou desconectar. O Prospectra registra `queued`, `sent`, `delivered`, `read`, `failed` e `unknown`; nunca transforma falha ou estado desconhecido em envio confirmado.</span></div>
  </>;
}

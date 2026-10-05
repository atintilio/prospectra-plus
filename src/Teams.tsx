import { useMemo, useState } from 'react';
import { BadgeCheck, FileText, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react';
import type { Account, Diagnosis, Opportunity, Team, TeamMember } from './types';
import type { SessionUser } from './AuthGate';

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function roleLabel(user: SessionUser | null) {
  if (user?.role === 'admin') return 'Administrador';
  if (user?.role === 'leader') return 'Líder';
  return 'Liderado';
}

export default function TeamsAndDiagnoses({ user, teams, members, opportunities, diagnoses, accounts }: { user: SessionUser | null; teams: Team[]; members: TeamMember[]; opportunities: Opportunity[]; diagnoses: Diagnosis[]; accounts: Account[] }) {
  const currentRole = user?.role ?? 'admin';
  const visibleTeams = useMemo(() => currentRole === 'admin' ? teams : teams.filter((team) => team.id === user?.teamId), [currentRole, teams, user?.teamId]);
  const visibleOpportunities = useMemo(() => {
    if (currentRole === 'admin') return opportunities;
    if (currentRole === 'leader') return opportunities.filter((item) => item.teamId === user?.teamId);
    return opportunities.filter((item) => item.ownerId === user?.id);
  }, [currentRole, opportunities, user?.id, user?.teamId]);
  const [selectedId, setSelectedId] = useState(visibleOpportunities[0]?.id ?? '');
  const [mode, setMode] = useState<'consolidated' | 'complete'>('consolidated');
  const selected = visibleOpportunities.find((item) => item.id === selectedId) ?? visibleOpportunities[0];
  const diagnosis = diagnoses.find((item) => item.opportunityId === selected?.id);
  const account = accounts.find((item) => item.id === selected?.accountId);
  const selectedTeam = teams.find((team) => team.id === selected?.teamId);
  const visiblePotential = visibleOpportunities.reduce((total, item) => total + item.potential, 0);

  return <>
    <div className="section-title"><div><p className="eyebrow">EQUIPES E DIAGNÓSTICOS</p><h1>Visibilidade certa para cada decisão.</h1><p>O administrador enxerga tudo. Líderes acompanham sua equipe. Liderados trabalham somente os próprios negócios.</p></div><div className="role-badge"><ShieldCheck size={15}/><span>{roleLabel(user)}</span>{user?.name && <small>{user.name}</small>}</div></div>
    <div className="access-banner"><div className="access-icon"><LockKeyhole size={18}/></div><div><strong>Regra de acesso ativa</strong><span>{currentRole === 'admin' ? 'Você pode consultar todas as equipes, negócios e diagnósticos executivos.' : currentRole === 'leader' ? 'Você pode consultar todos os negócios da sua equipe, mas apenas o consolidado do diagnóstico.' : 'Você pode consultar somente seus próprios negócios e o consolidado do diagnóstico.'}</span></div><span className="status-tag good">Aplicada por papel</span></div>
    <div className="team-summary-grid"><div className="panel summary-card"><span className="eyebrow">CARTEIRA VISÍVEL</span><strong>{visibleOpportunities.length}</strong><span>negócios com acesso para este usuário</span></div><div className="panel summary-card emerald"><span className="eyebrow">POTENCIAL CONSOLIDADO</span><strong>{money(visiblePotential)}</strong><span>estimativa das oportunidades visíveis</span></div><div className="panel summary-card lilac"><span className="eyebrow">EQUIPES</span><strong>{visibleTeams.length}</strong><span>{currentRole === 'admin' ? 'todas as equipes do workspace' : 'equipe vinculada ao usuário'}</span></div></div>
    <div className="teams-layout"><section className="panel teams-panel"><div className="panel-head"><div><span className="eyebrow">ESTRUTURA DE EQUIPE</span><h2>{currentRole === 'admin' ? 'Todas as equipes' : 'Minha equipe'}</h2></div><UsersRound size={18}/></div>{visibleTeams.length === 0 ? <div className="empty-state">Este usuário ainda não está vinculado a uma equipe.</div> : visibleTeams.map((team) => { const leader = members.find((member) => member.id === team.leaderId); const teamOpps = visibleOpportunities.filter((item) => item.teamId === team.id); return <div className={`team-card ${team.color}`} key={team.id}><div className="team-card-top"><div className="team-orb">{team.name.slice(0, 1)}</div><div><strong>{team.name}</strong><span>Líder: {leader?.name ?? 'não definido'}</span></div><span className="status-tag neutral">{teamOpps.length} negócios</span></div><div className="team-members">{team.memberIds.map((memberId) => { const member = members.find((item) => item.id === memberId); return member ? <span key={member.id}>{member.name} · {member.role}</span> : null; })}</div><div className="team-total"><span>Potencial visível</span><strong>{money(teamOpps.reduce((total, item) => total + item.potential, 0))}</strong></div></div>; })}</section>
      <section className="panel opportunity-access-panel"><div className="panel-head"><div><span className="eyebrow">NEGÓCIOS E OPORTUNIDADES</span><h2>Carteira acessível</h2></div><BadgeCheck size={18}/></div><div className="opportunity-list">{visibleOpportunities.length === 0 ? <div className="empty-state">Nenhum negócio atribuído a este usuário.</div> : visibleOpportunities.map((item) => { const itemAccount = accounts.find((entry) => entry.id === item.accountId); return <button className={`opportunity-card ${item.id === selected?.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setMode('consolidated'); }}><div className="opportunity-letter">{itemAccount?.name.slice(0, 1) ?? '?'}</div><div className="opportunity-copy"><strong>{itemAccount?.name ?? 'Conta sem nome'}</strong><span>{item.thesis}</span><small>{item.stage} · confiança {item.confidence}%</small></div><div className="opportunity-value"><strong>{money(item.potential)}</strong><span>{item.updatedAt}</span></div></button>; })}</div></section></div>
    {selected && <section className="panel diagnosis-panel"><div className="diagnosis-head"><div><span className="eyebrow">SAÍDA DO DIAGNÓSTICO</span><h2>{account?.name} · {selected.thesis}</h2><p>{selectedTeam?.name} · negócio atualizado {selected.updatedAt}</p></div><div className="diagnosis-switch"><button className={mode === 'consolidated' ? 'active' : ''} onClick={() => setMode('consolidated')}><FileText size={15}/> Consolidado</button><button className={`${mode === 'complete' ? 'active' : ''} ${currentRole !== 'admin' ? 'locked' : ''}`} onClick={() => currentRole === 'admin' && setMode('complete')}><LockKeyhole size={14}/> Executivo completo</button></div></div>{mode === 'complete' && currentRole === 'admin' && diagnosis ? <CompleteDiagnosis diagnosis={diagnosis} opportunity={selected} accountName={account?.name ?? 'Conta'} /> : <ConsolidatedDiagnosis opportunity={selected} accountName={account?.name ?? 'Conta'} currentRole={currentRole} />}</section>}
  </>;
}

function ConsolidatedDiagnosis({ opportunity, accountName, currentRole }: { opportunity: Opportunity; accountName: string; currentRole: string }) {
  return <div className="consolidated-report"><div className="consolidated-hero"><div className="report-mark"><FileText size={20}/></div><div><span className="eyebrow">DIAGNÓSTICO CONSOLIDADO</span><h3>{accountName}</h3><p>Visão operacional para acompanhamento da oportunidade. O detalhamento da tese permanece restrito ao administrador.</p></div><span className="status-tag good">{currentRole === 'leader' ? 'Visão da equipe' : 'Visão própria'}</span></div><div className="consolidated-grid"><div><span>Tese</span><strong>{opportunity.thesis}</strong></div><div><span>Potencial estimado</span><strong>{money(opportunity.potential)}</strong></div><div><span>Confiança atual</span><strong>{opportunity.confidence}%</strong></div><div><span>Próximo estágio</span><strong>{opportunity.stage}</strong></div></div><div className="consolidated-note"><ShieldCheck size={16}/><span>O consolidado informa o potencial e a tese em alto nível, mas não exibe base legal, memória de cálculo ou evidências detalhadas.</span></div></div>;
}

function CompleteDiagnosis({ diagnosis, opportunity, accountName }: { diagnosis: Diagnosis; opportunity: Opportunity; accountName: string }) {
  return <div className="complete-report"><div className="report-cover"><div><span className="eyebrow">ARGUS PRIME · DIAGNÓSTICO EXECUTIVO</span><h3>{diagnosis.title}</h3><p>Documento completo · {diagnosis.status} · potencial estimado de {money(opportunity.potential)}</p></div><div className="cover-score"><strong>{opportunity.confidence}%</strong><span>confiança</span></div></div><div className="report-section"><span className="eyebrow">01 · INTRODUÇÃO EXECUTIVA</span><p>{diagnosis.introduction}</p></div><div className="report-columns"><div className="report-section"><span className="eyebrow">02 · BASE LEGAL</span><ul>{diagnosis.legalBasis.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="report-section"><span className="eyebrow">03 · MEMÓRIA DE CÁLCULO</span><ul>{diagnosis.calculationMemory.map((item) => <li key={item}>{item}</li>)}</ul></div></div><div className="report-section"><span className="eyebrow">04 · EVIDÊNCIAS E PREMISSAS</span><ul>{diagnosis.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="report-recommendation"><span className="eyebrow">05 · RECOMENDAÇÃO EXECUTIVA</span><strong>{diagnosis.recommendation}</strong></div><div className="report-footer"><LockKeyhole size={14}/> Documento completo disponível exclusivamente ao administrador.</div></div>;
}

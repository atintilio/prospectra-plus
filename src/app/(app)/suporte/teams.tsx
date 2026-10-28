'use client';

import { Trash2, Users } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { createSupportTeamAction, deleteSupportTeamAction, setSupportTeamMembersAction } from '../actions';

type Team = { id: string; name: string; memberIds: string[] };
type Member = { id: string; name: string };

export function TeamsManager({ teams, members }: { teams: Team[]; members: Member[] }) {
  const [state, action, pending] = useActionState(createSupportTeamAction, {} as { ok?: string; error?: string });
  const [, start] = useTransition();
  const [notice, setNotice] = useState('');

  const toggle = (team: Team, userId: string) => {
    const next = team.memberIds.includes(userId) ? team.memberIds.filter((x) => x !== userId) : [...team.memberIds, userId];
    start(async () => { const r = await setSupportTeamMembersAction(team.id, next); setNotice(r?.error ?? r?.ok ?? ''); });
  };

  return (
    <div className="card mt-6 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-accent" /> Times de atendimento</h2>
      <p className="mt-1 text-sm text-muted">Agrupe agentes e roteie conversas para um time. Agentes veem as conversas do próprio time.</p>
      <form action={action} className="mt-3 flex gap-2">
        <input name="name" className="input" placeholder="Nome do time (ex.: Financeiro)" maxLength={60} required />
        <button className="btn-primary" disabled={pending}>Criar time</button>
      </form>
      {(state?.error || state?.ok || notice) && <p className="mt-2 text-xs text-muted" role="status">{state?.error ?? state?.ok ?? notice}</p>}
      <div className="mt-4 space-y-3">
        {teams.length === 0 ? <p className="text-sm text-muted">Nenhum time ainda.</p> : teams.map((t) => (
          <div key={t.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{t.name}</span>
              <button className="btn-ghost ml-auto px-2 py-1 hover:text-danger" aria-label={`Remover ${t.name}`}
                onClick={() => start(async () => { const r = await deleteSupportTeamAction(t.id); setNotice(r?.error ?? r?.ok ?? ''); })}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
                  <input type="checkbox" checked={t.memberIds.includes(m.id)} onChange={() => toggle(t, m.id)} /> {m.name}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

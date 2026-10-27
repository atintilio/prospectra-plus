'use client';

import { Pause, Play, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { enrollAction, setCampaignStatusAction } from '../../actions';

export function CampaignControls({ id, status, tags, newLeads }: { id: string; status: string; tags: string[]; newLeads: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tag, setTag] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>();
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Lista para inscrever">
          <option value="">Todos os leads novos ({newLeads})</option>
          {tags.map((t) => <option key={t} value={t}>Lista: {t}</option>)}
        </select>
        <button className="btn-outline" disabled={pending} onClick={() => start(async () => { setMsg(await enrollAction(id, { tag: tag || undefined })); router.refresh(); })}>
          <UsersRound className="h-4 w-4" /> Inscrever leads
        </button>
        {status === 'active' ? (
          <button className="btn-outline" disabled={pending} onClick={() => start(async () => { await setCampaignStatusAction(id, 'paused'); router.refresh(); })}><Pause className="h-4 w-4" /> Pausar</button>
        ) : (
          <button className="btn-primary" disabled={pending} onClick={() => start(async () => { await setCampaignStatusAction(id, 'active'); router.refresh(); })}><Play className="h-4 w-4" /> Ativar</button>
        )}
      </div>
      {msg && <p className={`text-xs ${msg.error ? 'text-danger' : 'text-success'}`}>{msg.error ?? msg.ok}{status !== 'active' && msg.ok ? ' Ative a campanha para gerar as ações.' : ''}</p>}
    </div>
  );
}

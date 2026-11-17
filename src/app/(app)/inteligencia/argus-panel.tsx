'use client';

import { useState, useTransition } from 'react';
import { getArgusInvestigation, queueArgusInvestigation, type ArgusActionState } from '@/lib/argus/actions';

export function ArgusPanel({ leadId }: { leadId: string }) {
  const [state, setState] = useState<ArgusActionState>({});
  const [pending, start] = useTransition();
  const run = () => start(async () => setState(await queueArgusInvestigation({ leadId })));
  return <section className="card space-y-3 p-5" aria-labelledby="argus-title">
    <div className="flex items-center justify-between gap-3"><div><h2 id="argus-title" className="font-semibold">Argus Prime</h2><p className="text-sm text-muted">Uma solução Argus Prime para investigar sinais públicos e preparar a conversa.</p></div><button type="button" className="btn-outline" onClick={run} disabled={pending}>{pending ? 'Enfileirando…' : 'Investigar lead'}</button></div>
    {state.error && <p className="text-sm text-danger" role="alert">{state.error}</p>}
    {state.id && <p className="text-sm text-muted">Investigação {state.id} criada. O worker Argus poderá processá-la na VPS.</p>}
    {state.job && <div className="rounded-lg border p-3 text-sm"><p>Status: {state.job.state}</p>{state.job.result?.evidence.length ? <ul className="mt-2 space-y-1">{state.job.result.evidence.map(e => <li key={e.id}>{e.source}: {e.title || e.url} · confiança {e.confidence}</li>)}</ul> : <p className="mt-2 text-muted">Ainda sem evidências.</p>}</div>}
    {state.id && <button type="button" className="text-xs text-muted underline" onClick={() => start(async () => setState(await getArgusInvestigation({ id: state.id })))}>Atualizar status</button>}
  </section>;
}

'use client';

import { Check, Inbox, RotateCcw, Send } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { argusReplyAction, argusStatusAction } from '../actions';

type Msg = { id: string; author: 'visitor' | 'agent' | 'system'; body: string; at: string };
type Selected = { id: string; subject: string; orgName: string; user: string; email: string; status: 'open' | 'closed'; messages: Msg[] };
type ListItem = { id: string; subject: string; orgName: string; user: string; email: string; status: 'open' | 'closed'; lastMessageAt: string };

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function ArgusPanel({ list, selected, status }: { list: ListItem[]; selected: Selected | null; status: 'open' | 'closed' }) {
  const [, start] = useTransition();
  const [draft, setDraft] = useState('');

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="card overflow-hidden">
        <div className="flex gap-1 border-b border-border p-2 text-sm">
          <Link href="/argus?status=open" className={`flex-1 rounded-md px-3 py-1.5 text-center ${status === 'open' ? 'bg-surface-accent font-medium text-accent' : 'text-muted'}`}>Abertos</Link>
          <Link href="/argus?status=closed" className={`flex-1 rounded-md px-3 py-1.5 text-center ${status === 'closed' ? 'bg-surface-accent font-medium text-accent' : 'text-muted'}`}>Fechados</Link>
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Nenhum chamado {status === 'open' ? 'aberto' : 'fechado'}.</p>
        ) : (
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/argus?status=${status}&c=${c.id}`} className={`block px-4 py-3 hover:bg-surface ${selected?.id === c.id ? 'bg-surface' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.subject}</span>
                    <span className="shrink-0 text-[11px] text-muted">{fmt(c.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{c.user || c.email} · {c.orgName}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="card min-h-[60vh]">
        {!selected ? (
          <Empty />
        ) : (
          <div className="flex h-full flex-col">
            <header className="flex items-center gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{selected.subject}</p>
                <p className="truncate text-xs text-muted">{selected.user} · {selected.email}</p>
              </div>
              <button className="btn-outline ml-auto" onClick={() => start(() => { void argusStatusAction(selected.id, selected.status === 'open' ? 'closed' : 'open'); })}>
                {selected.status === 'open' ? <><Check className="h-4 w-4" /> Fechar</> : <><RotateCcw className="h-4 w-4" /> Reabrir</>}
              </button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {selected.messages.map((m) => (
                <div key={m.id} className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.author === 'agent' ? 'ml-auto bg-accent text-white' : 'bg-surface'}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${m.author === 'agent' ? 'text-white/70' : 'text-muted'}`}>{m.author === 'agent' ? 'Argus' : selected.user || 'Solicitante'} · {fmt(m.at)}</p>
                </div>
              ))}
            </div>
            <form className="border-t border-border p-3"
              onSubmit={(e) => { e.preventDefault(); const text = draft.trim(); if (!text) return; setDraft(''); start(() => { void argusReplyAction(selected.id, text); }); }}>
              <div className="flex gap-2">
                <textarea className="input resize-none" rows={2} placeholder="Responder ao solicitante…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button type="submit" className="btn-primary self-end" disabled={!draft.trim()}><Send className="h-4 w-4" /> Enviar</button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full min-h-[40vh] flex-col items-center justify-center p-8 text-center text-muted">
      <Inbox className="mb-3 h-8 w-8" />
      <p>Selecione um chamado para responder.</p>
    </div>
  );
}

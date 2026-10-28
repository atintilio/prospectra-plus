'use client';

import { Check, Inbox, RotateCcw, Send } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { assignSupportAction, replySupportAction, setSupportStatusAction } from '../actions';
import { Avatar, Empty } from '@/components/ui';

type Msg = { id: string; author: 'visitor' | 'agent' | 'system'; body: string; at: string };
type Selected = { id: string; subject: string; visitorName: string; visitorEmail: string; status: 'open' | 'closed'; assignedTo: string | null; messages: Msg[] };
type ListItem = { id: string; subject: string; visitorName: string; visitorEmail: string; channel: string; status: 'open' | 'closed'; assignedTo: string | null; lastMessageAt: string };

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function SupportInbox({ list, selected, status, members, canAssign }: { list: ListItem[]; selected: Selected | null; status: 'open' | 'closed'; members: { id: string; name: string }[]; canAssign: boolean }) {
  const [, start] = useTransition();
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="card overflow-hidden">
        <div className="flex gap-1 border-b border-border p-2 text-sm">
          <Link href="/suporte?status=open" className={`flex-1 rounded-md px-3 py-1.5 text-center ${status === 'open' ? 'bg-surface-accent font-medium text-accent' : 'text-muted'}`}>Abertas</Link>
          <Link href="/suporte?status=closed" className={`flex-1 rounded-md px-3 py-1.5 text-center ${status === 'closed' ? 'bg-surface-accent font-medium text-accent' : 'text-muted'}`}>Fechadas</Link>
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Nenhuma conversa {status === 'open' ? 'aberta' : 'fechada'}.</p>
        ) : (
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/suporte?status=${status}&c=${c.id}`} className={`block px-4 py-3 hover:bg-surface ${selected?.id === c.id ? 'bg-surface' : ''}`}>
                  <div className="flex items-center gap-2">
                    <Avatar name={c.visitorName || c.visitorEmail || '?'} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.visitorName || c.visitorEmail || 'Visitante'}</span>
                    <span className="shrink-0 text-[11px] text-muted">{fmt(c.lastMessageAt)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{c.subject}</p>
                  {canAssign && <p className="mt-1 text-xs text-muted">Responsável: {members.find((m) => m.id === c.assignedTo)?.name ?? 'Ninguém'}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="card min-h-[60vh]">
        {!selected ? (
          <Empty icon={Inbox} title="Selecione uma conversa" text="Escolha uma conversa à esquerda para ler e responder." />
        ) : (
          <div className="flex h-full flex-col">
            <header className="flex items-center gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{selected.visitorName || 'Visitante'}</p>
                <p className="truncate text-xs text-muted">{selected.visitorEmail || selected.subject}</p>
              </div>
              {canAssign && <label className="ml-auto text-xs text-muted">Responsável
                <select className="input ml-2 h-9 w-40 py-1 text-xs" value={selected.assignedTo ?? ''}
                  onChange={(e) => start(async () => {
                    const result = await assignSupportAction(selected.id, e.target.value || null);
                    setNotice(result?.error ?? result?.ok ?? 'Confira a atribuição.');
                  })}>
                  <option value="">Ninguém</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>}
              <button className="btn-outline ml-auto" onClick={() => start(() => { void setSupportStatusAction(selected.id, selected.status === 'open' ? 'closed' : 'open'); })}>
                {selected.status === 'open' ? <><Check className="h-4 w-4" /> Fechar</> : <><RotateCcw className="h-4 w-4" /> Reabrir</>}
              </button>
            </header>
            {notice && <p className="px-5 pt-2 text-xs text-muted" role="status">{notice}</p>}
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {selected.messages.map((m) => (
                <div key={m.id} className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.author === 'agent' ? 'ml-auto bg-accent text-white' : 'bg-surface'}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${m.author === 'agent' ? 'text-white/70' : 'text-muted'}`}>{m.author === 'agent' ? 'Você' : 'Cliente'} · {fmt(m.at)}</p>
                </div>
              ))}
            </div>
            <form className="border-t border-border p-3"
              onSubmit={(e) => { e.preventDefault(); const text = draft.trim(); if (!text) return; setDraft(''); start(() => { void replySupportAction(selected.id, text); }); }}>
              <div className="flex gap-2">
                <textarea className="input resize-none" rows={2} placeholder="Escreva sua resposta…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button type="submit" className="btn-primary self-end" disabled={!draft.trim()}><Send className="h-4 w-4" /> Enviar</button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}

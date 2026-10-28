'use client';

import { Check, Inbox, RotateCcw, Send, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { assignSupportAction, replySupportAction, setSupportLabelsAction, setSupportStatusAction } from '../actions';
import { Avatar, Empty } from '@/components/ui';

type Msg = { id: string; author: 'visitor' | 'agent' | 'system'; body: string; at: string };
type Selected = { id: string; subject: string; visitorName: string; visitorEmail: string; status: 'open' | 'closed'; assignedTo: string | null; labels: string[]; messages: Msg[] };
type ListItem = { id: string; subject: string; visitorName: string; visitorEmail: string; channel: string; status: 'open' | 'closed'; assignedTo: string | null; labels: string[]; lastMessageAt: string };

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function SupportInbox({ list, selected, status, members, canAssign, allLabels, activeLabel }: { list: ListItem[]; selected: Selected | null; status: 'open' | 'closed'; members: { id: string; name: string }[]; canAssign: boolean; allLabels: string[]; activeLabel: string }) {
  const [, start] = useTransition();
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [labels, setLabels] = useState<string[]>(selected?.labels ?? []);
  const [labelKey, setLabelKey] = useState(selected?.id);
  const [newLabel, setNewLabel] = useState('');
  if (labelKey !== selected?.id) { setLabelKey(selected?.id); setLabels(selected?.labels ?? []); } // ressincroniza ao trocar de conversa
  const saveLabels = (next: string[]) => { setLabels(next); start(async () => { const r = await setSupportLabelsAction(selected!.id, next); setNotice(r?.error ?? r?.ok ?? ''); }); };
  const qs = (l: string) => `/suporte?status=${status}${l ? `&label=${encodeURIComponent(l)}` : ''}${selected ? `&c=${selected.id}` : ''}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="card overflow-hidden">
        <div className="flex gap-1 border-b border-border p-2 text-sm">
          <Link href="/suporte?status=open" className={`flex-1 rounded-md px-3 py-1.5 text-center ${status === 'open' ? 'bg-surface-accent font-medium text-accent' : 'text-muted'}`}>Abertas</Link>
          <Link href="/suporte?status=closed" className={`flex-1 rounded-md px-3 py-1.5 text-center ${status === 'closed' ? 'bg-surface-accent font-medium text-accent' : 'text-muted'}`}>Fechadas</Link>
        </div>
        {allLabels.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-border p-2">
            <Link href={`/suporte?status=${status}${selected ? `&c=${selected.id}` : ''}`} className={`rounded-full px-2 py-0.5 text-xs ${activeLabel ? 'bg-surface text-muted' : 'bg-surface-accent text-accent'}`}>Todas</Link>
            {allLabels.map((l) => (
              <Link key={l} href={qs(l)} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${activeLabel === l ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-text'}`}><Tag className="h-3 w-3" />{l}</Link>
            ))}
          </div>
        )}
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
                  {c.labels.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{c.labels.map((l) => <span key={l} className="rounded-full bg-surface-accent px-1.5 text-[10px] text-accent">{l}</span>)}</span>}
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
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-5 py-2">
              <Tag className="h-3.5 w-3.5 text-muted" />
              {labels.map((l) => (
                <span key={l} className="inline-flex items-center gap-1 rounded-full bg-surface-accent px-2 py-0.5 text-xs text-accent">{l}
                  <button type="button" aria-label={`Remover ${l}`} onClick={() => saveLabels(labels.filter((x) => x !== l))}><X className="h-3 w-3" /></button>
                </span>
              ))}
              <input className="input h-7 w-32 py-0.5 text-xs" list="support-labels" placeholder="+ etiqueta" value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = newLabel.trim(); if (v && !labels.includes(v) && labels.length < 10) saveLabels([...labels, v]); setNewLabel(''); } }} />
              <datalist id="support-labels">{allLabels.map((l) => <option key={l} value={l} />)}</datalist>
            </div>
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

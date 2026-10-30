'use client';

import { CheckCircle2, CornerDownLeft, MessageSquarePlus, RotateCcw, UserCog } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import { Submit, FormMessage } from '@/components/form';
import type { HelpinState } from './actions';
import { assignConversationAction, closeConversationAction, createConversationAction, replyAction } from './actions';

export type ConversationItem = {
  id: string; subject: string; contactName: string; channel: string;
  status: 'open' | 'closed'; lastMessageAt: string; assignee: string | null; leadName: string | null;
};

export type MessageItem = { id: string; sender: 'contact' | 'agent'; body: string; simulated: boolean; at: string };

export type LeadContext = { id: string; fullName: string; company: string; stage: string; headline: string } | null;

export function HelpinView({ conversations, selectedId, messages, members, currentUserId, isDemo, leadContext }: {
  conversations: ConversationItem[];
  selectedId: string | null;
  messages: MessageItem[];
  members: { id: string; name: string }[];
  currentUserId: string;
  isDemo: boolean;
  leadContext: LeadContext;
}) {
  const [replyState, replyFormAction] = useActionState<HelpinState, FormData>(replyAction, undefined);
  const [newState, newFormAction] = useActionState<HelpinState, FormData>(createConversationAction, undefined);
  const [, start] = useTransition();
  const [assignee, setAssignee] = useState<string>('');

  const thisConv = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
      <aside className="space-y-3 self-start">
        <details className="card p-4" open={!conversations.length}>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><MessageSquarePlus className="h-4 w-4 text-accent" /> Abrir conversa</summary>
          <form action={newFormAction} className="mt-3 space-y-2 text-sm">
            <input name="contactName" className="input" placeholder="Nome do contato" required />
            <input name="subject" className="input" placeholder="Assunto (opcional)" />
            <textarea name="firstMessage" rows={3} className="input" placeholder="Primeira mensagem do contato" />
            <Submit className="btn-primary" pendingText="Abrindo…">Abrir conversa</Submit>
          </form>
          {newState && <div className="mt-2"><FormMessage state={newState} /></div>}
        </details>
        <div className="card divide-y divide-border p-0">
          {conversations.map((c) => (
            <a key={c.id} href={`/helpin?conversation=${c.id}`}
              className={`block px-4 py-3 text-sm ${c.id === selectedId ? 'bg-surface-accent' : ''} hover:bg-surface`}>
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{c.contactName}</span>
                {c.status === 'closed' ? <span className="ml-auto shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted">encerrada</span>
                  : <span className="ml-auto shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[10px] text-success">aberta</span>}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{c.subject || c.leadName || c.channel}</p>
              <p className="text-[11px] text-muted">{c.lastMessageAt}{c.assignee ? ` · resp. ${c.assignee}` : ''}</p>
            </a>
          ))}
          {!conversations.length && <p className="px-4 py-6 text-center text-sm text-muted">Nenhuma conversa.</p>}
        </div>
      </aside>

      <section className="card flex min-h-[420px] flex-col p-0">
        {!thisConv ? (
          <p className="m-auto max-w-sm text-center text-sm text-muted">Selecione uma conversa na caixa de entrada ou abra uma nova.</p>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
              <div>
                <p className="font-semibold">{thisConv.contactName}</p>
                <p className="text-xs text-muted">{thisConv.subject || 'Sem assunto'} · canal {thisConv.channel}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <UserCog className="h-4 w-4 text-muted" />
                <select className="input w-auto py-1.5 text-xs" value={thisConv.assignee ?? ''}
                  onChange={(e) => start(async () => assignConversationAction(thisConv.id, e.target.value || null))} aria-label="Responsável">
                  <option value="">Sem responsável</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button className={thisConv.status === 'open' ? 'btn-outline py-1.5 text-xs' : 'btn-outline py-1.5 text-xs'}
                  onClick={() => start(async () => closeConversationAction(thisConv.id, thisConv.status === 'open' ? 'closed' : 'open'))}>
                  {thisConv.status === 'open' ? <><CheckCircle2 className="h-4 w-4" /> Encerrar</> : <><RotateCcw className="h-4 w-4" /> Reabrir</>}
                </button>
              </div>
            </header>
            {leadContext && (
              <div className="border-b border-border bg-surface px-5 py-3 text-xs text-muted">
                Contexto do lead: <strong>{leadContext.fullName}</strong> · {leadContext.company || 'sem empresa'} · etapa <strong>{leadContext.stage}</strong>{leadContext.headline ? ` · ${leadContext.headline}` : ''}
              </div>
            )}
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              {messages.map((msg) => (
                <div key={msg.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.sender === 'contact' ? 'self-start bg-surface' : 'self-end bg-surface-accent'}`}>
                  <p className="whitespace-pre-wrap">{msg.body}</p>
                  <p className="mt-1 text-[11px] text-muted">{msg.at}{msg.simulated ? ' · SIMULADO (demo)' : ''}</p>
                </div>
              ))}
              {!messages.length && <p className="m-auto text-sm text-muted">Sem mensagens.</p>}
            </div>
            {thisConv.status === 'open' && (
              <form action={replyFormAction} className="flex items-end gap-2 border-t border-border p-4">
                <input type="hidden" name="conversationId" value={thisConv.id} />
                <textarea name="body" rows={2} className="input" placeholder={isDemo ? 'Responder (simulado na demo)…' : 'Responder…'} required />
                <Submit className="btn-primary shrink-0" pendingText="Enviando…"><CornerDownLeft className="h-4 w-4" /></Submit>
              </form>
            )}
            {replyState && <div className="px-4 pb-4"><FormMessage state={replyState} /></div>}
          </>
        )}
      </section>
    </div>
  );
}

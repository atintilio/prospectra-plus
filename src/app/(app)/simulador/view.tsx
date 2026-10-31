'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Linkedin, MessageCircle, Mic, Send } from 'lucide-react';
import { Submit } from '@/components/form';
import type { HelpinState } from '../helpin/actions';
import { replyAction } from '../helpin/actions';
import { demoLinkedInReplyAction, type SimState } from './actions';

type Conv = { id: string; subject: string; contactName: string; status: 'open' | 'closed'; lastMessageAt: string; leadId: string | null };
type Msg = { id: string; conversationId: string; sender: 'contact' | 'agent'; body: string; simulated: boolean; createdAt: string };
type Thread = { leadId: string; leadName: string; company: string; campaignId: string; campaignName: string };
type Step = { leadId: string; id: string; type: 'react' | 'comment' | 'invite' | 'message'; body: string; status: string; stepIndex: number; executedAt: string | null; dueDate: string; dispatchState: string };
type Ev = { leadId: string; type: string; at: string };

const STEP_LABEL: Record<string, string> = { react: 'Curtida/reação', comment: 'Comentário', invite: 'Convite', message: 'Mensagem' };

export function SimuladorView({ isDemo, voiceReady, conversations, messages, threads, timeline, events }: {
  isDemo: boolean; voiceReady: boolean;
  conversations: Conv[]; messages: Msg[]; threads: Thread[]; timeline: Step[]; events: Ev[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'whatsapp' | 'linkedin'>('whatsapp');
  const [convId, setConvId] = useState<string | null>(conversations[0]?.id ?? null);
  const [threadId, setThreadId] = useState<string | null>(threads[0]?.leadId ?? null);
  const [replyState, replyFormAction] = useActionState<HelpinState, FormData>(replyAction, undefined);
  const [linkedState, linkedAction] = useActionState<SimState, FormData>(wrapperLinkedIn, undefined);
  const [, start] = useTransition();

  const conv = conversations.find((c) => c.id === convId) ?? null;
  const thread = threads.find((t) => t.leadId === threadId) ?? null;
  const steps = timeline.filter((s) => s.leadId === threadId);
  const marks = events.filter((e) => e.leadId === threadId);
  const pending = steps.find((s) => s.status === 'pending');

  return (
    <div className="space-y-4">
      {!voiceReady && (
        <div className="card flex flex-wrap items-center gap-3 border-dashed p-4 text-sm">
          <Mic className="h-4 w-4 text-accent" />
          <span className="text-muted">Cadastre sua voz para ouvir a demonstração falada: vá em <b>WhatsApp → Sua voz na demonstração</b> e grave. Depois voltar aqui.</span>
          <a className="btn-outline" href="/whatsapp">Cadastrar voz</a>
        </div>
      )}
      <div className="flex gap-2">
        <button className={`btn-outline ${tab === 'whatsapp' ? 'btn-primary' : ''}`} onClick={() => setTab('whatsapp')}>
          <MessageCircle className="h-4 w-4" /> Conversas de WhatsApp
        </button>
        <button className={`btn-outline ${tab === 'linkedin' ? 'btn-primary' : ''}`} onClick={() => setTab('linkedin')}>
          <Linkedin className="h-4 w-4" /> Interações de LinkedIn
        </button>
        {voiceReady && <audio controls preload="none" src="/api/voice-demo/audio" className="h-10 flex-1" aria-label="Sua voz de demonstração" />}
      </div>

      {tab === 'whatsapp' && (
        <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
          <aside className="card divide-y divide-border p-0">
            {conversations.map((c) => (
              <button key={c.id} onClick={() => setConvId(c.id)} className={`block w-full px-4 py-3 text-left text-sm ${c.id === convId ? 'bg-surface-accent' : 'hover:bg-surface'}`}>
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{c.contactName}</span>
                  {c.status === 'open' ? <span className="ml-auto rounded-full bg-success-soft px-2 py-0.5 text-[10px] text-success">aberta</span> : <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted">encerrada</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">{c.subject}</p>
              </button>
            ))}
            {!conversations.length && <p className="px-4 py-8 text-center text-sm text-muted">Sem conversas demo.</p>}
          </aside>
          <section className="card flex min-h-[420px] flex-col p-0">
            <header className="border-b border-border px-5 py-3">
              <p className="font-medium">{conv?.contactName ?? 'Selecione uma conversa'}</p>
              <p className="text-xs text-muted">WhatsApp (simulado) · nenhuma mensagem real é enviada</p>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.filter((m) => m.conversationId === convId).map((m) => (
                <div key={m.id} className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.sender === 'agent' ? 'ml-auto bg-surface-accent' : 'bg-surface'}`}>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {m.simulated && <p className="mt-1 text-right text-[10px] text-muted">envio simulado (demo)</p>}
                </div>
              ))}
              {!conv && <p className="py-10 text-center text-sm text-muted">Escolha uma conversa ao lado para demonstrar.</p>}
            </div>
            {conv?.status === 'open' && (
              <form action={(f) => start(() => replyFormAction(f))} className="flex items-end gap-2 border-t border-border px-5 py-3">
                <input type="hidden" name="conversationId" value={conv.id} />
                <textarea name="body" rows={2} className="input flex-1" placeholder="Resposta da equipe (simulada na demo)…" maxLength={4000} required />
                <Submit className="btn-primary" pendingText="Registrando…"><Send className="h-4 w-4" /></Submit>
              </form>
            )}
            <div className="px-5 pb-3">{replyState && <p className="text-sm">{replyState.ok ?? replyState.error}</p>}</div>
          </section>
        </div>
      )}

      {tab === 'linkedin' && (
        <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
          <aside className="card divide-y divide-border p-0">
            {threads.map((t) => (
              <button key={t.leadId} onClick={() => setThreadId(t.leadId)} className={`block w-full px-4 py-3 text-left text-sm ${t.leadId === threadId ? 'bg-surface-accent' : 'hover:bg-surface'}`}>
                <span className="truncate font-medium">{t.leadName}</span>
                <p className="mt-0.5 truncate text-xs text-muted">{t.company} · {t.campaignName}</p>
              </button>
            ))}
            {!threads.length && <p className="px-4 py-8 text-center text-sm text-muted">Sem interações demo.</p>}
          </aside>
          <section className="card flex min-h-[420px] flex-col p-0">
            <header className="border-b border-border px-5 py-3">
              <p className="font-medium">{thread?.leadName ?? 'Selecione uma interação'}</p>
              <p className="text-xs text-muted">LinkedIn (simulado) · nenhuma ação real é executada</p>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {marks.map((m, i) => (
                <p key={`${m.type}-${i}`} className="text-[11px] font-medium uppercase tracking-wide text-accent">
                  {m.type === 'invite_accepted' ? 'Convite aceito' : m.type === 'reply_received' ? 'Resposta recebida' : 'Reunião marcada'} · {new Date(m.at).toLocaleDateString('pt-BR')}
                </p>
              ))}
              {steps.map((s) => (
                <div key={s.id} className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${s.status === 'done' ? 'bg-surface-accent' : 'border border-dashed border-border'}`}>
                  <p className="text-[11px] font-semibold text-muted">{STEP_LABEL[s.type] ?? s.type}{s.status === 'pending' ? ' · na fila' : ''}</p>
                  {s.body && <p className="mt-1 whitespace-pre-wrap">{s.body}</p>}
                  {s.status === 'done' && <p className="mt-1 text-right text-[10px] text-muted">executado (simulado)</p>}
                </div>
              ))}
              {!thread && <p className="py-10 text-center text-sm text-muted">Escolha um lead ao lado para demonstrar.</p>}
            </div>
            {thread && (
              <form action={(f) => start(() => { void wrapperLinkedIn(undefined, f).then((s) => { void s; }); })} className="flex items-end gap-2 border-t border-border px-5 py-3">
                <input type="hidden" name="campaignId" value={thread.campaignId} />
                <input type="hidden" name="leadId" value={thread.leadId} />
                <textarea name="body" rows={2} className="input flex-1" placeholder="Mensagem de follow-up (simulada na demo)…" maxLength={2000} required />
                <Submit className="btn-primary" pendingText="Registrando…"><Send className="h-4 w-4" /></Submit>
              </form>
            )}
            <div className="px-5 pb-3">{linkedState && <p className="text-sm">{linkedState.ok ?? linkedState.error}</p>}</div>
          </section>
        </div>
      )}
    </div>
  );
}

/** Liga o formulário à resposta simulada do LinkedIn (demo). */
function wrapperLinkedIn(_prev: SimState, formData: FormData) {
  return demoLinkedInReplyAction({
    campaignId: String(formData.get('campaignId') ?? ''),
    leadId: String(formData.get('leadId') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
}

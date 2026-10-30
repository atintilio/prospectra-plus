'use client';

import { CalendarCheck, CalendarX2, Copy, ExternalLink, Send } from 'lucide-react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeetingStatus } from '@/db/schema';
import { Submit, FormMessage } from '@/components/form';
import type { AgendaState } from './actions';
import { cancelMeetingAction, confirmMeetingAction, createMeetingAction, resendInviteAction } from './actions';

export type MeetingView = {
  id: string; title: string; requester: string; slot: string;
  status: MeetingStatus; icsState: string; icsError: string | null; publicUrl: string;
};

const STATUS_UI: Record<MeetingStatus, { label: string; tone: string }> = {
  requested: { label: 'Solicitada', tone: 'bg-surface-accent text-accent' },
  confirmed: { label: 'Confirmada', tone: 'bg-success-soft text-success' },
  cancelled: { label: 'Cancelada', tone: 'bg-surface text-muted' },
};
const ICS_UI: Record<string, string> = { none: 'sem convite', queued: '.ics na fila (simulado)', sent: '.ics enviado', error: '.ics com erro' };

export function AgendaView({ meetings, schedulerUrl, isDemo, leads }: {
  meetings: MeetingView[];
  schedulerUrl: string | null;
  isDemo: boolean;
  leads: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [state, action] = useActionState<AgendaState | undefined, FormData>(createMeetingAction, undefined);
  const act = async (fn: (id: string) => Promise<unknown>, id: string) => { await fn(id); router.refresh(); };

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="card space-y-4 p-5 self-start">
        <h2 className="text-base font-semibold">Nova reunião</h2>
        <form action={action} className="space-y-3">
          <div><label className="label" htmlFor="title">Título</label>
            <input id="title" name="title" className="input" placeholder="Conversa introdutória" required /></div>
          <div><label className="label" htmlFor="requesterName">Nome do convidado</label>
            <input id="requesterName" name="requesterName" className="input" placeholder="Maria Souza" required /></div>
          <div><label className="label" htmlFor="requesterEmail">E-mail do convidado</label>
            <input id="requesterEmail" name="requesterEmail" type="email" className="input" placeholder="maria@empresa.com" required /></div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div><label className="label" htmlFor="date">Data</label><input id="date" name="date" type="date" className="input" required /></div>
            <div><label className="label" htmlFor="time">Hora</label><input id="time" name="time" type="time" className="input" required /></div>
            <div><label className="label" htmlFor="duration">Duração</label>
              <select id="duration" name="durationMin" className="input" defaultValue="30">
                <option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option>
              </select></div>
          </div>
          <div><label className="label" htmlFor="leadId">Lead (opcional)</label>
            <select id="leadId" name="leadId" className="input" defaultValue="">
              <option value="">Sem lead vinculado</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.fullName}</option>)}
            </select></div>
          <Submit className="btn-primary" pendingText="Solicitando…">Pedir reunião</Submit>
        </form>
        {state && <FormMessage state={state} />}
        {isDemo && <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">Demo: nada é enviado de verdade — o convite fica marcado como “na fila”.</p>}
      </section>

      <section className="space-y-3">
        {schedulerUrl && (
          <a href={schedulerUrl} target="_blank" rel="noreferrer" className="card flex items-center gap-3 p-4 text-sm hover:border-accent">
            <ExternalLink className="h-4 w-4 text-accent" /> Agendador externo configurado (MEETING_SCHEDULER_URL) — abrir
          </a>
        )}
        {meetings.map((m) => {
          const S = STATUS_UI[m.status];
          return (
            <article key={m.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{m.title}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${S.tone}`}>{S.label}</span>
                <span className="text-xs text-muted">{ICS_UI[m.icsState] ?? m.icsState}</span>
                <div className="ml-auto flex gap-1">
                  <button className="btn-ghost px-2 py-1" onClick={() => navigator.clipboard?.writeText(m.publicUrl).then(() => router.refresh())} title="Copiar link público" aria-label="Copiar link"><Copy className="h-4 w-4" /></button>
                  {m.status !== 'confirmed' && <button className="btn-ghost px-2 py-1 hover:text-success" onClick={() => act(confirmMeetingAction, m.id)} title="Confirmar"><CalendarCheck className="h-4 w-4" /></button>}
                  {m.status !== 'cancelled' && <button className="btn-ghost px-2 py-1 hover:text-danger" onClick={() => act(cancelMeetingAction, m.id)} title="Cancelar"><CalendarX2 className="h-4 w-4" /></button>}
                  {m.icsState === 'error' && <button className="btn-ghost px-2 py-1" onClick={() => act(resendInviteAction, m.id)} title="Tentar enviar de novo"><Send className="h-4 w-4" /></button>}
                </div>
              </div>
              <p className="mt-1 text-sm text-muted">{m.slot} · {m.requester}</p>
              {m.icsError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{m.icsError}</p>}
              <p className="mt-2 text-xs text-muted break-all">Link público: {m.publicUrl}</p>
            </article>
          );
        })}
        {!meetings.length && <p className="card p-8 text-center text-sm text-muted">Nenhuma reunião solicitada ainda.</p>}
      </section>
    </div>
  );
}

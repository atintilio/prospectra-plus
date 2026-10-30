'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertCircle, CalendarCheck, CheckCircle2 } from 'lucide-react';

/**
 * Tela pública de marcação (fora do grupo `(app)`: sem sessão, sem senha).
 *
 * O componente recebe do servidor o evento e a primeira leva de horários
 * livres; a interação acontece aqui:
 *  - escolher o horário (grade agrupada por dia, rótulos em pt-BR do fuso do evento);
 *  - enviar os dados para `POST /api/agenda/book`;
 *  - mostrar a confirmação com o link de cancelamento.
 *
 * O cancelamento (usado em `/agendamento/cancelar`) também mora aqui, porque é
 * o único client component do escopo público: `CancelBookingButton` fala com
 * `POST /api/agenda/cancel`.
 */

/** Slot disponível (rótulo já vem em pt-BR, no fuso do evento). */
export type PublicSlot = {
  startIso: string;
  endIso: string;
  label: string;
};

/** Dados públicos do evento devolvidos por `listPublicEvent`. */
export type PublicAgendaEvent = {
  slug: string;
  title: string;
  description: string;
  durationMin: number;
  location: string;
  requiresConfirmation: boolean;
  hostName: string;
  /** Fuso IANA do evento (ex.: "America/Sao_Paulo"). */
  timezone: string;
};

type BookingForm = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

type BookOk = { ok: true; meetingId: string; cancelUrl: string };
type BookFail = { ok: false; error: string; code?: string };
type BookPayload = BookOk | BookFail;

const WEEKDAY_LONG: Record<string, string> = {
  dom: 'Domingo',
  seg: 'Segunda-feira',
  ter: 'Terça-feira',
  qua: 'Quarta-feira',
  qui: 'Quinta-feira',
  sex: 'Sexta-feira',
  sáb: 'Sábado',
};

const EMPTY_FORM: BookingForm = { name: '', email: '', phone: '', notes: '' };

/** "qua, 12/11 às 14:00" -> dia "qua, 12/11" e horário "14:00". */
function splitLabel(label: string): { day: string; time: string } {
  const at = label.indexOf(' às ');
  if (at === -1) return { day: label.trim(), time: '' };
  return { day: label.slice(0, at).trim(), time: label.slice(at + 4).trim() };
}

/** "qua, 12/11" -> "Quarta-feira, 12/11". */
function dayHeading(day: string): string {
  const [weekday, date] = day.split(', ');
  const long = WEEKDAY_LONG[(weekday ?? '').toLowerCase()] ?? weekday ?? '';
  return date ? `${long}, ${date}` : long;
}

/** Data (dd/mm) do rótulo do slot no fuso do evento. */
function eventDateOf(label: string): string {
  return splitLabel(label).day.split(', ')[1] ?? '';
}

/**
 * Horário e data de um instante no fuso informado (pt-BR).
 * Devolve strings vazias quando o fuso não é reconhecido pelo navegador.
 */
export function formatInTimeZone(iso: string, timeZone: string): { time: string; date: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { time: '', date: '' };
  try {
    return {
      time: new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(date),
      date: new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit' }).format(date),
    };
  } catch {
    return { time: '', date: '' };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSlot(value: unknown): value is PublicSlot {
  if (!isRecord(value)) return false;
  return typeof value.startIso === 'string' && typeof value.label === 'string';
}

/** Lê a resposta de `POST /api/agenda/book` sem confiar no formato. */
function parseBookPayload(value: unknown): BookPayload | null {
  if (!isRecord(value)) return null;
  if (value.ok === true && typeof value.cancelUrl === 'string') {
    return {
      ok: true,
      meetingId: typeof value.meetingId === 'string' ? value.meetingId : '',
      cancelUrl: value.cancelUrl,
    };
  }
  if (value.ok === false) {
    return {
      ok: false,
      error: typeof value.error === 'string' ? value.error : '',
      code: typeof value.code === 'string' ? value.code : undefined,
    };
  }
  return null;
}

/** Mensagem de erro em pt-BR, nunca a mensagem crua do servidor. */
function bookingErrorMessage(payload: BookPayload | null, status: number): string {
  if (payload && payload.ok === false) {
    if (payload.code === 'not_found') {
      return 'Este agendamento não está mais disponível. Peça um novo link com a nossa equipe.';
    }
    if (payload.code === 'past') {
      return 'Este horário já passou. Escolha outro horário disponível.';
    }
    if (payload.code === 'slot_taken') {
      return 'Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.';
    }
    if (payload.error) return payload.error;
  }
  if (status >= 500) {
    return 'Não foi possível concluir o agendamento agora. Tente novamente em alguns instantes.';
  }
  return 'Não foi possível concluir o agendamento. Confira os dados e tente novamente.';
}

export function BookingView({
  slug,
  token,
  event,
  initialSlots,
}: {
  slug: string;
  token: string;
  event: PublicAgendaEvent;
  initialSlots: PublicSlot[];
}) {
  const [slots, setSlots] = useState<PublicSlot[]>(initialSlots);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<BookingForm>(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ cancelUrl: string; label: string; visitorLabel: string | null } | null>(null);

  /**
   * Fuso de quem agenda. Só existe no cliente: no servidor não há "fuso do
   * visitante", então a detecção acontece depois da hidratação (useEffect) e
   * o HTML do servidor continua mostrando apenas o fuso do evento.
   */
  const [visitorTimeZone, setVisitorTimeZone] = useState<string | null>(null);
  useEffect(() => {
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (zone) setVisitorTimeZone(zone);
    } catch {
      // Navegador sem Intl completo: continua só com o fuso do evento.
    }
  }, []);

  // O horário extra só aparece quando o fuso de quem agenda é outro.
  const showVisitorTime = Boolean(visitorTimeZone && visitorTimeZone !== event.timezone);

  /**
   * Rótulo do slot no fuso de quem agenda (null quando é o mesmo fuso).
   * `differs` diz se o horário local é realmente diferente do horário do
   * evento (fusos com o mesmo offset não repetem o mesmo horário na tela).
   */
  function visitorLabelOf(slot: PublicSlot): { label: string; differs: boolean } | null {
    if (!showVisitorTime || !visitorTimeZone) return null;
    const info = formatInTimeZone(slot.startIso, visitorTimeZone);
    if (!info.time) return null;
    const dateDiffers = info.date !== eventDateOf(slot.label);
    const timeDiffers = info.time !== splitLabel(slot.label).time;
    // Quando o dia muda (fuso muito adiantado), o horário local vem com a data.
    return { label: dateDiffers ? `${info.date} ${info.time}` : info.time, differs: dateDiffers || timeDiffers };
  }

  /**
   * Assinatura dos horários recebidos do servidor: se ela mudar, a grade
   * local é atualizada (ex.: o servidor recalculou a disponibilidade). O
   * mesmo dado não reinicia a lista, preservando o refresh feito no cliente.
   */
  const serverSignature = initialSlots.map((slot) => slot.startIso).join('|');
  const [syncedSignature, setSyncedSignature] = useState(serverSignature);
  if (serverSignature !== syncedSignature) {
    setSyncedSignature(serverSignature);
    setSlots(initialSlots);
    setSelected((current) => (current && initialSlots.some((slot) => slot.startIso === current) ? current : null));
  }

  /** Horários agrupados por dia (a ordem dos slots já é cronológica). */
  const groups = useMemo(() => {
    const map = new Map<string, PublicSlot[]>();
    for (const slot of slots) {
      const { day } = splitLabel(slot.label);
      const list = map.get(day);
      if (list) list.push(slot);
      else map.set(day, [slot]);
    }
    return Array.from(map.entries());
  }, [slots]);

  const selectedSlot = slots.find((slot) => slot.startIso === selected) ?? null;

  /** Recarrega a grade de horários (usado quando um horário é tomado). */
  async function refreshSlots(): Promise<void> {
    try {
      const res = await fetch(`/api/agenda/slots?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !isRecord(data) || !Array.isArray(data.slots)) return;
      const fresh = data.slots.filter(isSlot);
      setSlots(fresh);
      setSelected((current) => (current && fresh.some((slot) => slot.startIso === current) ? current : null));
    } catch {
      // Sem rede: mantém a grade atual na tela.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = form.name.trim();
    if (name.length < 2) {
      setError('Informe seu nome completo.');
      return;
    }
    if (!selectedSlot) {
      setError('Escolha um horário para continuar.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/agenda/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          token: token || undefined,
          start: selectedSlot.startIso,
          attendeeName: name,
          attendeeEmail: form.email.trim() || undefined,
          attendeePhone: form.phone.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      const payload = parseBookPayload(await res.json().catch(() => null));
      if (!payload || payload.ok === false) {
        setError(bookingErrorMessage(payload, res.status));
        if (payload && payload.ok === false && payload.code === 'slot_taken') await refreshSlots();
        return;
      }
      setDone({
        cancelUrl: payload.cancelUrl,
        label: selectedSlot.label,
        visitorLabel: visitorLabelOf(selectedSlot)?.label ?? null,
      });
    } catch {
      setError('Não foi possível concluir o agendamento. Verifique sua conexão e tente novamente.');
    } finally {
      setSending(false);
    }
  }

  // ------------------------------------------------------------ confirmação
  if (done) {
    return (
      <section className="card mt-5 p-5 sm:p-7" aria-live="polite">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success-soft text-success">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">Reunião agendada!</h2>
        <p className="mt-2 text-sm text-muted">
          {event.title} — {done.label}. Enviamos os detalhes para o contato informado.
        </p>
        {done.visitorLabel && visitorTimeZone && (
          <p className="mt-1 text-sm text-muted">
            No seu fuso ({visitorTimeZone}): {done.visitorLabel}.
          </p>
        )}
        {event.requiresConfirmation && (
          <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            O vendedor ainda vai confirmar o horário. Você recebe um aviso assim que ele confirmar.
          </p>
        )}
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium">Precisa cancelar ou remarcar?</p>
          <p className="mt-1 text-xs text-muted">Guarde este link — ele cancela a reserva sem precisar de senha.</p>
          <a className="btn-outline mt-3" href={done.cancelUrl}>Abrir cancelamento</a>
          <p className="mt-3 break-all text-xs text-muted">{done.cancelUrl}</p>
        </div>
        <button
          type="button"
          className="btn-ghost mt-5"
          onClick={() => {
            setDone(null);
            setSelected(null);
            setForm(EMPTY_FORM);
          }}
        >
          Agendar outro horário
        </button>
      </section>
    );
  }

  // ------------------------------------------------------------- marcação
  return (
    <section className="mt-5">
      <div className="card p-5 sm:p-7">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarCheck className="h-5 w-5 text-accent" /> Escolha o horário
        </h2>

        {showVisitorTime && visitorTimeZone && (
          <p className="mt-3 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
            Os horários abaixo são do fuso do evento ({event.timezone}). Você está em {visitorTimeZone}: cada horário
            mostra também o horário local.
          </p>
        )}

        {groups.length === 0 ? (
          <p className="mt-3 rounded-lg bg-surface px-3 py-3 text-sm text-muted">
            Não há horários livres no momento. Peça um novo link com a nossa equipe ou tente mais tarde.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {groups.map(([day, daySlots]) => (
              <div key={day}>
                <p className="text-sm font-semibold text-accent">{dayHeading(day)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {daySlots.map((slot) => {
                    const active = slot.startIso === selected;
                    const visitor = visitorLabelOf(slot);
                    return (
                      <button
                        key={slot.startIso}
                        type="button"
                        onClick={() => {
                          setSelected(slot.startIso);
                          setError(null);
                        }}
                        aria-pressed={active}
                        className={active ? 'btn-primary' : 'btn-outline'}
                      >
                        <span className="flex flex-col items-center leading-tight">
                          <span>{splitLabel(slot.label).time}</span>
                          {visitor?.differs && <span className="text-[11px] font-normal opacity-80">{visitor.label}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="card mt-5 p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Seus dados</h2>
        <p className="mt-1 text-sm text-muted">
          {selectedSlot
            ? `Horário escolhido: ${selectedSlot.label}.`
            : 'Escolha um horário acima para confirmar a reserva.'}
        </p>
        {selectedSlot && showVisitorTime && visitorTimeZone && (
          <p className="mt-1 text-xs text-muted">
            No seu fuso ({visitorTimeZone}): {visitorLabelOf(selectedSlot)?.label}.
          </p>
        )}

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="label">Nome completo *</span>
            <input
              className="input"
              name="attendeeName"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Como você quer ser chamado(a)"
              autoComplete="name"
              maxLength={120}
              required
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">E-mail</span>
              <input
                className="input"
                type="email"
                name="attendeeEmail"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="voce@empresa.com.br"
                autoComplete="email"
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="label">Telefone (opcional)</span>
              <input
                className="input"
                type="tel"
                name="attendeePhone"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="(11) 90000-0000"
                autoComplete="tel"
                maxLength={40}
              />
            </label>
          </div>

          <label className="block">
            <span className="label">Observação (opcional)</span>
            <textarea
              className="input min-h-24 resize-y"
              name="notes"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Quer falar de algo específico?"
              maxLength={2000}
            />
          </label>
        </div>

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <button className="btn-primary mt-5 w-full sm:w-auto" type="submit" disabled={sending || !selectedSlot}>
          {sending ? 'Confirmando…' : 'Confirmar agendamento'}
        </button>
        <p className="mt-2 text-xs text-muted">
          Ao confirmar, você recebe um link para cancelar ou remarcar a reunião.
        </p>
      </form>
    </section>
  );
}

/**
 * Botão de cancelamento usado em `/agendamento/cancelar`.
 * Fala com `POST /api/agenda/cancel` e mostra o resultado em pt-BR.
 */
export function CancelBookingButton({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function cancel(): Promise<void> {
    setStatus('sending');
    setMessage(null);
    try {
      const res = await fetch('/api/agenda/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelToken: token }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (res.ok && isRecord(data) && data.ok === true) {
        setStatus('done');
        setMessage('Reunião cancelada. O horário voltou a ficar disponível.');
        return;
      }
      const error = isRecord(data) && typeof data.error === 'string' ? data.error : '';
      setStatus('error');
      setMessage(error || 'Não foi possível cancelar a reserva. Tente novamente em alguns instantes.');
    } catch {
      setStatus('error');
      setMessage('Não foi possível cancelar a reserva. Verifique sua conexão e tente novamente.');
    }
  }

  if (status === 'done') {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success" role="status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </p>
    );
  }

  return (
    <div>
      <button type="button" className="btn-danger" onClick={cancel} disabled={status === 'sending'}>
        {status === 'sending' ? 'Cancelando…' : 'Cancelar esta reunião'}
      </button>
      {message && (
        <p className="mt-3 flex items-start gap-2 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}

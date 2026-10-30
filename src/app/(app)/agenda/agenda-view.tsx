'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Card, Empty } from '@/components/ui';
import {
  confirmarReservaAction,
  cancelarReservaAction,
  criarTipoReuniaoAction,
  enviarLinkWhatsappAction,
  gerarLinkAction,
  salvarDisponibilidadeAction,
  salvarTipoReuniaoAction,
} from './actions';

/** Estado devolvido pelas server actions da agenda. */
export type AgendaActionState = { ok?: string; error?: string; url?: string; id?: string } | undefined;

export type AgendaEventTypeView = {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMin: number;
  slotIntervalMin: number;
  minNoticeMin: number;
  timezone: string;
  location: string;
  requiresConfirmation: boolean;
  isActive: boolean;
  publicUrl: string;
};

export type AgendaWindowView = { dayOfWeek: number; startMinute: number; endMinute: number };

export type AgendaBookingView = {
  id: string;
  when: string;
  who: string;
  contact: string;
  leadId: string | null;
  leadName: string | null;
  status: 'requested' | 'confirmed';
  source: string;
};

export type AgendaLinkView = {
  id: string;
  url: string;
  eventTitle: string;
  leadName: string | null;
  channel: string;
  createdAt: string;
  used: boolean;
};

export type AgendaLeadView = { id: string; fullName: string; phone: string };

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Fortaleza',
  'America/Recife',
  'America/Manaus',
  'America/Belem',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Santarem',
  'UTC',
];

/** "09:00" -> 540 minutos desde a meia-noite. */
function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

/** 540 minutos -> "09:00". */
function minutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(1440, Math.trunc(minutes)));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Antecedência/intervalo em linguagem de salesperson. */
function minutesToLabel(minutes: number): string {
  if (minutes <= 0) return 'sem antecedência';
  if (minutes % 60 === 0) return `${minutes / 60}h de antecedência`;
  if (minutes < 60) return `${minutes} min de antecedência`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')} de antecedência`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Janelas do banco (minutos) -> estado do editor (texto "HH:MM"). */
function windowsToState(windows: AgendaWindowView[]): Record<number, { start: string; end: string }[]> {
  const state: Record<number, { start: string; end: string }[]> = {};
  for (const day of [0, 1, 2, 3, 4, 5, 6]) state[day] = [];
  for (const window of windows) {
    if (window.dayOfWeek < 0 || window.dayOfWeek > 6) continue;
    state[window.dayOfWeek].push({ start: minutesToTime(window.startMinute), end: minutesToTime(window.endMinute) });
  }
  return state;
}

export function AgendaView({
  eventTypes,
  availability,
  bookings,
  links,
  leads,
}: {
  eventTypes: AgendaEventTypeView[];
  availability: Record<string, AgendaWindowView[]>;
  bookings: AgendaBookingView[];
  links: AgendaLinkView[];
  leads: AgendaLeadView[];
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string>(eventTypes[0]?.id ?? '');
  const [formVersion, setFormVersion] = useState(0);
  const editando = eventTypes.find((e) => e.id === editandoId) ?? null;
  // A chave carrega o dado de disponibilidade: quando o servidor devolve outra
  // versão, o editor recomeça a partir do que está salvo.
  const disponibilidadeKey = JSON.stringify(availability[selecionadoId] ?? []);

  function selecionar(id: string) {
    setSelecionadoId(id);
  }

  return (
    <div className="space-y-4">
      <Card
        title={editando ? 'Editar tipo de reunião' : 'Novo tipo de reunião'}
        icon={CalendarPlus}
        action={editando ? (
          <button type="button" className="btn-ghost text-xs" onClick={() => setEditandoId(null)}>
            <X className="h-3.5 w-3.5" /> Cancelar edição
          </button>
        ) : undefined}
      >
        <TipoReuniaoForm
          key={`${editando?.id ?? 'novo'}-${formVersion}`}
          eventType={editando}
          onSaved={(id) => {
            setEditandoId(null);
            setFormVersion((v) => v + 1);
            if (id) selecionar(id);
          }}
        />
      </Card>

      <Card title="Tipos de reunião" icon={CalendarDays}>
        {eventTypes.length === 0 ? (
          <Empty icon={CalendarDays} title="Nenhum tipo de reunião ainda" text="Crie o primeiro tipo de reunião acima: ele define a duração, a antecedência e o link que o lead recebe." />
        ) : (
          <ul className="divide-y divide-border">
            {eventTypes.map((eventType) => (
              <li key={eventType.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {eventType.title}
                    <span className={`pill ${eventType.isActive ? 'bg-success-soft text-success' : 'bg-surface text-muted'}`}>
                      {eventType.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    {eventType.requiresConfirmation && <span className="pill bg-warning-soft text-warning">Exige aprovação</span>}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {eventType.durationMin} min por reunião · {minutesToLabel(eventType.minNoticeMin)} · intervalo de {eventType.slotIntervalMin} min · {eventType.timezone}
                  </p>
                  {eventType.location && <p className="mt-1 truncate text-sm text-muted">Call: {eventType.location}</p>}
                  <a
                    href={eventType.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 break-all text-xs text-accent hover:underline"
                  >
                    {eventType.publicUrl} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      setEditandoId(eventType.id);
                      selecionar(eventType.id);
                    }}
                  >
                    <Pencil className="h-4 w-4" /> Editar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      selecionar(eventType.id);
                      document.getElementById('agenda-links')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                  >
                    <Link2 className="h-4 w-4" /> Gerar link
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Horários disponíveis" icon={Clock}>
          {eventTypes.length === 0 ? (
            <p className="text-sm text-muted">Crie um tipo de reunião para definir os dias e as janelas de horário.</p>
          ) : (
            <DisponibilidadeEditor
              key={`${selecionadoId}-${disponibilidadeKey}`}
              eventTypeId={selecionadoId}
              eventTypes={eventTypes}
              janelas={windowsToState(availability[selecionadoId] ?? [])}
              onSelect={selecionar}
            />
          )}
        </Card>

        <Card title="Link público" icon={Link2}>
          <div id="agenda-links">
            {eventTypes.length === 0 ? (
              <p className="text-sm text-muted">Crie um tipo de reunião para gerar o link que o lead recebe.</p>
            ) : (
              <LinksSection
                key={selecionadoId}
                eventTypeId={selecionadoId}
                eventTypes={eventTypes}
                leads={leads}
                onSelect={selecionar}
                links={links}
              />
            )}
          </div>
        </Card>
      </div>

      <Card title="Próximas reservas" icon={CalendarCheck}>
        {bookings.length === 0 ? (
          <Empty icon={CalendarCheck} title="Nenhuma reserva marcada" text="Quando alguém usar o link público, a reserva aparece aqui para você confirmar ou cancelar." />
        ) : (
          <ul className="divide-y divide-border">
            {bookings.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ formulário */

function TipoReuniaoForm({ eventType, onSaved }: { eventType: AgendaEventTypeView | null; onSaved: (id?: string) => void }) {
  const [state, action, pending] = useActionState(
    eventType ? salvarTipoReuniaoAction : criarTipoReuniaoAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      {eventType && <input type="hidden" name="eventTypeId" value={eventType.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Título</span>
          <input
            className="input"
            name="title"
            defaultValue={eventType?.title ?? ''}
            placeholder="Reunião de diagnóstico"
            maxLength={120}
            required
            disabled={pending}
          />
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Descrição para o lead</span>
          <textarea
            className="input"
            name="description"
            rows={2}
            defaultValue={eventType?.description ?? ''}
            placeholder="Em 30 minutos a gente entende o seu momento e aponta os próximos passos."
            maxLength={2000}
            disabled={pending}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Duração (min)</span>
          <input className="input" type="number" name="durationMin" min={5} max={480} step={5} defaultValue={eventType?.durationMin ?? 30} required disabled={pending} />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Antecedência mínima (min)</span>
          <input className="input" type="number" name="minNoticeMin" min={0} max={20160} step={15} defaultValue={eventType?.minNoticeMin ?? 120} required disabled={pending} />
          <span className="mt-1 block text-xs text-muted">O lead só consegue agendar a partir de quanto tempo antes.</span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Intervalo entre horários (min)</span>
          <input className="input" type="number" name="slotIntervalMin" min={5} max={240} step={5} defaultValue={eventType?.slotIntervalMin ?? 30} required disabled={pending} />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Fuso horário</span>
          <select className="input" name="timezone" defaultValue={eventType?.timezone ?? 'America/Sao_Paulo'} disabled={pending}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz.replace('America/', '').replace('_', ' ')} ({tz})</option>
            ))}
          </select>
        </label>

        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Link da call</span>
          <input
            className="input"
            name="location"
            defaultValue={eventType?.location ?? ''}
            placeholder="https://meet.google.com/abc-defg-hij"
            maxLength={500}
            disabled={pending}
          />
          <span className="mt-1 block text-xs text-muted">Link da sala usado na reserva (Google Meet, Zoom, Teams…).</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="requiresConfirmation" defaultChecked={eventType?.requiresConfirmation ?? false} disabled={pending} />
          Exigir aprovação do vendedor antes de confirmar
        </label>
        {eventType && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={eventType.isActive} disabled={pending} />
            Tipo de reunião ativo
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>
          {pending ? 'Salvando…' : eventType ? 'Salvar alterações' : 'Criar tipo de reunião'}
        </button>
        {state?.ok && <span className="text-sm text-success" role="status">{state.ok}</span>}
        {state?.error && <span className="text-sm text-danger" role="alert">{state.error}</span>}
      </div>

      {state?.ok && !eventType && (
        <button type="button" className="btn-ghost text-xs" onClick={() => onSaved(state?.id)}>
          Criar outro tipo de reunião
        </button>
      )}
    </form>
  );
}

/* ------------------------------------------------------- disponibilidade */

function DisponibilidadeEditor({
  eventTypeId,
  eventTypes,
  janelas,
  onSelect,
}: {
  eventTypeId: string;
  eventTypes: AgendaEventTypeView[];
  janelas: Record<number, { start: string; end: string }[]>;
  onSelect: (id: string) => void;
}) {
  const [state, action, pending] = useActionState(salvarDisponibilidadeAction, undefined);
  const [local, setLocal] = useState<Record<number, { start: string; end: string }[]>>(janelas);

  const payload = JSON.stringify(
    Object.entries(local).flatMap(([day, list]) =>
      list
        .filter((w) => w.start && w.end && timeToMinutes(w.start) < timeToMinutes(w.end))
        .map((w) => ({
          dayOfWeek: Number(day),
          startMinute: timeToMinutes(w.start),
          endMinute: timeToMinutes(w.end),
        })),
    ),
  );

  function addWindow(day: number) {
    setLocal((current) => ({
      ...current,
      [day]: [...(current[day] ?? []), { start: '09:00', end: '18:00' }],
    }));
  }

  function removeWindow(day: number, index: number) {
    setLocal((current) => ({
      ...current,
      [day]: (current[day] ?? []).filter((_, i) => i !== index),
    }));
  }

  function updateWindow(day: number, index: number, key: 'start' | 'end', value: string) {
    setLocal((current) => ({
      ...current,
      [day]: (current[day] ?? []).map((w, i) => (i === index ? { ...w, [key]: value } : w)),
    }));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventTypeId" value={eventTypeId} />
      <input type="hidden" name="availability" value={payload} />

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Tipo de reunião</span>
        <select className="input" value={eventTypeId} onChange={(e) => onSelect(e.target.value)} disabled={pending}>
          {eventTypes.map((eventType) => (
            <option key={eventType.id} value={eventType.id}>
              {eventType.title}
              {eventType.isActive ? '' : ' (inativo)'}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        {WEEKDAYS.map((label, day) => (
          <div key={label} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{label}</p>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => addWindow(day)} disabled={pending}>
                <Plus className="h-3.5 w-3.5" /> Horário
              </button>
            </div>
            {(local[day] ?? []).length === 0 ? (
              <p className="mt-1 text-xs text-muted">Sem janela — esse dia não aparece na agenda.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(local[day] ?? []).map((window, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <div className="w-28">
                      <input
                        className="input"
                        type="time"
                        step={900}
                        value={window.start}
                        onChange={(e) => updateWindow(day, index, 'start', e.target.value)}
                        disabled={pending}
                        aria-label={`Início do horário de ${label}`}
                      />
                    </div>
                    <span className="text-xs text-muted">até</span>
                    <div className="w-28">
                      <input
                        className="input"
                        type="time"
                        step={900}
                        value={window.end}
                        onChange={(e) => updateWindow(day, index, 'end', e.target.value)}
                        disabled={pending}
                        aria-label={`Fim do horário de ${label}`}
                      />
                    </div>
                    <button type="button" className="btn-ghost px-2 py-1" onClick={() => removeWindow(day, index)} disabled={pending} aria-label="Remover janela">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? 'Salvando…' : 'Salvar horários'}</button>
        {state?.ok && <span className="text-sm text-success" role="status">{state.ok}</span>}
        {state?.error && <span className="text-sm text-danger" role="alert">{state.error}</span>}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ links */

function LinksSection({
  eventTypeId,
  eventTypes,
  leads,
  links,
  onSelect,
}: {
  eventTypeId: string;
  eventTypes: AgendaEventTypeView[];
  leads: AgendaLeadView[];
  links: AgendaLinkView[];
  onSelect: (id: string) => void;
}) {
  const [gerarState, gerarAction, gerando] = useActionState(gerarLinkAction, undefined);
  const [waState, waAction, enviando] = useActionState(enviarLinkWhatsappAction, undefined);
  const [leadId, setLeadId] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [copiado, setCopiado] = useState(false);

  const url = gerarState?.url ?? waState?.url ?? '';
  const evento = eventTypes.find((e) => e.id === eventTypeId);

  useEffect(() => {
    if (!gerarState?.url) return;
    const primeiro = leads[0]?.fullName.split(' ')[0] ?? '';
    setMensagem(
      `Olá${primeiro ? `, ${primeiro}` : ''}! Aqui está o link para marcar a ${evento?.title ?? 'reunião'}: ${gerarState.url}`,
    );
  }, [gerarState?.url, evento?.title, leads]);

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-5">
      <form action={gerarAction} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tipo de reunião</span>
          <select className="input" name="eventTypeId" value={eventTypeId} onChange={(e) => onSelect(e.target.value)} disabled={gerando}>
            {eventTypes.map((eventType) => (
              <option key={eventType.id} value={eventType.id}>{eventType.title}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Vincular a um lead (opcional)</span>
          <select className="input" name="leadId" value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={gerando}>
            <option value="">Nenhum — link genérico</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.fullName} — {lead.phone}</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Com lead vinculado, a reserva já entra na ficha dele.</span>
        </label>

        <button className="btn-primary" disabled={gerando}>
          <Link2 className="h-4 w-4" /> {gerando ? 'Gerando…' : 'Gerar link'}
        </button>

        {gerarState?.ok && <span className="ml-2 text-sm text-success" role="status">{gerarState.ok}</span>}
        {gerarState?.error && <span className="ml-2 text-sm text-danger" role="alert">{gerarState.error}</span>}
      </form>

      {url && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-medium text-muted">Link público</p>
          <p className="mt-1 break-all text-sm">{url}</p>
          <button type="button" className="btn-outline mt-2" onClick={copiar}>
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copiado ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      )}

      <form action={waAction} className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium">Enviar no WhatsApp do lead</p>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Lead</span>
          <select className="input" name="leadId" value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={enviando}>
            <option value="">Escolha um lead</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.fullName} — {lead.phone}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Mensagem</span>
          <textarea
            className="input"
            name="message"
            rows={3}
            maxLength={1000}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder="Olá! Aqui está o link para marcar a reunião: ..."
            disabled={enviando}
          />
        </label>

        <button className="btn-outline" disabled={enviando || !leadId}>
          <MessageCircle className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Enviar link no WhatsApp'}
        </button>
        {waState?.ok && <span className="ml-2 text-sm text-success" role="status">{waState.ok}</span>}
        {waState?.error && <span className="ml-2 text-sm text-danger" role="alert">{waState.error}</span>}
      </form>

      {links.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium">Links recentes</p>
          <ul className="mt-2 space-y-2">
            {links.map((link) => (
              <li key={link.id} className="rounded-xl border border-border p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{link.eventTitle}</span>
                  <span className="text-muted">{formatDate(link.createdAt)}</span>
                </div>
                <p className="mt-0.5 break-all text-muted">{link.url}</p>
                <p className="mt-0.5 text-muted">
                  {link.leadName ? `Lead: ${link.leadName}` : 'Link genérico'} · {link.used ? 'usado' : 'ainda não usado'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- reservas */

function BookingRow({ booking }: { booking: AgendaBookingView }) {
  const [confirmState, confirmAction, confirming] = useActionState(confirmarReservaAction, undefined);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelarReservaAction, undefined);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {booking.who}
          <span className={`pill ${booking.status === 'confirmed' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
            {booking.status === 'confirmed' ? 'Confirmada' : 'Aguardando confirmação'}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted">{booking.when}</p>
        {booking.leadName && <p className="text-sm text-muted">Lead: {booking.leadName}</p>}
        {booking.contact && <p className="text-sm text-muted">{booking.contact}</p>}
        <p className="text-xs text-muted">{booking.source === 'agenda' ? 'Agendamento online' : 'Reserva registrada no app'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {booking.status === 'requested' && (
          <form action={confirmAction}>
            <input type="hidden" name="meetingId" value={booking.id} />
            <button className="btn-primary" disabled={confirming}>
              <Check className="h-4 w-4" /> {confirming ? 'Confirmando…' : 'Confirmar'}
            </button>
          </form>
        )}
        <form action={cancelAction}>
          <input type="hidden" name="meetingId" value={booking.id} />
          <button className="btn-danger" disabled={cancelling}>
            <X className="h-4 w-4" /> {cancelling ? 'Cancelando…' : 'Cancelar'}
          </button>
        </form>
        {(confirmState?.ok || confirmState?.error) && (
          <span className={`text-sm ${confirmState?.error ? 'text-danger' : 'text-success'}`} role="status">
            {confirmState?.error ?? confirmState?.ok}
          </span>
        )}
        {(cancelState?.ok || cancelState?.error) && (
          <span className={`text-sm ${cancelState?.error ? 'text-danger' : 'text-success'}`} role="status">
            {cancelState?.error ?? cancelState?.ok}
          </span>
        )}
      </div>
    </li>
  );
}

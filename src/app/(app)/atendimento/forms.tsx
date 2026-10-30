'use client';

import { useActionState, useTransition } from 'react';
import { Trash2, Power, Webhook, ScrollText } from 'lucide-react';
import {
  saveSlaPolicyAction, saveScheduleAction, saveWebhookAction,
  toggleWebhookAction, deleteWebhookAction,
} from '../actions';

type State = { error?: string; ok?: string } | undefined;

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function SlaForm({ policy, canEdit }: {
  policy: { firstResponseMinutes: number; resolutionMinutes: number; businessHoursOnly: boolean };
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveSlaPolicyAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Primeira resposta (minutos)</span>
          <input className="input w-full" type="number" name="firstResponseMinutes" min={5} max={43200}
            defaultValue={policy.firstResponseMinutes} disabled={!canEdit} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Resolução (minutos)</span>
          <input className="input w-full" type="number" name="resolutionMinutes" min={5} max={43200}
            defaultValue={policy.resolutionMinutes} disabled={!canEdit} required />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="businessHoursOnly" defaultChecked={policy.businessHoursOnly} disabled={!canEdit} />
        Contar o prazo apenas dentro do horário de atendimento
      </label>
      {canEdit && <button className="btn-primary" disabled={pending}>{pending ? 'Salvando…' : 'Salvar SLA'}</button>}
      {(state?.ok || state?.error) && <p className={`text-xs ${state?.error ? 'text-danger' : 'text-muted'}`} role="status">{state?.error ?? state?.ok}</p>}
    </form>
  );
}

export function ScheduleForm({ schedule, canEdit }: {
  schedule: {
    timezone: string; weekdays: number[]; openMinute: number; closeMinute: number;
    autoReplyEnabled: boolean; autoReplyMessage: string;
  };
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(saveScheduleAction, undefined);
  const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Fuso horário</span>
        <input className="input w-full" name="timezone" defaultValue={schedule.timezone} disabled={!canEdit} required />
      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Dias de atendimento</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((label, idx) => (
            <label key={label} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs">
              <input type="checkbox" name="weekdays" value={idx} defaultChecked={schedule.weekdays.includes(idx)} disabled={!canEdit} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Abre às</span>
          <input className="input w-full" type="time" name="openMinute" defaultValue={toHHMM(schedule.openMinute)} disabled={!canEdit} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Fecha às</span>
          <input className="input w-full" type="time" name="closeMinute" defaultValue={toHHMM(schedule.closeMinute)} disabled={!canEdit} required />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autoReplyEnabled" defaultChecked={schedule.autoReplyEnabled} disabled={!canEdit} />
        Responder automaticamente fora do horário
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Mensagem de auto-resposta</span>
        <textarea className="input w-full" name="autoReplyMessage" rows={3} maxLength={1000}
          defaultValue={schedule.autoReplyMessage} disabled={!canEdit}
          placeholder="Ex.: Recebemos sua mensagem! Respondemos no próximo horário útil." />
      </label>
      {canEdit && <button className="btn-primary" disabled={pending}>{pending ? 'Salvando…' : 'Salvar horário'}</button>}
      {(state?.ok || state?.error) && <p className={`text-xs ${state?.error ? 'text-danger' : 'text-muted'}`} role="status">{state?.error ?? state?.ok}</p>}
    </form>
  );
}

export function WebhookForm({ events, canEdit }: { events: string[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveWebhookAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">URL do parceiro</span>
        <input className="input w-full" name="url" type="url" placeholder="https://parceiro.com.br/hooks/prospectra" disabled={!canEdit} required />
      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Eventos assinados</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {events.map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="events" value={ev} disabled={!canEdit} /> {ev}
            </label>
          ))}
        </div>
      </fieldset>
      {canEdit && <button className="btn-primary" disabled={pending}>{pending ? 'Criando…' : 'Criar webhook'}</button>}
      {(state?.ok || state?.error) && <p className={`break-all text-xs ${state?.error ? 'text-danger' : 'text-muted'}`} role="status">{state?.error ?? state?.ok}</p>}
    </form>
  );
}

export function WebhookList({ webhooks, canEdit }: {
  webhooks: { id: string; url: string; events: string[]; active: boolean; secretPreview: string }[];
  canEdit: boolean;
}) {
  const [, start] = useTransition();
  if (webhooks.length === 0) return <p className="text-sm text-muted">Nenhum webhook cadastrado ainda.</p>;
  return (
    <ul className="space-y-3">
      {webhooks.map((w) => (
        <li key={w.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Webhook className="h-4 w-4 text-accent" />
            <span className="break-all text-sm font-medium">{w.url}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${w.active ? 'bg-surface-accent text-accent' : 'bg-surface text-muted'}`}>
              {w.active ? 'ativo' : 'pausado'}
            </span>
            {canEdit && (
              <span className="ml-auto flex gap-1">
                <button className="btn-ghost px-2 py-1" title={w.active ? 'Pausar' : 'Ativar'} onClick={() => start(async () => { await toggleWebhookAction(w.id); })}>
                  <Power className="h-4 w-4" />
                </button>
                <button className="btn-ghost px-2 py-1 hover:text-danger" title="Remover" onClick={() => start(async () => { await deleteWebhookAction(w.id); })}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{w.events.join(' · ')}</p>
          <p className="text-xs text-muted">Assinatura: {w.secretPreview}</p>
        </li>
      ))}
    </ul>
  );
}

export function AuditList({ entries }: { entries: { id: string; action: string; entity: string; createdAt: string }[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted">Nenhuma ação registrada ainda.</p>;
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center gap-2 text-sm">
          <ScrollText className="h-4 w-4 shrink-0 text-muted" />
          <span className="font-medium">{e.action}</span>
          <span className="truncate text-xs text-muted">{e.entity}</span>
          <span className="ml-auto shrink-0 text-xs text-muted">{new Date(e.createdAt).toLocaleString('pt-BR')}</span>
        </li>
      ))}
    </ul>
  );
}

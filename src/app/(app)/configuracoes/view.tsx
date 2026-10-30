'use client';

import { useActionState } from 'react';
import { FormMessage, Submit } from '@/components/form';
import type { SettingsState } from './actions';
import { saveSettingsAction } from './actions';

export type SettingsView = {
  senderEmail: string;
  atendimentoStart: string;
  atendimentoEnd: string;
  autoReply: string;
  features: Record<string, boolean>;
};

const FEATURES: { key: string; label: string; hint: string }[] = [
  { key: 'golinkedin', label: 'Go LinkedIn', hint: 'Conexão de conta e seleção em campanhas' },
  { key: 'whatsapp', label: 'WhatsApp', hint: 'Conexão AKG e comandos por WhatsApp' },
  { key: 'helpin', label: 'Helpin/Suporte', hint: 'Caixa de entrada compartilhada' },
  { key: 'inteligencia', label: 'Harvey/Inteligência', hint: 'Preparação das conversas' },
  { key: 'agenda', label: 'Agenda', hint: 'Reuniões, convites .ics e link público' },
  { key: 'documentos', label: 'Documentos', hint: 'Base de materiais da equipe' },
];

export function SettingsForm({ initial, canEdit }: { initial: SettingsView; canEdit: boolean }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveSettingsAction, undefined);
  return (
    <form action={action} className="grid max-w-3xl gap-5">
      <section className="card space-y-4 p-6">
        <h2 className="text-base font-semibold">E-mail e atendimento</h2>
        <div><label className="label" htmlFor="senderEmail">E-mail remetente (Office 365)</label>
          <input id="senderEmail" name="senderEmail" type="email" className="input" defaultValue={initial.senderEmail} disabled={!canEdit}
            placeholder="contato@suaempresa.com.br" />
          <p className="mt-1 text-xs text-muted">Usado como caixa de remetente dos e-mails da operação (convites da Agenda, avisos).</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="start">Horário de atendimento — início</label>
            <input id="start" name="atendimentoStart" type="time" className="input" defaultValue={initial.atendimentoStart} disabled={!canEdit} /></div>
          <div><label className="label" htmlFor="end">Horário de atendimento — fim</label>
            <input id="end" name="atendimentoEnd" type="time" className="input" defaultValue={initial.atendimentoEnd} disabled={!canEdit} /></div>
        </div>
        <div><label className="label" htmlFor="autoReply">Autorresposta simples (fora do horário)</label>
          <textarea id="autoReply" name="autoReply" rows={3} className="input" defaultValue={initial.autoReply} disabled={!canEdit}
            placeholder="Ex.: Fora do horário comercial — respondemos no próximo dia útil entre 9h e 18h." /></div>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="text-base font-semibold">Recursos ativados</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <label key={f.key} className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <input type="checkbox" name={`f.${f.key}`} defaultChecked={initial.features[f.key] ?? true} disabled={!canEdit} className="mt-1" />
              <span><strong>{f.label}</strong><br /><span className="text-xs text-muted">{f.hint}</span></span>
            </label>
          ))}
        </div>
      </section>

      {canEdit && <Submit className="btn-primary w-fit" pendingText="Salvando…">Salvar configurações</Submit>}
      {state && <FormMessage state={state} />}
    </form>
  );
}

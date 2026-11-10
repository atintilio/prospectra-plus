'use client';
import { useState, useTransition } from 'react';
import type { CampaignStep } from '@/db/schema';
import { findCampaignLeadsAction, previewCampaignAction } from './preview-action';

const labels: Record<CampaignStep['type'], string> = { invite: 'Convite LinkedIn', message: 'Mensagem LinkedIn', comment: 'Comentário LinkedIn', react: 'Reação LinkedIn', email: 'E-mail', whatsapp: 'WhatsApp', voice: 'Áudio', image: 'Imagem', call: 'Ligação' };

export function CampaignDraft({ campaignId, leads, steps, enabled }: { campaignId: string; leads: { id: string; fullName: string }[]; steps: CampaignStep[]; enabled: boolean }) {
  const choices = steps.map((step, index) => ({ step, index })).filter(({ step }) => step.type !== 'react');
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');
  const [options, setOptions] = useState(leads);
  const [search, setSearch] = useState('');
  const [stepIndex, setStepIndex] = useState(choices[0]?.index ?? 0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  return <section className="card mt-6 space-y-3 p-5" aria-label="Inteligência da campanha">
    <h2 className="font-semibold">Inteligência da campanha</h2>
    <p className="text-sm text-muted">Personalize a abordagem com o contexto do lead, as ofertas e o histórico da conversa.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">Buscar lead na campanha<input type="search" className="input mt-1" value={search} maxLength={80} disabled={pending} onChange={e => setSearch(e.target.value)} placeholder="Nome ou empresa" /></label>
      <button type="button" className="btn-outline" disabled={pending} onClick={() => start(async () => {
        setError(''); setDraft('');
        try { const found = await findCampaignLeadsAction(campaignId, search); setOptions(found); setLeadId(found[0]?.id ?? ''); }
        catch { setError('Não foi possível buscar os leads. Tente novamente.'); }
      })}>Buscar</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Lead inscrito<select className="input mt-1" value={leadId} onChange={e => { setLeadId(e.target.value); setDraft(''); setError(''); }} disabled={pending}>{options.map(l => <option key={l.id} value={l.id}>{l.fullName}</option>)}</select></label>
      <label className="text-sm">Etapa<select className="input mt-1" value={stepIndex} onChange={e => { setStepIndex(Number(e.target.value)); setDraft(''); setError(''); }} disabled={pending}>{choices.map(({ step, index }) => <option key={step.id} value={index}>{index + 1}. {labels[step.type]}</option>)}</select></label>
    </div>
    <button type="button" className="btn-primary" disabled={!enabled || !leadId || !choices.length || pending} onClick={() => start(async () => {
      setError(''); setDraft('');
      try { const result = await previewCampaignAction(campaignId, leadId, stepIndex); setDraft(result.draft ?? ''); setError(result.error ?? ''); }
      catch { setError('Não foi possível gerar a prévia. Tente novamente.'); }
    })}>{pending ? 'Gerando…' : 'Gerar prévia personalizada'}</button>
    {!options.length && <p className="text-sm text-muted">Nenhum lead encontrado. Inscreva leads nesta campanha ou ajuste a busca.</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {draft && <label className="block text-sm">Prévia — nenhuma mensagem foi enviada<textarea className="input mt-1" rows={6} value={draft} readOnly /></label>}
  </section>;
}

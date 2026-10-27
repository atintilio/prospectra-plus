'use client';

import { useState, useTransition } from 'react';
import { generateCommercialAction, type IntelligenceState } from './actions';

type Offer = { name: string; description: string };
export function IntelligenceView({ leads, sellerName: initialName, enabled, status, demo }: {
  leads: { id: string; fullName: string; company: string }[]; sellerName: string; enabled: boolean; status: string; demo: boolean;
}) {
  const [sellerName, setSellerName] = useState(initialName);
  const [leadId, setLeadId] = useState(leads[0]?.id || '');
  const [strategy, setStrategy] = useState('');
  const [offers, setOffers] = useState<Offer[]>([{ name: '', description: '' }]);
  const [inbound, setInbound] = useState('');
  const [approved, setApproved] = useState(false);
  const [state, setState] = useState<IntelligenceState>({});
  const [pending, startTransition] = useTransition();
  const editOffer = (index: number, key: keyof Offer, value: string) => { setApproved(false); setOffers(offers.map((o, i) => i === index ? { ...o, [key]: value } : o)); };
  return <div className="grid gap-6 lg:grid-cols-2">
    <form className="card space-y-4 p-5" onSubmit={(event) => {
      event.preventDefault(); setState({});
      startTransition(async () => {
        try { setState(await generateCommercialAction({ leadId, sellerName, strategy, offers, inbound, approved })); }
        catch { setState({ error: 'Sua sessão expirou ou houve uma falha. Atualize a página e tente novamente.' }); }
      });
    }}>
      <p className="text-sm text-muted">{status}{demo ? ' Ambiente de demonstração; nenhum contato será realizado.' : ''}</p>
      <label className="block text-sm">Lead da sua carteira<select className="input mt-1 w-full" value={leadId} onChange={e => { setLeadId(e.target.value); setState({}); }} required>
        {!leads.length && <option value="">Nenhum lead disponível na sua carteira</option>}
        {leads.map(l => <option key={l.id} value={l.id}>{l.fullName}{l.company ? ` · ${l.company}` : ''}</option>)}
      </select></label>
      <label className="block text-sm">Nome do vendedor<input className="input mt-1 w-full" value={sellerName} maxLength={100} required onChange={e => { setSellerName(e.target.value); setApproved(false); }} /></label>
      <label className="block text-sm">Estratégia e instruções aprovadas<textarea className="input mt-1 w-full" rows={4} minLength={5} maxLength={2000} required placeholder="Objetivo, público, tom e limites da conversa." value={strategy} onChange={e => { setStrategy(e.target.value); setApproved(false); }} /></label>
      <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold">Ofertas aprovadas</legend>
        {offers.map((offer, i) => <div key={i} className="space-y-2 rounded-xl border border-border p-3">
          <label className="block text-sm">Nome da oferta {i + 1}<input className="input mt-1 w-full" required maxLength={100} value={offer.name} onChange={e => editOffer(i, 'name', e.target.value)} /></label>
          <label className="block text-sm">Descrição que pode ser usada na mensagem<textarea className="input mt-1 w-full" rows={2} required minLength={5} maxLength={600} value={offer.description} onChange={e => editOffer(i, 'description', e.target.value)} /></label>
          {offers.length > 1 && <button type="button" className="text-sm text-danger" onClick={() => { setOffers(offers.filter((_, n) => n !== i)); setApproved(false); }}>Remover oferta</button>}
        </div>)}
        {offers.length < 8 && <button className="btn-outline" type="button" onClick={() => { setOffers([...offers, { name: '', description: '' }]); setApproved(false); }}>Adicionar oferta</button>}
      </fieldset>
      <label className="block text-sm">Resposta recebida ou dúvida do lead (opcional)<textarea className="input mt-1 w-full" rows={3} maxLength={3000} value={inbound} onChange={e => setInbound(e.target.value)} /></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={approved} required onChange={e => setApproved(e.target.checked)} />Confirmo que a identidade, as instruções e as ofertas estão aprovadas. Revisarei o rascunho antes de usar.</label>
      <button className="btn-primary" disabled={!enabled || !leadId || !approved || pending}>{pending ? 'Preparando conversa…' : 'Gerar rascunho e análise'}</button>
      <p className="text-xs text-muted">O contexto e o resultado ficam nas notas do lead. A resposta recebida é usada na análise e não é copiada integralmente para as notas.</p>
    </form>
    <section className="card space-y-5 p-5" aria-live="polite" aria-busy={pending}>
      <h2 className="font-semibold">Preparação da conversa</h2>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {!state.result && <p className="text-sm text-muted">Escolha um lead, descreva a estratégia e cadastre as ofertas. O rascunho usará dados disponíveis e texto aprovado.</p>}
      {state.result && <>
        <div><h3 className="mb-2 text-sm font-semibold">Rascunho para revisão · {state.result.offer}</h3><p className="whitespace-pre-wrap rounded-xl bg-surface p-4 text-sm">{state.result.draft || 'Contato interrompido: pedido de não receber mensagens.'}</p></div>
        <div><h3 className="text-sm font-semibold">Evidências usadas</h3>{state.result.insights.length ? <ul className="mt-2 space-y-2 text-sm">{state.result.insights.map((insight, i) => <li key={i}>“{insight.quote}” <span className="text-muted">({insight.field === 'company' ? 'empresa' : insight.field === 'headline' ? 'cargo' : 'resposta recebida'})</span></li>)}</ul> : <p className="text-sm text-muted">Sem evidências adicionais fornecidas pelo modelo.</p>}</div>
        {state.result.handoff && <div className="rounded-xl border border-border p-4 text-sm"><h3 className="mb-2 font-semibold">Encaminhamento para revisão humana</h3><p>{state.result.handoff.summary}</p><p className="mt-2 break-all">Responsáveis sugeridos: {state.result.handoff.recipients.join(', ')}</p><p className="mt-2">{state.result.handoff.nextStep}</p><p className="mt-2 text-muted">{state.saved?'Cadência automática deste lead interrompida. Encaminhamento registrado para consulta.':'Não foi possível registrar o encaminhamento.'} Nenhum e-mail ou mensagem foi enviado.</p></div>}
        <p className="text-xs text-muted">{state.saved ? 'Contexto e preparação salvos nas notas do lead.' : 'Preparação não salva.'} Revisão humana obrigatória antes de qualquer envio.</p>
      </>}
    </section>
  </div>;
}

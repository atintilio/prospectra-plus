import './crm-panel.css';
import { useEffect, useState } from 'react';
import type { Account, ProspectraState } from '../types';
import { openCRM, saveCRM, addCustomField, setCustomValue, reviewProposal, validateExtension, type UnifiedCRM } from './merge';

export default function CRMPanel({ state, account, writable, onChange }: { state: ProspectraState; account: Account; writable: boolean; onChange: (state: ProspectraState) => void }) {
  const crm = openCRM(state);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'text' | 'number' | 'boolean'>('text');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ contactId: '', field: 'role' as 'role' | 'email' | 'phone' | 'linkedin', value: '', sourceUrl: '', evidence: '' });
  useEffect(() => { setDraft({ contactId: '', field: 'role', value: '', sourceUrl: '', evidence: '' }); setError(''); }, [account.id]);
  const fieldLabels = { role: 'Cargo', email: 'Email', phone: 'Telefone profissional', linkedin: 'LinkedIn' };
  const statusLabels = { proposed: 'Aguardando revisão', applied: 'Aplicada', dismissed: 'Descartada' };
  function apply(change: (value: UnifiedCRM) => UnifiedCRM) {
    if (!writable) return;
    try { const next = saveCRM(change(openCRM(state))); validateExtension(next); onChange(next); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar'); }
  }
  const proposals = crm.proposals.filter(p => account.contacts.some(c => c.id === p.contactId));
  return <section className="panel crm-extension" aria-label="Personalização e qualidade dos dados">
    <div className="panel-head"><h2>Personalização e qualidade dos dados</h2></div>
    {!writable && <p>Consulta disponível. A edição exige acesso de administrador e workspace sincronizado.</p>}
    {error && <p role="alert">{error}</p>}
    <h3>Campos da empresa</h3>
    {crm.fields.filter(f => f.entity === 'account').map(f => <label key={f.id}>{f.label}
      <input disabled={!writable} type={f.type === 'number' ? 'number' : f.type === 'boolean' ? 'checkbox' : 'text'}
      checked={f.type === 'boolean' ? Boolean(crm.values[account.id]?.[f.id]) : undefined}
      value={f.type === 'boolean' ? undefined : String(crm.values[account.id]?.[f.id] ?? '')}
      onChange={e => { const value = f.type === 'boolean' ? e.target.checked : f.type === 'number' ? e.target.value === '' ? null : Number(e.target.value) : e.target.value; apply(c => setCustomValue(c, f.id, account.id, value)); }} />
    </label>)}
    {!crm.fields.length && <p>Nenhum campo personalizado criado.</p>}
    <form onSubmit={e => { e.preventDefault(); apply(c => addCustomField(c, { id: crypto.randomUUID(), label: label.trim(), entity: 'account', type })); }}>
      <label>Nome do campo<input disabled={!writable} required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} /></label>
      <label>Tipo<select disabled={!writable} value={type} onChange={e => setType(e.target.value as typeof type)}><option value="text">Texto</option><option value="number">Número</option><option value="boolean">Sim ou não</option></select></label>
      <button className="outline-button" disabled={!writable}>Criar campo</button>
    </form>
    <h3>Propostas de enriquecimento</h3>
    <p>Registre o que encontrou e sua fonte. A sugestão só altera o contato após revisão.</p>
    {account.contacts.length > 0 && <form onSubmit={e => { e.preventDefault(); apply(c => ({ ...c, proposals: [...c.proposals, { ...draft, id: crypto.randomUUID(), observedAt: new Date().toISOString(), status: 'proposed' }] })); }}>
      <label>Contato<select required disabled={!writable} value={draft.contactId} onChange={e => setDraft({ ...draft, contactId: e.target.value })}><option value="">Selecione</option>{account.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Informação<select disabled={!writable} value={draft.field} onChange={e => setDraft({ ...draft, field: e.target.value as typeof draft.field })}><option value="role">Cargo</option><option value="email">Email</option><option value="phone">Telefone profissional</option><option value="linkedin">LinkedIn</option></select></label>
      <label>Valor encontrado<input required disabled={!writable} value={draft.value} onChange={e => setDraft({ ...draft, value: e.target.value })}/></label>
      <label>URL da fonte<input type="url" required disabled={!writable} value={draft.sourceUrl} onChange={e => setDraft({ ...draft, sourceUrl: e.target.value })}/></label>
      <label>Evidência<textarea required disabled={!writable} value={draft.evidence} onChange={e => setDraft({ ...draft, evidence: e.target.value })}/></label>
      <button className="outline-button" disabled={!writable}>Salvar proposta</button>
    </form>}
    {proposals.length === 0 && <p>Nenhuma proposta para os contatos desta conta.</p>}
    {proposals.map(p => <article key={p.id}><strong>{fieldLabels[p.field]}: {p.value}</strong><p>{p.evidence}</p><small>{new Date(p.observedAt).toLocaleString('pt-BR')} · {statusLabels[p.status]}</small>{/^https?:\/\//i.test(p.sourceUrl) && <p><a href={p.sourceUrl} target="_blank" rel="noreferrer">Consultar fonte</a></p>}{p.status === 'proposed' && <div><button disabled={!writable} onClick={() => apply(c => reviewProposal(c, p.id, 'applied'))}>Aplicar após revisão</button><button disabled={!writable} onClick={() => apply(c => reviewProposal(c, p.id, 'dismissed'))}>Descartar</button></div>}</article>)}
    <h3>Histórico dos canais</h3>
    {crm.events.filter(e => e.accountId === account.id).map(e => <p key={`${e.provider}:${e.providerEventId}`}>{e.channel} · {e.kind} · {e.occurredAt}</p>)}
    {!crm.events.some(e => e.accountId === account.id) && <p>Nenhum evento registrado para esta conta.</p>}
  </section>;
}

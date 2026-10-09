import { useMemo, useState } from 'react';
import './campaign-library.css';
import { Plus, Search } from 'lucide-react';
import type { Account, Campaign } from './types';
import type { CampaignDraft } from './campaigns';

export default function CampaignLibrary({ campaigns, accounts, selectedId, writable, onSelect, onCreate }: {
  campaigns: Campaign[]; accounts: Account[]; selectedId: string; writable: boolean;
  onSelect: (id: string) => void; onCreate: (draft: CampaignDraft) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [icp, setIcp] = useState('');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [accountQuery, setAccountQuery] = useState('');
  const eligible = accounts.filter((account) => !account.paused && !account.suppressed);
  const eligibleIds = new Set(eligible.map((account) => account.id));
  const selectedAccounts = accountIds.filter((id) => eligibleIds.has(id));
  const visible = useMemo(() => campaigns.filter((campaign) => `${campaign.name} ${campaign.icp}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))), [campaigns, query]);
  const resetForm = () => { setCreating(false); setName(''); setIcp(''); setAccountIds([]); setAccountQuery(''); };
  return <section className="panel campaign-library" aria-label="Biblioteca de campanhas">
    <div className="panel-head"><div><span className="eyebrow">SUA PROSPECÇÃO</span><h2>Campanhas</h2></div><button className="new-button" disabled={!writable} onClick={() => setCreating((value) => !value)} aria-expanded={creating}><Plus size={16}/>{creating ? 'Fechar criação' : 'Nova campanha'}</button></div>
    {!writable && <p className="campaign-library-hint">A criação exige acesso de administrador e workspace sincronizado.</p>}
    <label className="campaign-library-search"><Search size={16}/><span className="sr-only">Buscar campanhas</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pelo nome ou público" /></label>
    <div className="campaign-library-list">{visible.map((campaign) => <button key={campaign.id} className={`campaign-library-item ${campaign.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(campaign.id)} aria-pressed={campaign.id === selectedId}><strong>{campaign.name}</strong><span>{campaign.icp}</span><small>{campaign.accounts.length} contas · {campaign.tasks.length} ações · {campaign.status}</small></button>)}</div>
    {!visible.length && <p className="campaign-library-hint">{campaigns.length ? 'Nenhuma campanha corresponde à busca.' : 'Crie a primeira campanha usando contas do CRM.'}</p>}
    {creating && <form className="campaign-draft-form" onSubmit={(event) => { event.preventDefault(); if (!writable || !selectedAccounts.length) return; onCreate({ name, icp, accountIds: selectedAccounts }); resetForm(); }}>
      <h3>Preparar uma campanha</h3><p>Selecione contas e defina o público. O texto e as ações serão revisados na próxima etapa.</p>
      <label>Nome da campanha<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
      <label>Público e objetivo<textarea required maxLength={500} value={icp} onChange={(event) => setIcp(event.target.value)} /></label>
      <fieldset><legend>Contas do CRM · {selectedAccounts.length} selecionadas</legend><label>Filtrar contas<input value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} placeholder="Nome ou setor" /></label>
        <div className="campaign-account-options">{eligible.filter((account) => `${account.name} ${account.sector}`.toLocaleLowerCase('pt-BR').includes(accountQuery.toLocaleLowerCase('pt-BR'))).map((account) => <label key={account.id}><input type="checkbox" checked={selectedAccounts.includes(account.id)} onChange={(event) => setAccountIds((current) => event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id))}/><span><strong>{account.name}</strong><small>{account.sector}</small></span></label>)}</div>
        {!eligible.length && <p>Não há contas disponíveis. Cadastre ou importe contas no CRM; contas pausadas ou com oposição não entram em novas campanhas.</p>}
      </fieldset>
      <div className="campaign-draft-actions"><button className="outline-button" type="button" onClick={resetForm}>Cancelar</button><button className="new-button" disabled={!writable || !name.trim() || !icp.trim() || !selectedAccounts.length} type="submit">Criar em revisão</button></div>
    </form>}
  </section>;
}

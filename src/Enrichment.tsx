import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FileSearch, LoaderCircle, Search, ShieldCheck, Sparkles } from 'lucide-react';
import BulkEnrichment, { type BulkSourceRow, type BatchAppliedResult } from './BulkEnrichment';
import type { Account } from './types';
import type { CompanyExtraction, ContactCandidate, PeopleDiscovery } from './enrichment-model';

type Health = { configured: boolean; status: string; remainingCredits?: number | null };
type Research = { kind: 'page'; value: CompanyExtraction } | { kind: 'people'; value: PeopleDiscovery };
function readableError(payload: Record<string, unknown>, status: number): string {
  if (status === 401) return 'Sua sessão expirou. Entre novamente no Prospectra.';
  if (status === 402 || payload.providerStatus === 402) return 'Saldo do ScrapeGraphAI insuficiente. A consulta não foi salva como resultado.';
  if (payload.providerStatus === 401 || payload.providerStatus === 403) return 'A chave ScrapeGraphAI foi rejeitada pelo provedor. Verifique-a no Vercel.';
  if (payload.error === 'invalid_public_url' || payload.error === 'invalid_company_or_domain') return 'Use uma URL pública e um domínio de empresa válido.';
  if (payload.error === 'scrapegraph_timeout') return 'O provedor excedeu o tempo de resposta. Tente outra página pública.';
  if (payload.error === 'scrapegraph_empty_result') return 'A página não trouxe dados estruturados úteis. Tente a página Equipe ou Contato.';
  if (payload.error === 'scrapegraph_not_configured') return 'A chave ScrapeGraphAI não está configurada.';
  return `A pesquisa falhou (HTTP ${status}). Nada foi salvo. Tente outra fonte ou verifique a integração.`;
}
function safeLink(url: string): string {
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : ''; } catch { return ''; }
}

export default function Enrichment({ selected, writable, onApply, onImportRows, onApplyBatch }: {
  selected: Account;
  writable: boolean;
  onApply: (accountId: string, result: CompanyExtraction | PeopleDiscovery, contacts: ContactCandidate[]) => void;
  onImportRows: (rows: BulkSourceRow[]) => void;
  onApplyBatch: (results: BatchAppliedResult[]) => void;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [url, setUrl] = useState(`https://${selected.domain}`);
  const [running, setRunning] = useState<'page' | 'people' | null>(null);
  const [research, setResearch] = useState<Research | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setUrl(selected.domain ? `https://${selected.domain}` : ''); setResearch(null); setSelectedContacts([]); setError(''); setSaved(false); }, [selected.id, selected.domain]);
  const refreshHealth = async () => {
    try {
      const response = await fetch('/api/integrations/scrapegraph/health', { credentials: 'include' });
      if (!response.ok) throw new Error('health_failed');
      const payload = await response.json() as Health;
      setHealth(payload);
    } catch { setHealth({ configured: false, status: 'unavailable' }); }
  };
  useEffect(() => { void refreshHealth(); }, []);
  const connected = health?.status === 'connected';
  const healthLabel = !health ? 'Verificando provedor…' : health.status === 'connected' ? `Conectado · ${health.remainingCredits ?? '?'} créditos` : health.status === 'insufficient_credits' ? 'Sem créditos disponíveis' : health.status === 'awaiting_api_key' ? 'Chave pendente' : health.status === 'invalid_key' ? 'Chave rejeitada' : 'Provedor indisponível';
  const run = async (kind: 'page' | 'people') => {
    setRunning(kind); setError(''); setResearch(null); setSaved(false);
    try {
      const endpoint = kind === 'page' ? '/api/integrations/scrapegraph/enrich' : '/api/integrations/scrapegraph/discover';
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'page' ? { url: /^https?:\/\//i.test(url) ? url : `https://${url}` } : { company: selected.name, domain: selected.domain }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) { setError(readableError(payload, response.status)); return; }
      const value = kind === 'page' ? payload.extraction as CompanyExtraction : payload.discovery as PeopleDiscovery;
      if (!value || !Array.isArray(value.contacts)) { setError('Resposta do provedor incompleta. Nada foi salvo.'); return; }
      setResearch(kind === 'page' ? { kind: 'page', value: value as CompanyExtraction } : { kind: 'people', value: value as PeopleDiscovery }); setSelectedContacts([]);
      await refreshHealth();
    } catch { setError('Não foi possível consultar o provedor. Nada foi salvo.'); }
    finally { setRunning(null); }
  };
  const contacts = research?.value.contacts ?? [];
  const sourcePages = research?.kind === 'people' ? research.value.pages : research?.kind === 'page' ? [{ url: research.value.sourceUrl, title: 'Página analisada', excerpt: '' }] : [];
  const data = research?.kind === 'page' ? research.value.data : {};
  const save = () => {
    if (!research || !writable || saved) return;
    const chosen = selectedContacts.map((index) => contacts[index]).filter(Boolean);
    if (!chosen.length && !('data' in research.value && (research.value.data.description || research.value.data.sector || research.value.data.employees))) {
      setError('Selecione ao menos uma pessoa ou pesquise uma página com contexto empresarial para salvar.'); return;
    }
    onApply(selected.id, research.value, chosen); setSaved(true);
  };
  return <>
    <div className="section-title"><div><p className="eyebrow">CONTEXTO ANTES DO CONTATO</p><h1>Descubra a empresa e as pessoas certas.</h1><p>Dados prontos entram gratuitamente. Pesquisa pública é opcional, usa créditos e só vira contato após sua revisão.</p></div><span className={`integration-state ${connected ? 'ready' : ''}`}><span></span>{healthLabel}</span></div>
    {!writable && <div className="owner-feedback error"><AlertTriangle size={16}/>A pesquisa pode ser consultada, mas a gravação no CRM depende do Owner e do workspace sincronizado.</div>}
    {error && <div className="owner-feedback error"><AlertTriangle size={16}/>{error}</div>}
    <div className="enrichment-grid"><section className="panel enrich-form"><span className="eyebrow">PESQUISA DIRIGIDA · OPT-IN</span><h2>{selected.name}</h2><p>Primeiro analise a página da empresa. Para identificar pessoas, use a busca pública adicional, que pesquisa fontes indexadas e devolve URLs revisáveis.</p>
      <label>Site, página Equipe ou página Contato<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://empresa.com.br/equipe" /></label>
      <div className="enrich-actions"><button className="new-button" disabled={!writable || !connected || Boolean(running) || !url.trim()} onClick={() => void run('page')}>{running === 'page' ? <LoaderCircle className="spin" size={16}/> : <FileSearch size={16}/>} Analisar página · ~5 créditos</button><button className="outline-button" disabled={!writable || !connected || Boolean(running) || !selected.domain} onClick={() => void run('people')}>{running === 'people' ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} Descobrir pessoas · até 25 créditos</button></div>
      <small><ShieldCheck size={14}/> Nenhuma busca acontece ao abrir esta tela. Telefones e perfis só aparecem se constarem em fonte pública; não há opt-in presumido para mensagens.</small><button className="text-button" onClick={() => void refreshHealth()}>Atualizar status do provedor</button>
    </section><section className="panel extraction-preview"><div className="panel-head"><div><span className="eyebrow">RESULTADO REVISÁVEL</span><h2>{research ? 'Fontes e dados encontrados' : 'O que a pesquisa entrega'}</h2></div><Sparkles size={19}/></div>
      {research ? <div className="enrich-review"><p><strong>Empresa:</strong> {typeof data.companyName === 'string' ? data.companyName : selected.name} · <strong>Setor:</strong> {typeof data.sector === 'string' && data.sector ? data.sector : 'não identificado'}</p>{typeof data.description === 'string' && data.description && <p>{data.description}</p>}<p>{contacts.length} pessoa(s) sugerida(s) · {sourcePages.length} fonte(s) · request {research.value.requestId ?? 'n/d'}</p><div className="enrich-sources">{sourcePages.map((page) => <a href={safeLink(page.url)} target="_blank" rel="noreferrer" key={page.url}><ExternalLink size={13}/>{page.title || page.url}</a>)}</div></div> : <div className="enrich-review"><p>Nome e contexto empresarial, sinais publicados, pessoas, cargo, telefone profissional, e-mail e URL LinkedIn quando publicados. Cada pessoa tem origem e começa como <strong>“A revisar”</strong>.</p><p>Se o dado não existir na fonte, será exibido como <strong>não encontrado</strong> — sem preenchimento inventado.</p></div>}
    </section></div>
    {research && <section className="panel enrichment-people"><div className="panel-head"><div><span className="eyebrow">PESSOAS E PROVENIÊNCIA</span><h2>{contacts.length ? `${contacts.length} pessoa(s) para revisar` : 'Nenhuma pessoa encontrada'}</h2></div><span className="status-tag neutral">{selectedContacts.length} selecionada(s)</span></div><div className="enrich-people-list">{contacts.map((contact, index) => <label className="enrich-person" key={`${contact.name}-${contact.sourceUrl}-${index}`}><input type="checkbox" checked={selectedContacts.includes(index)} onChange={(event) => setSelectedContacts((current) => event.target.checked ? [...current, index] : current.filter((item) => item !== index))} /><span><strong>{contact.name}</strong><small>{contact.role || 'Cargo não informado'}</small><small>Telefone: {contact.phone || 'não encontrado'} · E-mail: {contact.email || 'não encontrado'}</small><small>LinkedIn: {contact.linkedin ? <a href={safeLink(contact.linkedin)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Abrir perfil público ↗</a> : 'não encontrado'}</small>{(contact.sourceUrls?.length ? contact.sourceUrls : [contact.sourceUrl]).map((source) => <small key={source}>Fonte: <a href={safeLink(source)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{source}</a></small>)}</span></label>)}</div><div className="enrich-save"><span>{saved ? <><CheckCircle2 size={15}/> Adicionado ao CRM como não verificado; sincronização em andamento.</> : 'Nada será salvo até você confirmar.'}</span><button className="new-button" disabled={!writable || saved} onClick={save}>Adicionar selecionados ao CRM</button></div></section>}
    <BulkEnrichment providerConfigured={connected} writable={writable} onImportRows={onImportRows} onApplyBatch={onApplyBatch} />
  </>;
}

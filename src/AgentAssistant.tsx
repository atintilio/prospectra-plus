import { useEffect, useMemo, useState } from 'react';
import { Bot, Copy, LoaderCircle, Sparkles } from 'lucide-react';
import { apiFetch } from './apiFetch';
import type { Account, Campaign } from './types';
import './agent-assistant.css';

type Plan = {
  accountId: string;
  contactId: string | null;
  model: string;
  insights: string[];
  draft: string;
  nextAction: string;
  rationale: string;
  evidenceIds: string[];
  blockers: string[];
  readyForReview: boolean;
};

const errors: Record<string, string> = {
  ai_not_configured: 'A chave do OpenRouter ainda não foi configurada no servidor.',
  ai_free_limit_reached: 'O limite gratuito do OpenRouter foi atingido. Tente novamente mais tarde.',
  ai_timeout: 'O modelo gratuito demorou demais. Tente novamente.',
  ai_provider_unavailable: 'O modelo gratuito está indisponível no momento.',
  ai_invalid_response: 'O modelo não devolveu uma resposta válida. Tente novamente.',
  account_not_found: 'Esta conta não está disponível para seu usuário.',
};

export default function AgentAssistant({ accounts, campaigns, initialAccountId, writable, onApplyDraft, onCreateTask }: {
  accounts: Account[];
  campaigns: Campaign[];
  initialAccountId?: string;
  writable: boolean;
  onApplyDraft: (campaignId: string, draft: string) => void;
  onCreateTask: (campaignId: string, accountId: string, contactId: string, evidenceIds: string[]) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [accountId, setAccountId] = useState(initialAccountId ?? accounts[0]?.id ?? '');
  const [contactId, setContactId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const account = accounts.find((item) => item.id === accountId);
  const eligibleCampaigns = useMemo(() => campaigns.filter((item) => item.accounts.includes(accountId)), [campaigns, accountId]);

  useEffect(() => {
    let alive = true;
    void apiFetch('/api/ai/assist', { credentials: 'include' }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (alive) setConfigured(response.ok && body.configured === true);
    }).catch(() => { if (alive) setConfigured(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    setAccountId((current) => accounts.some((item) => item.id === current) ? current : initialAccountId ?? accounts[0]?.id ?? '');
  }, [initialAccountId, accounts]);
  useEffect(() => {
    setContactId(account?.contacts.find((item) => item.status === 'Revisado')?.id ?? account?.contacts[0]?.id ?? '');
    setCampaignId(eligibleCampaigns[0]?.id ?? '');
    setPlan(null);
  }, [accountId]);

  async function generate() {
    if (!accountId || loading) return;
    setLoading(true); setError(''); setPlan(null);
    try {
      const response = await apiFetch('/api/ai/assist', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, contactId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.error ?? 'ai_assist_failed'));
      setPlan(body as Plan);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setError(errors[code] ?? 'Não foi possível gerar a análise agora.');
    } finally { setLoading(false); }
  }

  return <section className="panel ai-assistant" aria-labelledby="ai-assistant-title">
    <div className="panel-head"><div><span className="eyebrow">AGENTE DE IA · FLUXO ASSISTIDO</span><h2 id="ai-assistant-title">Insights, texto e próxima ação</h2></div><span className={`status-tag ${configured ? 'good' : 'neutral'}`}>{configured === null ? 'Verificando' : configured ? 'Modelo gratuito pronto' : 'Chave pendente'}</span></div>
    <p>O agente usa dados da conta e evidências verificadas. Ele sugere uma abordagem; você revisa e executa o contato no seu próprio LinkedIn.</p>
    <div className="ai-assistant-controls">
      <label>Empresa<select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={!accounts.length}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Pessoa<select value={contactId} onChange={(event) => { setContactId(event.target.value); setPlan(null); }} disabled={!account?.contacts.length}><option value="">Sem contato selecionado</option>{account?.contacts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>
      <button className="new-button" disabled={!configured || !accountId || loading} onClick={() => void generate()}>{loading ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>} {loading ? 'Analisando…' : 'Gerar análise'}</button>
    </div>
    {!accounts.length && <p className="ai-assistant-note">Cadastre ou importe uma empresa para começar.</p>}
    {configured === false && <p className="ai-assistant-note">Configure <code>OPENROUTER_API_KEY</code> no servidor. O navegador nunca recebe a chave.</p>}
    {error && <p className="ai-assistant-error" role="alert">{error}</p>}
    {plan && <div className="ai-assistant-result">
      <div><strong><Bot size={16}/> Insights</strong><ul>{plan.insights.length ? plan.insights.map((item, index) => <li key={index}>{item}</li>) : <li>Sem insight suficiente nos dados disponíveis.</li>}</ul></div>
      <div><strong>Próxima ação sugerida</strong><p>{plan.nextAction}</p>{plan.rationale && <small>{plan.rationale}</small>}</div>
      {plan.blockers.length > 0 && <div className="ai-assistant-blockers"><strong>Antes do contato</strong><ul>{plan.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {plan.draft && <div><strong>Mensagem sugerida para LinkedIn</strong><div className="ai-assistant-draft">{plan.draft}</div><div className="ai-assistant-actions"><button className="outline-button" onClick={() => void navigator.clipboard.writeText(plan.draft)}><Copy size={16}/> Copiar texto</button><select aria-label="Campanha para receber o rascunho" value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">Selecione uma campanha</option>{eligibleCampaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="new-button" disabled={!writable || !campaignId || !plan.readyForReview || plan.accountId !== accountId || plan.contactId !== (contactId || null)} onClick={() => onApplyDraft(campaignId, plan.draft)}>Usar como rascunho</button><button className="outline-button" disabled={!writable || !campaignId || !plan.contactId || eligibleCampaigns.find((item) => item.id === campaignId)?.copy.state !== 'Aprovado' || eligibleCampaigns.find((item) => item.id === campaignId)?.copy.text !== plan.draft} onClick={() => onCreateTask(campaignId, plan.accountId, plan.contactId!, plan.evidenceIds)}>Criar tarefa assistida</button></div><small>Para criar a tarefa, revise e aprove o texto na campanha.</small></div>}
      <small>Gerado por {plan.model}. Nenhuma mensagem foi enviada. Aprovação anterior da campanha é invalidada ao usar um novo rascunho.</small>
    </div>}
  </section>;
}

'use client';

import { ExternalLink, FileUp, Megaphone, Plus, Search, Sparkles, Trash2, UserSearch, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import { addLeadAction, addSearchResultsAction, aiSearchAction, type SimLead, deleteLeadsAction, enrollAction, importLeadsAction, updateLeadStageAction } from '../actions';
import type { SearchPlan } from '@/lib/ai';
import { FormMessage, Submit } from '@/components/form';
import { Avatar, Empty, STAGE_LABEL, StagePill } from '@/components/ui';

type Lead = { id: string; fullName: string; headline: string; company: string; location: string; linkedinUrl: string; stage: string; tag: string; source: string; createdAt: string };

export function LeadsView({ leads, total, page, tags, campaigns, filters, aiOn, credits }: {
  leads: Lead[]; total: number; page: number; tags: string[]; campaigns: { id: string; name: string; status: string }[];
  filters: { q: string; etapa: string; tag: string }; aiOn: boolean; credits: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [panel, setPanel] = useState<null | 'ai' | 'import' | 'add'>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>();

  const setParam = (k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    p.delete('p');
    router.push(`/leads?${p.toString()}`);
  };
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => setPanel(panel === 'ai' ? null : 'ai')}><Sparkles className="h-4 w-4" /> Busca com IA</button>
        <button className="btn-outline" onClick={() => setPanel(panel === 'import' ? null : 'import')}><FileUp className="h-4 w-4" /> Importar</button>
        <button className="btn-outline" onClick={() => setPanel(panel === 'add' ? null : 'add')}><Plus className="h-4 w-4" /> Adicionar</button>
      </div>

      {panel === 'ai' && <AiSearch aiOn={aiOn} credits={credits} onClose={() => setPanel(null)} />}
      {panel === 'import' && <ImportPanel onClose={() => setPanel(null)} />}
      {panel === 'add' && <AddPanel onClose={() => setPanel(null)} />}

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <form className="relative min-w-[220px] flex-1" onSubmit={(e) => { e.preventDefault(); setParam('q', String(new FormData(e.currentTarget).get('q') ?? '')); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={filters.q} placeholder="Buscar por nome, cargo ou empresa" className="input pl-9" />
          </form>
          <select className="input w-auto" value={filters.etapa} onChange={(e) => setParam('etapa', e.target.value)} aria-label="Etapa">
            <option value="">Todas as etapas</option>
            {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {tags.length > 0 && (
            <select className="input w-auto" value={filters.tag} onChange={(e) => setParam('tag', e.target.value)} aria-label="Lista">
              <option value="">Todas as listas</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-accent px-4 py-2.5 text-sm">
            <strong>{selected.length} selecionado(s)</strong>
            {campaigns.length > 0 && (
              <select className="input w-auto py-1.5" defaultValue="" disabled={pending} aria-label="Inscrever em campanha"
                onChange={(e) => {
                  const id = e.target.value; if (!id) return;
                  start(async () => { setMsg(await enrollAction(id, { leadIds: selected })); setSelected([]); router.refresh(); });
                }}>
                <option value="">Inscrever em campanha…</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== 'active' ? ' (inativa)' : ''}</option>)}
              </select>
            )}
            <button className="btn-danger py-1.5" disabled={pending} onClick={() => {
              if (!confirm(`Excluir ${selected.length} lead(s)? Isso apaga o histórico deles.`)) return;
              start(async () => { await deleteLeadsAction(selected); setSelected([]); router.refresh(); });
            }}><Trash2 className="h-4 w-4" /> Excluir</button>
            <button className="btn-ghost ml-auto py-1.5" onClick={() => setSelected([])}>Limpar</button>
          </div>
        )}
        {msg && <div className="px-4 pt-3"><FormMessage state={msg} /></div>}

        {leads.length === 0 ? (
          <div className="p-6"><Empty icon={UserSearch} title="Nenhum lead por aqui" text="Use a busca com IA, importe a exportação do Sales Navigator ou cole links de perfis." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-surface/60">
                <tr>
                  <th className="th w-10"><input type="checkbox" aria-label="Selecionar todos" checked={selected.length === leads.length}
                    onChange={(e) => setSelected(e.target.checked ? leads.map((l) => l.id) : [])} /></th>
                  <th className="th">Nome</th><th className="th">Empresa</th><th className="th">Lista</th><th className="th">Etapa</th><th className="th">Entrou em</th><th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-surface/50">
                    <td className="td"><input type="checkbox" aria-label={`Selecionar ${l.fullName}`} checked={selected.includes(l.id)} onChange={() => toggle(l.id)} /></td>
                    <td className="td"><div className="flex items-center gap-3"><Avatar name={l.fullName} />
                      <div className="min-w-0"><p className="font-medium">{l.fullName}</p><p className="max-w-[260px] truncate text-xs text-muted">{l.headline || '—'}</p></div></div></td>
                    <td className="td">{l.company || <span className="text-muted">—</span>}</td>
                    <td className="td">{l.tag ? <span className="pill bg-violet-soft text-violet">{l.tag}</span> : <span className="text-muted">—</span>}</td>
                    <td className="td"><StageMenu lead={l} /></td>
                    <td className="td text-muted">{new Date(l.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="td text-right"><a href={l.linkedinUrl} target="_blank" rel="noopener" className="btn-ghost px-2 py-1" aria-label="Abrir no LinkedIn"><ExternalLink className="h-4 w-4" /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 50 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
            <span>Página {page} de {Math.ceil(total / 50)}</span>
            <div className="flex gap-2">
              <button className="btn-outline py-1.5" disabled={page <= 1} onClick={() => { const p = new URLSearchParams(sp.toString()); p.set('p', String(page - 1)); router.push(`/leads?${p}`); }}>Anterior</button>
              <button className="btn-outline py-1.5" disabled={page * 50 >= total} onClick={() => { const p = new URLSearchParams(sp.toString()); p.set('p', String(page + 1)); router.push(`/leads?${p}`); }}>Próxima</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StageMenu({ lead }: { lead: Lead }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const options = [['accepted', 'Aceitou convite'], ['replied', 'Respondeu'], ['meeting', 'Reunião marcada'], ['won', 'Venda'], ['lost', 'Perdido'], ['do_not_contact', 'Não contatar']] as const;
  return (
    <div className="flex items-center gap-2">
      <StagePill stage={lead.stage} />
      <select className="w-6 cursor-pointer appearance-none bg-transparent text-xs text-muted" aria-label="Mudar etapa" value="" disabled={pending}
        onChange={(e) => { const v = e.target.value as (typeof options)[number][0]; if (v) start(async () => { await updateLeadStageAction(lead.id, v); router.refresh(); }); }}>
        <option value="">▾</option>
        {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section className="card mb-4 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <button onClick={onClose} className="btn-ghost px-2 py-1" aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </section>
  );
}

function AiSearch({ aiOn, credits, onClose }: { aiOn: boolean; credits: number; onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<SearchPlan | null>(null);
  const [state, setState] = useState<{ error?: string; remaining?: number }>({});
  const [results, setResults] = useState<SimLead[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [added, setAdded] = useState<string>();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [importState, importAction] = useActionState(importLeadsAction, undefined);
  return (
    <PanelShell title="Busca com IA" onClose={onClose}>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await aiSearchAction(prompt); setState(r); setPlan(r.plan ?? null); setResults(r.results ?? null); setPicked((r.results ?? []).map((x) => x.linkedinUrl)); setAdded(undefined); }); }}>
        <input className="input flex-1" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder='Ex.: "CFOs de indústrias em Santa Catarina com mais de 200 funcionários"' />
        <button className="btn-primary" disabled={pending || prompt.trim().length < 4}><Sparkles className="h-4 w-4" />{pending ? 'Pensando…' : 'Gerar busca'}</button>
      </form>
      <p className="mt-2 text-xs text-muted">{aiOn ? 'A IA transforma sua descrição em filtros de busca.' : 'IA desligada: a busca usa o texto como palavras-chave.'} {state.remaining != null ? `${state.remaining} créditos restantes neste mês.` : `${credits} créditos por mês.`}</p>
      {state.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {results && (
        <div className="mt-5 rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">{results.length} leads encontrados <span className="pill ml-2 bg-violet-soft text-violet">simulado</span></p>
            <button className="btn-primary" disabled={!picked.length || pending} onClick={() => start(async () => { const r = await addSearchResultsAction(picked, prompt.slice(0, 40)); setAdded(r.ok ?? r.error); router.refresh(); })}>
              <Plus className="h-4 w-4" /> Adicionar {picked.length} à base
            </button>
          </div>
          <ul className="divide-y divide-border">
            {results.map((r) => (
              <li key={r.linkedinUrl} className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={picked.includes(r.linkedinUrl)} onChange={() => setPicked((p) => (p.includes(r.linkedinUrl) ? p.filter((x) => x !== r.linkedinUrl) : [...p, r.linkedinUrl]))} aria-label={`Selecionar ${r.fullName}`} />
                <Avatar name={r.fullName} />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.fullName}</p><p className="truncate text-xs text-muted">{r.headline} · {r.company} · {r.location}</p></div>
              </li>
            ))}
          </ul>
          {added && <p className="border-t border-border px-4 py-2.5 text-sm text-success">{added}</p>}
        </div>
      )}
      {plan && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">1. Abra a busca pronta</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...plan.titles, ...plan.locations, ...plan.industries].map((t) => <span key={t} className="pill bg-white text-text ring-1 ring-border">{t}</span>)}
            </div>
            <p className="mt-3 text-xs text-muted">Palavras-chave: <strong className="text-text">{plan.keywords}</strong></p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={plan.linkedinUrl} target="_blank" rel="noopener" className="btn-primary"><ExternalLink className="h-4 w-4" /> Buscar no LinkedIn</a>
              <a href={plan.googleUrl} target="_blank" rel="noopener" className="btn-outline"><ExternalLink className="h-4 w-4" /> Buscar no Google</a>
            </div>
          </div>
          <form action={importAction} className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold">2. Cole os perfis que gostou</p>
            <textarea name="urls" rows={4} className="input mt-3 font-mono text-xs" placeholder="https://www.linkedin.com/in/...&#10;https://www.linkedin.com/in/..." />
            <input name="tag" className="input mt-2" placeholder="Nome da lista (opcional)" defaultValue={plan.keywords.slice(0, 40)} />
            <div className="mt-3"><FormMessage state={importState} /></div>
            <div className="mt-3"><Submit className="btn-primary" pendingText="Salvando…">Salvar na base</Submit></div>
          </form>
        </div>
      )}
    </PanelShell>
  );
}

function ImportPanel({ onClose }: { onClose: () => void }) {
  const [state, action] = useActionState(importLeadsAction, undefined);
  return (
    <PanelShell title="Importar leads" onClose={onClose}>
      <form action={action} className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label" htmlFor="file">Arquivo CSV</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" className="input file:mr-3 file:rounded-md file:border-0 file:bg-surface-accent file:px-3 file:py-1 file:text-accent" />
          <p className="mt-1.5 text-xs text-muted">Aceita exportações do Sales Navigator, Apollo ou planilhas. Precisa de uma coluna com a URL do perfil; nome, cargo, empresa e cidade são lidos se existirem.</p>
        </div>
        <div>
          <label className="label" htmlFor="urls">Ou cole URLs de perfis</label>
          <textarea id="urls" name="urls" rows={4} className="input font-mono text-xs" placeholder="Uma por linha" />
        </div>
        <div>
          <label className="label" htmlFor="tag">Nome da lista</label>
          <input id="tag" name="tag" className="input" placeholder="Ex.: CFOs SC outubro" />
        </div>
        <div className="flex flex-col justify-end gap-3"><FormMessage state={state} /><Submit className="btn-primary" pendingText="Importando…">Importar</Submit></div>
      </form>
    </PanelShell>
  );
}

function AddPanel({ onClose }: { onClose: () => void }) {
  const [state, action] = useActionState(addLeadAction, undefined);
  return (
    <PanelShell title="Adicionar lead" onClose={onClose}>
      <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input name="linkedinUrl" className="input sm:col-span-2 lg:col-span-1" placeholder="URL do perfil *" required />
        <input name="fullName" className="input" placeholder="Nome completo *" required />
        <input name="headline" className="input" placeholder="Cargo" />
        <input name="company" className="input" placeholder="Empresa" />
        <input name="location" className="input" placeholder="Cidade" />
        <input name="tag" className="input" placeholder="Lista" />
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3"><Submit className="btn-primary" pendingText="Salvando…"><Megaphone className="hidden" />Adicionar</Submit><FormMessage state={state} /></div>
      </form>
    </PanelShell>
  );
}

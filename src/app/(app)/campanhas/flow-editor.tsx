'use client';

// Editor visual de fluxo das campanhas (estilo n8n, sem dependências externas).
// - Canvas com nós arrastáveis (gatilho, ações, condição) e conexões bezier.
// - Clique na saída de um nó e depois na entrada de outro para conectar.
// - Nó de condição tem duas saídas: "sim" (aceito) e "não" (ainda não conectado).

import { Heart, MessageCircle, MousePointerClick, Send, Sparkles, Trash2, UserPlus, Workflow, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { FlowActionType, FlowEdge, FlowGraph, FlowNode } from '@/lib/flow';
import { saveCampaignAction } from '../actions';

const NW = 188;
const NH = 56;

const ACTION_META: Record<FlowActionType, { label: string; icon: typeof Send }> = {
  invite: { label: 'Convite de conexão', icon: UserPlus },
  message: { label: 'Mensagem', icon: Send },
  react: { label: 'Reagir a post', icon: Heart },
  comment: { label: 'Comentar post', icon: MessageCircle },
};

type Initial = { name: string; aiBrief: string; assignedTo: string | null; linkedinAccountId: string | null; mode: 'assistido' | 'automatico'; graph: FlowGraph };
type AccountOption = { id: string; label: string; userName: string; status: string; demo: boolean };

let uid = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${uid++}`;

export function FlowEditor({ id, initial, members, aiOn, accounts = [] }: {
  id: string | null; initial: Initial; members: { id: string; name: string; email: string }[]; aiOn: boolean; accounts?: AccountOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({ name: initial.name, aiBrief: initial.aiBrief, assignedTo: initial.assignedTo, linkedinAccountId: initial.linkedinAccountId, mode: initial.mode });
  const [nodes, setNodes] = useState<FlowNode[]>(initial.graph.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(initial.graph.edges);
  const [selected, setSelected] = useState<string | null>(null);
  const [connect, setConnect] = useState<{ from: string; label?: 'yes' | 'no' } | null>(null);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const sel = nodes.find((n) => n.id === selected) ?? null;
  const width = useMemo(() => Math.max(760, ...nodes.map((n) => (n.pos?.x ?? 0) + NW + 160)), [nodes]);
  const height = useMemo(() => Math.max(560, ...nodes.map((n) => (n.pos?.y ?? 0) + NH + 120)), [nodes]);

  const node = (nid: string) => nodes.find((n) => n.id === nid);
  const setNode = (nid: string, patch: Partial<FlowNode>) => { setSaved(false); setNodes((ns) => ns.map((n) => (n.id === nid ? { ...n, ...patch } : n))); };
  const removeNode = (nid: string) => {
    setSaved(false);
    setNodes((ns) => ns.filter((n) => n.id === nid || n.type === 'trigger'));
    setEdges((es) => es.filter((e) => e.from !== nid && e.to !== nid));
    if (selected === nid) setSelected(null);
  };
  const removeEdge = (eid: string) => { setSaved(false); setEdges((es) => es.filter((e) => e.id !== eid)); };

  useEffect(() => {
    const cancelConnection = (e: KeyboardEvent) => { if (e.key === 'Escape') setConnect(null); };
    window.addEventListener('keydown', cancelConnection);
    return () => window.removeEventListener('keydown', cancelConnection);
  }, []);

  const addNode = (kind: 'action' | 'branch', action?: FlowActionType) => {
    setSaved(false);
    const count = nodes.filter((n) => n.type === 'action').length;
    const n: FlowNode = kind === 'branch'
      ? { id: newId('c'), type: 'branch', if: 'accepted', pos: { x: 380, y: 90 + count * 120 } }
      : { id: newId('n'), type: 'action', action, waitDays: 2, condition: action === 'message' && nodes.some((x) => x.action === 'invite') ? 'accepted' : 'always', template: '', useAi: action !== 'react', pos: { x: 380, y: 90 + count * 120 } };
    setNodes((ns) => [...ns, n]);
    setSelected(n.id);
  };

  const reaches = (from: string, to: string) => {
    const seen = new Set<string>([to]);
    const q = [to];
    while (q.length) {
      const cur = q.pop()!;
      if (cur === from) return true;
      for (const e of edges.filter((x) => x.from === cur)) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
    }
    return false;
  };

  const connectTo = (to: string) => {
    if (!connect) return;
    if (to === 'trigger') { setError('O gatilho não possui entrada.'); setConnect(null); return; }
    if (connect.from === to || reaches(connect.from, to)) { setError('Esta conexão criaria um loop no fluxo.'); setConnect(null); return; }
    setError(undefined); setSaved(false);
    setEdges((es) => [
      ...es.filter((e) => !(e.from === connect.from && (connect.label ? e.label === connect.label : !e.label))),
      { id: newId('e'), from: connect.from, to, label: connect.label },
    ]);
    setConnect(null);
  };

  const onPointerDown = (e: React.PointerEvent, n: FlowNode) => {
    if (connect) { connectTo(n.id); return; }
    setSelected(n.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || n.type === 'trigger') return;
    drag.current = { id: n.id, dx: e.clientX - rect.left - (n.pos?.x ?? 0), dy: e.clientY - rect.top - (n.pos?.y ?? 0) };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.round((e.clientX - rect.left - drag.current.dx) / 10) * 10);
    const y = Math.max(0, Math.round((e.clientY - rect.top - drag.current.dy) / 10) * 10);
    setNode(drag.current.id, { pos: { x, y } });
  };
  const onPointerUp = () => { drag.current = null; };

  const portPos = (n: FlowNode, side: 'out' | 'in' | 'yes' | 'no') => {
    const x = n.pos?.x ?? 0, y = n.pos?.y ?? 0;
    if (side === 'in') return { x, y: y + NH / 2 };
    if (side === 'out') return { x: x + NW, y: y + NH / 2 };
    return { x: x + NW, y: y + (side === 'yes' ? NH * 0.32 : NH * 0.72) };
  };
  const path = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };

  const save = () => start(async () => {
    setError(undefined);
    const r = saveCampaignAction(id, { ...form, steps: [], graph: { nodes, edges } });
    const res = await r;
    if (res.error) return setError(res.error);
    setSaved(true);
    if (!id && res.id) router.push(`/campanhas/${res.id}`); else router.refresh();
  });

  const outPort = (n: FlowNode, side: 'out' | 'yes' | 'no', title: string) => (
    <button
      title={title} aria-label={title}
      onClick={(e) => { e.stopPropagation(); setConnect({ from: n.id, label: side === 'out' ? undefined : side }); setError(undefined); }}
      className={`absolute h-3.5 w-3.5 rounded-full border-2 border-white transition-transform hover:scale-125 ${connect?.from === n.id && connect?.label === (side === 'out' ? undefined : side) ? 'bg-accent' : 'bg-violet'}`}
      style={{ right: -7, top: side === 'out' ? NH / 2 - 7 : side === 'yes' ? NH * 0.32 - 7 : NH * 0.72 - 7 }}
    />
  );

  const NodeCard = ({ n }: { n: FlowNode }) => {
    const isSel = selected === n.id;
    const base = `absolute select-none rounded-xl border bg-surface shadow-sm transition-shadow ${isSel ? 'border-accent shadow-md' : 'border-border'}`;
    if (n.type === 'trigger') {
      return (
        <div className={`${base} flex cursor-pointer items-center gap-2.5 px-3`} style={{ left: n.pos?.x, top: n.pos?.y, width: NW, height: NH }} onPointerDown={(e) => onPointerDown(e, n)}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-soft text-violet"><Zap className="h-4 w-4" /></span>
          <div><p className="text-sm font-semibold leading-tight">Lead inscrito</p><p className="text-[11px] text-muted">início do fluxo</p></div>
          {outPort(n, 'out', 'Conectar saída')}
        </div>
      );
    }
    if (n.type === 'branch') {
      return (
        <div className={`${base} flex cursor-pointer items-center gap-2.5 px-3`} style={{ left: n.pos?.x, top: n.pos?.y, width: NW, height: NH }} onPointerDown={(e) => onPointerDown(e, n)}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-soft text-violet"><MousePointerClick className="h-4 w-4" /></span>
          <div><p className="text-sm font-semibold leading-tight">Condição</p><p className="text-[11px] text-muted">convite aceito?</p></div>
          {outPort(n, 'yes', 'Saída: sim (aceito)')}
          {outPort(n, 'no', 'Saída: não (aguardando)')}
        </div>
      );
    }
    const M = ACTION_META[n.action ?? 'message'];
    return (
      <div className={`${base} cursor-grab px-3 py-2 active:cursor-grabbing`} style={{ left: n.pos?.x, top: n.pos?.y, width: NW, height: NH }} onPointerDown={(e) => onPointerDown(e, n)}>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-accent text-accent"><M.icon className="h-3.5 w-3.5" /></span>
          <p className="truncate text-sm font-medium leading-tight">{M.label}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-muted">
          {n.waitDays ? `espera ${n.waitDays}d` : 'sem espera'}{n.condition === 'accepted' ? ' · após aceite' : ''}{n.useAi ? ' · IA' : ''}
        </p>
        {outPort(n, 'out', 'Conectar saída')}
      </div>
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="pill bg-violet-soft text-violet"><Workflow className="h-3.5 w-3.5" /> Fluxo</span>
          {Object.entries(ACTION_META).map(([k, v]) => (
            <button key={k} className="btn-outline py-1.5" onClick={() => addNode('action', k as FlowActionType)}><v.icon className="h-4 w-4" />{v.label}</button>
          ))}
          <button className="btn-outline py-1.5" onClick={() => addNode('branch')}><MousePointerClick className="h-4 w-4" />Condição</button>
          {connect && <span className="pill bg-violet text-white">clique no destino da conexão · <button type="button" onClick={() => setConnect(null)}>cancelar</button></span>}
        </div>

        <div ref={canvasRef} className="relative overflow-auto rounded-2xl border border-dashed border-border bg-surface/60" style={{ height: 520 }}
          onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div className="relative" style={{ width, height }}>
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--color-violet)" strokeWidth="1.6" />
                </marker>
              </defs>
              {edges.map((e) => {
                const a = node(e.from), b = node(e.to);
                if (!a || !b) return null;
                const p1 = portPos(a, (e.label as 'yes' | 'no' | 'out') ?? 'out');
                const p2 = portPos(b, 'in');
                return (
                  <g key={e.id} className="pointer-events-auto cursor-pointer" onClick={() => removeEdge(e.id)}>
                    <path d={path(p1, p2)} fill="none" stroke="transparent" strokeWidth="14" />
                    <path d={path(p1, p2)} fill="none" stroke={e.label === 'no' ? 'var(--color-brand-silver)' : 'var(--color-violet)'} strokeWidth="1.8" markerEnd="url(#arrow)" />
                    {e.label && <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 6} textAnchor="middle" className="fill-current text-[10px] text-muted">{e.label === 'yes' ? 'sim' : 'não'}</text>}
                  </g>
                );
              })}
            </svg>
            {nodes.map((n) => <NodeCard key={n.id} n={n} />)}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">Arraste os cartões para organizar. Clique na bolinha roxa de saída e depois no cartão de destino para conectar; clique em uma linha para removê-la.</p>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <div className="card space-y-4 p-5">
          {sel ? (
            <>
              <p className="label mb-0">Configuração do nó</p>
              {sel.type === 'trigger' && <p className="text-sm text-muted">O gatilho inicia o fluxo quando um lead é inscrito na campanha.</p>}
              {sel.type === 'branch' && (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Se <span className="text-violet">convite aceito</span> → saída <strong>sim</strong>; caso contrário → saída <strong>não</strong> (ou aguardando aceite).</p>
                  <p className="text-muted">Conecte as duas saídas para criar caminhos diferentes no mesmo fluxo.</p>
                </div>
              )}
              {sel.type === 'action' && (
                <>
                  <div><label className="label" htmlFor="ntype">Ação</label>
                    <select id="ntype" className="input" value={sel.action} disabled onChange={() => {}}>
                      {Object.entries(ACTION_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></div>
                  <label className="flex items-center gap-2 text-sm">Esperar
                    <input type="number" min={0} max={60} className="input w-16 py-1" value={sel.waitDays ?? 0}
                      onChange={(e) => setNode(sel.id, { waitDays: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
                    dia(s) antes de executar</label>
                  <label className="flex items-center gap-2 text-sm">
                    <select className="input w-auto py-1" value={sel.condition ?? 'always'} onChange={(e) => setNode(sel.id, { condition: e.target.value as 'always' | 'accepted' })}>
                      <option value="always">sempre</option><option value="accepted">só depois que aceitar o convite</option>
                    </select></label>
                  {sel.action !== 'react' && (
                    <>
                      <textarea rows={3} className="input leading-relaxed" value={sel.template ?? ''} maxLength={sel.action === 'invite' ? 300 : 1500}
                        placeholder={sel.action === 'invite' ? 'Nota do convite (até 300 caracteres)' : 'Texto base'}
                        onChange={(e) => setNode(sel.id, { template: e.target.value })} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!sel.useAi} onChange={(e) => setNode(sel.id, { useAi: e.target.checked })} />
                        <Sparkles className="h-4 w-4 text-violet" /> Personalizar com IA {!aiOn && <span className="text-xs text-muted">(IA não configurada: usa o texto base)</span>}
                      </label>
                    </>
                  )}
                </>
              )}
              {sel.type !== 'trigger' && (
                <button className="btn-ghost w-full justify-center hover:text-danger" onClick={() => removeNode(sel.id)}>
                  <Trash2 className="h-4 w-4" /> Remover este nó
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Selecione um nó do fluxo para configurar, ou adicione ações e condições na paleta acima.</p>
          )}
        </div>

        <div className="card space-y-4 p-5">
          <div><label className="label" htmlFor="name">Nome da campanha</label>
            <input id="name" className="input" value={form.name} onChange={(e) => { setSaved(false); setForm({ ...form, name: e.target.value }); }} placeholder="Ex.: CFOs indústria SC" /></div>
          <div><label className="label" htmlFor="assigned">Quem executa</label>
            <select id="assigned" className="input" value={form.assignedTo ?? ''} onChange={(e) => { setSaved(false); setForm({ ...form, assignedTo: e.target.value || null }); }}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
            </select></div>
          <div><label className="label" htmlFor="account">Conta LinkedIn</label>
            <select id="account" className="input" value={form.linkedinAccountId ?? ''} onChange={(e) => { setSaved(false); setForm({ ...form, linkedinAccountId: e.target.value || null }); }}>
              <option value="">Sem conta específica (modo assistido)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label} · {a.userName}{a.demo ? ' (demo)' : ''} — {a.status === 'connected' ? 'conectada' : a.status === 'waiting' ? 'aguardando' : a.status === 'expired' ? 'expirada' : a.status === 'blocked' ? 'bloqueada' : 'desconectada'}</option>
              ))}
            </select>
            {!accounts.length && <p className="mt-1 text-xs text-muted">Nenhuma conta vinculada ainda. Conecte em <strong>Go LinkedIn</strong>.</p>}
          </div>
          <div><label className="label" htmlFor="mode">Modo de execução</label>
            <select id="mode" className="input" value={form.mode} onChange={(e) => { setSaved(false); setForm({ ...form, mode: e.target.value === 'automatico' ? 'automatico' : 'assistido' }); }}>
              <option value="assistido">Assistido — as ações vão para a Fila e você envia com um clique</option>
              <option value="automatico">Automático — o robô executa no LinkedIn (exige conta conectada)</option>
            </select>
            {form.mode === 'automatico' && <p className="mt-1 text-xs text-muted">No automático, as ações aparecem na Fila como “em execução” (só leitura).</p>}
          </div>
          <div><label className="label" htmlFor="brief">Contexto para a IA</label>
            <textarea id="brief" rows={5} className="input text-sm" value={form.aiBrief} onChange={(e) => { setSaved(false); setForm({ ...form, aiBrief: e.target.value }); }}
              placeholder="O que você oferece, para quem, tom de voz, o que evitar. Ex.: recuperação de créditos tributários para indústrias do Lucro Real; tom consultivo, sem citar preços." /></div>
          <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">Variáveis: {'{nome}'} {'{nome_completo}'} {'{cargo}'} {'{empresa}'} {'{cidade}'}</p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" onClick={save} disabled={pending}>{pending ? 'Salvando…' : saved ? 'Salvo ✓' : id ? 'Salvar alterações' : 'Criar campanha'}</button>
        </div>
      </aside>
    </div>
  );
}

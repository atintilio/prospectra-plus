import type { CampaignStep } from '@/db/schema';

// Modelo de fluxo estilo n8n para as campanhas.
// - Um fluxo é um grafo: nós (gatilho, ação, condição) ligados por conexões.
// - Campanhas antigas (lista linear de passos) continuam funcionando: o grafo é
//   derivado dos passos quando o fluxo salvo não existe. Nada é descartado.

export type FlowNodeType = 'trigger' | 'action' | 'branch';
export type FlowActionType = 'react' | 'comment' | 'invite' | 'message';
/** Condição de um nó de condição: aceito segue por "sim", ainda não conectado por "não". */
export type FlowBranchIf = 'accepted';

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  // nós de ação
  action?: FlowActionType;
  template?: string;
  useAi?: boolean;
  /** Espera (dias) antes de executar a ação, contada a partir do nó anterior. */
  waitDays?: number;
  /** Paridade com o modelo antigo: ação só depois do aceite. */
  condition?: 'always' | 'accepted';
  // nós de condição
  if?: FlowBranchIf;
  // posição no editor visual
  pos?: { x: number; y: number };
};

export type FlowEdge = { id: string; from: string; to: string; label?: string };

export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

export const TRIGGER_ID = 'trigger';

export function emptyGraph(): FlowGraph {
  return { nodes: [{ id: TRIGGER_ID, type: 'trigger', pos: { x: 60, y: 140 } }], edges: [] };
}

export function triggerOf(graph: FlowGraph): FlowNode {
  return graph.nodes.find((n) => n.type === 'trigger') ?? { id: TRIGGER_ID, type: 'trigger' };
}

export function nodeById(graph: FlowGraph, id: string | null | undefined): FlowNode | undefined {
  if (!id) return undefined;
  return graph.nodes.find((n) => n.id === id);
}

export function outEdge(graph: FlowGraph, from: string, label?: 'yes' | 'no'): FlowEdge | undefined {
  return graph.edges.find((e) => e.from === from && (label ? e.label === label : !e.label || e.label === undefined));
}

/** Conta quantos nós de ação o fluxo tem (para exibição "N ações"). */
export function flowActionCount(graph: FlowGraph): number {
  return graph.nodes.filter((n) => n.type === 'action').length;
}

/**
 * Converte a cadência linear antiga (steps) em um grafo equivalente.
 * A ordem e os atrasos são preservados; condição "accepted" vira condição no nó de ação.
 */
export function deriveGraphFromSteps(steps: CampaignStep[]): FlowGraph {
  const nodes: FlowNode[] = [{ id: TRIGGER_ID, type: 'trigger', pos: { x: 60, y: 200 } }];
  const edges: FlowEdge[] = [];
  let prev = TRIGGER_ID;
  let y = 80;
  steps.forEach((s, i) => {
    y += 130;
    const id = s.id || `n${i + 1}`;
    nodes.push({ id, type: 'action', action: s.type, template: s.template, useAi: s.useAi, waitDays: s.delayDays, condition: s.condition, pos: { x: 300, y } });
    edges.push({ id: `e${i + 1}`, from: prev, to: id });
    prev = id;
  });
  return { nodes, edges };
}

/** Grafo efetivo da campanha: o salvo tem prioridade; sem ele, deriva dos passos antigos. */
export function graphOf(campaign: { graph?: FlowGraph | null; steps: CampaignStep[] }): FlowGraph {
  const saved = campaign.graph;
  if (saved && Array.isArray(saved.nodes) && saved.nodes.length) return saved;
  return deriveGraphFromSteps(campaign.steps ?? []);
}

const ACTION_TYPES: FlowActionType[] = ['react', 'comment', 'invite', 'message'];

/** Fluxo inicial sugerido para novas campanhas (mesma sequência recomendada do modelo antigo).
 *  Vive aqui (módulo puro, sem "use client"): importar valores de arquivos client
 *  em componentes de servidor devolve referência, não o valor. */
export const DEFAULT_STEPS: CampaignStep[] = [
  { id: 's1', type: 'react', delayDays: 0, condition: 'always', template: '', useAi: false },
  { id: 's2', type: 'invite', delayDays: 1, condition: 'always', template: 'Olá {nome}, acompanho o trabalho da {empresa} e gostaria de trocar ideias com você por aqui.', useAi: true },
  { id: 's3', type: 'message', delayDays: 1, condition: 'accepted', template: 'Obrigado por aceitar, {nome}! Trabalho com empresas como a {empresa} em [seu tema]. Como vocês lidam hoje com [dor]?', useAi: true },
  { id: 's4', type: 'message', delayDays: 4, condition: 'always', template: '{nome}, faz sentido uma conversa rápida de 15 minutos nesta semana?', useAi: false },
];

/** Valida o grafo recebido do editor. Devolve erro ou nada. */
export function validateGraph(graph: unknown): { error?: string; graph: FlowGraph } {
  const g = graph as FlowGraph;
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return { error: 'Fluxo inválido.', graph: emptyGraph() };
  const ids = new Set<string>();
  let hasTrigger = false;
  let actions = 0;
  for (const n of g.nodes) {
    if (!n || typeof n.id !== 'string' || ids.has(n.id)) return { error: 'Nó do fluxo inválido.', graph: emptyGraph() };
    ids.add(n.id);
    if (n.type === 'trigger') hasTrigger = true;
    if (n.type === 'action') {
      actions++;
      if (!ACTION_TYPES.includes(n.action as FlowActionType)) return { error: 'Ação do fluxo inválida.', graph: emptyGraph() };
      if (n.action !== 'react' && !(n.template ?? '').trim() && !n.useAi) return { error: 'Preencha o texto de cada ação ou ligue a IA.', graph: emptyGraph() };
      if (n.waitDays !== undefined && (!Number.isFinite(n.waitDays) || n.waitDays < 0 || n.waitDays > 60)) return { error: 'Espera deve ficar entre 0 e 60 dias.', graph: emptyGraph() };
    }
    if (n.type === 'branch' && n.if !== 'accepted') return { error: 'Condição do fluxo inválida.', graph: emptyGraph() };
  }
  if (!hasTrigger) return { error: 'O fluxo precisa de um gatilho.', graph: emptyGraph() };
  if (actions < 1) return { error: 'Adicione pelo menos uma ação ao fluxo.', graph: emptyGraph() };
  if (actions > 12) return { error: 'Máximo de 12 ações por fluxo.', graph: emptyGraph() };
  for (const e of g.edges) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string' || !ids.has(e.from) || !ids.has(e.to) || e.from === e.to) {
      return { error: 'Conexão do fluxo inválida.', graph: emptyGraph() };
    }
  }
  // o gatilho precisa alcançar pelo menos uma ação
  const reach = new Set([triggerOf(g).id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of g.edges) {
      if (reach.has(e.from) && !reach.has(e.to)) { reach.add(e.to); grew = true; }
    }
  }
  if (![...reach].some((id) => g.nodes.find((n) => n.id === id)?.type === 'action')) {
    return { error: 'Ligue o gatilho a pelo menos uma ação.', graph: emptyGraph() };
  }
  return { graph: g };
}

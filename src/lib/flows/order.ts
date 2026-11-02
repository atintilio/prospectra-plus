/**
 * Ordenação das etapas do fluxo.
 *
 * A ordem vive em `flow_steps.position` (inteiro, renumerado a partir de 0).
 * Esta função é pura: o construtor chama, o servidor grava.
 */

/** O mínimo que a reordenação precisa de uma etapa: identificador e posição. */
export type OrderableFlowStep = { id: string; position: number };

/**
 * Move a etapa de `from` para `to` e renumera `position` a partir de 0.
 *
 * `from` e `to` são índices (0-based) na lista ordenada por `position` — o mesmo
 * número que o bloco ocupa na tela do construtor (o arrasto e os botões de
 * subir/descer usam a mesma conta).
 *
 * A lista devolvida tem a mesma quantidade de etapas, nenhuma etapa perdida nem
 * duplicada, `position` sem buraco (0..n-1) e os demais campos intactos.
 */
export function reorderFlowSteps<T extends OrderableFlowStep>(steps: readonly T[], from: number, to: number): T[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  if (ordered.length === 0) return [];
  if (!Number.isInteger(from) || from < 0 || from >= ordered.length) {
    throw new RangeError(`Posição de origem inválida: ${from}.`);
  }
  if (!Number.isInteger(to) || to < 0 || to >= ordered.length) {
    throw new RangeError(`Posição de destino inválida: ${to}.`);
  }
  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((step, index) => ({ ...step, position: index }));
}

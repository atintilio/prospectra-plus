import type { Evidence } from './types';

export function correlate(evidence: Evidence[]) {
  const unique = [...new Map(evidence.map((item) => [`${item.source}|${item.kind}|${item.value.toLowerCase()}`, item])).values()];
  const byKind = new Map<string, Set<string>>();
  for (const item of unique) {
    const values = byKind.get(item.kind) ?? new Set<string>();
    values.add(item.value.toLowerCase());
    byKind.set(item.kind, values);
  }
  const conflicts = [...byKind.entries()].filter(([, values]) => values.size > 1).map(([kind]) => `Valores conflitantes para ${kind}`);
  return { evidence: unique, conflicts };
}

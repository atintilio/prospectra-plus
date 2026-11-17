import type { CommercialSignal, Evidence } from './types';

export function score(evidence: Evidence[]): CommercialSignal[] {
  if (!evidence.length) return [];
  const ids = evidence.map((item) => item.id);
  return [{ key: 'public_presence', value: 'evidence_found', confidence: evidence.some((item) => item.confidence === 'confirmed') ? 'confirmed' : 'probable', evidenceIds: ids }];
}

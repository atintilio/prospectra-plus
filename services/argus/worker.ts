import { correlate } from './correlation';
import { normalizeTarget } from './normalize';
import { score } from './scoring';
import { dnsSource } from './sources/dns';
import { publicHttpSource } from './sources/http';
import type { Evidence, InvestigationRequest, InvestigationResult, SourceAdapter } from './types';

async function collectWithRetry(source: SourceAdapter, request: InvestigationRequest, retries: number): Promise<Evidence[]> {
  for (let attempt = 0; ; attempt++) {
    try { return await source.collect(request.target); }
    catch (error) { if (attempt >= retries) throw error; }
  }
}

export async function runInvestigation(request: InvestigationRequest, options: { retries?: number; sources?: SourceAdapter[] } = {}): Promise<InvestigationResult> {
  const target = normalizeTarget(request.target);
  const sources = options.sources ?? request.sources ?? [publicHttpSource(), dnsSource()];
  const evidence: Evidence[] = [], errors: string[] = [];
  for (const source of sources) {
    try { evidence.push(...await collectWithRetry(source, { ...request, target }, options.retries ?? 1)); }
    catch (error) { errors.push(`${source.name}: ${error instanceof Error ? error.message : 'falha desconhecida'}`); }
  }
  const correlated = correlate(evidence);
  return { id: request.id, status: errors.length ? (evidence.length ? 'partial' : 'failed') : 'completed', evidence: correlated.evidence, signals: score(correlated.evidence), conflicts: correlated.conflicts, errors };
}

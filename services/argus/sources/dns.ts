import { promises as dns } from 'node:dns';
import { createHash } from 'node:crypto';
import type { InvestigationTarget, SourceAdapter } from '../types';

export function dnsSource(): SourceAdapter { return { name: 'public-dns', async collect(target: InvestigationTarget) {
  if (!target.domain) return [];
  const records = await dns.resolve(target.domain, 'A');
  return records.map((value) => ({ id: createHash('sha256').update(`${target.domain}|${value}`).digest('hex').slice(0, 16), source: 'public-dns', url: `https://${target.domain}`, kind: 'dns_a', value, collectedAt: new Date().toISOString(), confidence: 'confirmed' as const }));
} }; }

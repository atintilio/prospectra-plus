import { createHash } from 'node:crypto';
import { normalizeUrl } from '../normalize';
import type { Evidence, InvestigationTarget, SourceAdapter } from '../types';

type Fetcher = typeof fetch;
export function publicHttpSource(fetcher: Fetcher = fetch, timeoutMs = 4000): SourceAdapter {
  return { name: 'public-http', async collect(target: InvestigationTarget) {
    if (!target.domain && !target.profileUrl) return [];
    const url = normalizeUrl(target.profileUrl ?? `https://${target.domain}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { signal: controller.signal, redirect: 'error', headers: { accept: 'text/html' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = (await response.text()).slice(0, 5000).replace(/\s+/g, ' ').trim();
      const id = createHash('sha256').update(`${url}|${text}`).digest('hex').slice(0, 16);
      return [{ id, source: 'public-http', url: url.toString(), kind: 'public_page', value: text || 'reachable', collectedAt: new Date().toISOString(), confidence: 'probable' }];
    } finally { clearTimeout(timer); }
  } };
}

import type { ArgusEvidence, ArgusFetch, ArgusSource, ArgusTarget } from './types';
import { correlationKey } from './normalize';

export async function collectSource(source: ArgusSource, target: ArgusTarget, fetcher: ArgusFetch): Promise<ArgusEvidence[]> {
  const urls = source === 'website' ? (target.urls ?? (target.domain ? [`https://${target.domain}`] : [])) : target.name ? [source === 'wikipedia' ? `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(target.name)}&format=json&origin=*` : `https://api.github.com/search/users?q=${encodeURIComponent(target.name)}`] : [];
  const evidence: ArgusEvidence[] = [];
  for (const url of urls.slice(0, 3)) {
    const response = await fetcher(url, { headers: { accept: 'application/json, text/html' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    let title: string | undefined;
    let excerpt = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (source !== 'website') {
      const parsed = JSON.parse(body) as { query?: { search?: Array<{ title: string; snippet: string }> }; items?: Array<{ login: string; html_url: string }> };
      const item = parsed.query?.search?.[0]; const user = parsed.items?.[0];
      title = item?.title ?? user?.login; excerpt = item?.snippet?.replace(/<[^>]+>/g, '') ?? (user ? `GitHub user ${user.login}` : excerpt);
    }
    evidence.push({ id: `${source}:${correlationKey(url)}`, source, url, title, excerpt, collectedAt: new Date().toISOString(), correlationKey: correlationKey(`${target.name ?? ''} ${target.domain ?? ''} ${title ?? ''}`) });
  }
  return evidence;
}

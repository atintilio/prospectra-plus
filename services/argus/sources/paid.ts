import { createHash } from 'node:crypto';
import type { Evidence, InvestigationTarget, SourceAdapter } from '../types';

// Conectores de enriquecimento PAGOS e OPCIONAIS. Só ativam quando a chave de API
// correspondente existe no ambiente — o padrão do Argus é keyless (busca pública).
// Reimplementação própria a partir da API pública de cada fornecedor (nada de código
// de terceiros). Todos emitem a mesma Evidence (kind 'linkedin_profile'/'email') e
// entram no mesmo waterfall; por serem verificados, a confiança é 'confirmed'.

type Fetcher = typeof fetch;
function hash(v: string) { return createHash('sha256').update(v).digest('hex').slice(0, 16); }
function normLinkedin(url: string | null | undefined) {
  if (!url) return null;
  const m = String(url).match(/linkedin\.com\/(in|pub)\/([^/?#\s,"']+)/i);
  return m ? `https://www.linkedin.com/in/${decodeURIComponent(m[2]).replace(/\/$/, '').toLowerCase()}` : null;
}

/** Hunter.io — people/find por e-mail → handle do LinkedIn. Ativa com HUNTER_API_KEY. */
export function hunterSource(apiKey = process.env.HUNTER_API_KEY, fetcher: Fetcher = fetch): SourceAdapter | null {
  if (!apiKey) return null;
  return { name: 'hunter', async collect(target: InvestigationTarget) {
    if (!target.email) return [];
    const res = await fetcher(`https://api.hunter.io/v2/people/find?email=${encodeURIComponent(target.email)}&api_key=${encodeURIComponent(apiKey)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) throw new Error('Hunter: chave inválida/sem permissão');
    if (res.status === 429) throw new Error('Hunter: limite de requisições');
    if (!res.ok) throw new Error(`Hunter HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    const handle = data?.data?.linkedin?.handle;
    const url = normLinkedin(handle ? `https://www.linkedin.com/in/${handle}` : '');
    if (!url) return [];
    return [{ id: hash(`hunter|${url}`), source: 'hunter', url, kind: 'linkedin_profile', value: url, collectedAt: new Date().toISOString(), confidence: 'confirmed' as const }];
  } };
}

/** Apollo.io — people/match por e-mail → linkedin_url. Ativa com APOLLO_API_KEY. */
export function apolloSource(apiKey = process.env.APOLLO_API_KEY, fetcher: Fetcher = fetch): SourceAdapter | null {
  if (!apiKey) return null;
  return { name: 'apollo', async collect(target: InvestigationTarget) {
    if (!target.email && !target.name) return [];
    const res = await fetcher('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify({ ...(target.email ? { email: target.email } : {}), ...(target.name ? { name: target.name } : {}), ...(target.company ? { organization_name: target.company } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) throw new Error('Apollo: chave inválida/sem permissão');
    if (res.status === 429) throw new Error('Apollo: limite de requisições');
    if (!res.ok) throw new Error(`Apollo HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    const url = normLinkedin(data?.person?.linkedin_url || '');
    if (!url) return [];
    return [{ id: hash(`apollo|${url}`), source: 'apollo', url, kind: 'linkedin_profile', value: url, collectedAt: new Date().toISOString(), confidence: 'confirmed' as const }];
  } };
}

/** Lista de conectores pagos ativos (apenas os que têm chave). */
export function paidSources(): SourceAdapter[] {
  return [hunterSource(), apolloSource()].filter((s): s is SourceAdapter => s !== null);
}

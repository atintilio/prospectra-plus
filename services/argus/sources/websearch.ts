import { createHash } from 'node:crypto';
import type { Evidence, InvestigationTarget, SourceAdapter } from '../types';

// Busca pública keyless (DuckDuckGo HTML) para trazer sinais sobre o lead:
// descobre o perfil do LinkedIn quando ele não veio no import e coleta menções
// públicas (empresa, cargo, notícias). Nenhuma chave de API, nenhum dado do usuário.

type Fetcher = typeof fetch;
const DDG = 'https://html.duckduckgo.com/html/';

function hash(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 16); }

/** Extrai as URLs de resultado do HTML do DuckDuckGo (resolve o redirect uddg=). */
export function extractResultUrls(html: string): string[] {
  const out: string[] = [];
  const re = /href="([^"]*uddg=[^"&]+[^"]*|https?:\/\/[^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 25) {
    let href = m[1];
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) { try { href = decodeURIComponent(uddg[1]); } catch { continue; } }
    if (href.startsWith('//')) href = `https:${href}`;
    if (!/^https?:\/\//i.test(href)) continue;
    if (/duckduckgo\.com/i.test(href)) continue; // links internos do buscador
    if (!out.includes(href)) out.push(href);
  }
  return out;
}

function normalizeLinkedin(url: string): string | null {
  const m = url.match(/linkedin\.com\/(in|pub)\/([^/?#\s,"']+)/i);
  if (!m) return null;
  return `https://www.linkedin.com/in/${decodeURIComponent(m[2]).replace(/\/$/, '').toLowerCase()}`;
}

async function query(fetcher: Fetcher, q: string, timeoutMs: number): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(`${DDG}?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; ProspectraBot/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return extractResultUrls(await res.text());
  } finally { clearTimeout(timer); }
}

export function webSearchSource(fetcher: Fetcher = fetch, timeoutMs = 5000): SourceAdapter {
  return { name: 'web-search', async collect(target: InvestigationTarget) {
    const name = target.name ?? target.person;
    if (!name) return []; // sem um nome não há o que buscar com segurança
    const company = target.company ? ` ${target.company}` : '';
    const now = new Date().toISOString();
    const evidence: Evidence[] = [];

    // 1) Dork específico: perfil do LinkedIn do lead.
    if (!target.profileUrl) {
      const liUrls = await query(fetcher, `site:linkedin.com/in "${name}"${company}`, timeoutMs);
      const profile = liUrls.map(normalizeLinkedin).find(Boolean);
      if (profile) {
        evidence.push({ id: hash(`li|${profile}`), source: 'web-search', url: profile, kind: 'linkedin_profile', value: profile, collectedAt: now, confidence: 'probable' });
      }
    }

    // 2) Menções públicas gerais (notícias, site da empresa, redes) — contexto para a abordagem.
    const mentions = await query(fetcher, `"${name}"${company}`, timeoutMs);
    for (const url of mentions.slice(0, 5)) {
      const li = normalizeLinkedin(url);
      if (li) { if (!evidence.some((e) => e.value === li)) evidence.push({ id: hash(`li|${li}`), source: 'web-search', url: li, kind: 'linkedin_profile', value: li, collectedAt: now, confidence: 'probable' }); continue; }
      evidence.push({ id: hash(`m|${url}`), source: 'web-search', url, kind: 'web_mention', value: url, collectedAt: now, confidence: 'candidate' });
    }
    return evidence;
  } };
}

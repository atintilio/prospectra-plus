import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_BASE_URL = 'https://scraper.prospectra.argusprime.com.br';
const REQUEST_TIMEOUT_MS = 50_000;
const HEALTH_TIMEOUT_MS = 5_000;

export interface ScrapeGraphExtraction {
  provider: 'Prospectra Web Scraper';
  requestId?: string;
  sourceUrl: string;
  extractedAt: string;
  data: Record<string, unknown>;
  raw?: string;
}

/**
 * O nome público das rotas permanece `scrapegraph` para não quebrar links salvos,
 * mas o provider de produção é o website-email-contact-scraper hospedado na VM.
 * `SGAI_*` fica apenas como fallback de migração para deployments antigos.
 */
export function scrapeGraphBaseUrl() {
  return (process.env.SCRAPER_BASE_URL?.trim() || process.env.SGAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
}

export function scrapeGraphApiKey() {
  return process.env.SCRAPER_API_KEY?.trim() || process.env.SGAI_API_KEY?.trim() || '';
}

export function scrapeGraphConfigured() {
  return Boolean(scrapeGraphApiKey());
}

export interface ScrapeGraphHealth {
  provider: 'Prospectra Web Scraper';
  baseUrl: string;
  configured: boolean;
  reachable: boolean;
  status: 'ready' | 'awaiting_api_key' | 'unreachable' | 'provider_failed';
  engine?: string;
  commit?: string;
}

export async function scrapeGraphHealth(): Promise<ScrapeGraphHealth> {
  const baseUrl = scrapeGraphBaseUrl();
  const configured = scrapeGraphConfigured();
  if (!configured) {
    return { provider: 'Prospectra Web Scraper', baseUrl, configured: false, reachable: false, status: 'awaiting_api_key' };
  }
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const body = await response.json().catch(() => ({})) as { engine?: unknown; commit?: unknown };
    if (!response.ok) {
      return { provider: 'Prospectra Web Scraper', baseUrl, configured, reachable: true, status: 'provider_failed' };
    }
    return {
      provider: 'Prospectra Web Scraper',
      baseUrl,
      configured,
      reachable: true,
      status: 'ready',
      engine: typeof body.engine === 'string' ? body.engine : undefined,
      commit: typeof body.commit === 'string' ? body.commit : undefined,
    };
  } catch {
    return { provider: 'Prospectra Web Scraper', baseUrl, configured, reachable: false, status: 'unreachable' };
  }
}

function privateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function privateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && privateIpv4(mapped[1]));
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return privateIpv4(address);
  if (version === 6) return privateIpv6(address);
  return true;
}

export async function validatePublicUrl(value: string): Promise<URL> {
  if (value.length > 2048) throw new Error('SCRAPEGRAPH_INVALID_URL');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('SCRAPEGRAPH_INVALID_URL'); }
  const hostname = parsed.hostname.toLowerCase();
  const blockedHost = hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || hostname.endsWith('.local') || hostname.endsWith('.internal');
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || blockedHost || !hostname.includes('.')) throw new Error('SCRAPEGRAPH_INVALID_URL');
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error('SCRAPEGRAPH_INVALID_URL');
  } catch (error) {
    if (error instanceof Error && error.message === 'SCRAPEGRAPH_INVALID_URL') throw error;
    throw new Error('SCRAPEGRAPH_INVALID_URL');
  }
  return parsed;
}

export async function enrichCompany(url: string): Promise<ScrapeGraphExtraction> {
  const apiKey = scrapeGraphApiKey();
  if (!apiKey) throw new Error('SCRAPEGRAPH_NOT_CONFIGURED');
  const source = await validatePublicUrl(url);
  const response = await fetch(`${scrapeGraphBaseUrl()}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'SGAI-APIKEY': apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    // O novo scraper recebe somente a URL e devolve o contrato Prospectra.
    // Campos adicionais do contrato antigo não são mais enviados.
    body: JSON.stringify({ url: source.toString() }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; json?: unknown; raw?: string };
  if (!response.ok) {
    console.error('prospectra_scraper_error', `HTTP_${response.status}`);
    throw new Error(`SCRAPEGRAPH_FAILED_${response.status}`);
  }
  const data = body.json && typeof body.json === 'object' && !Array.isArray(body.json) ? body.json as Record<string, unknown> : {};
  return { provider: 'Prospectra Web Scraper', requestId: body.id, sourceUrl: source.toString(), extractedAt: new Date().toISOString(), data, raw: typeof body.raw === 'string' ? body.raw : undefined };
}

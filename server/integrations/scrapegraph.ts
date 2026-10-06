import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_BASE_URL = 'https://v2-api.scrapegraphai.com';

export interface ScrapeGraphExtraction {
  provider: 'ScrapeGraphAI';
  requestId?: string;
  sourceUrl: string;
  extractedAt: string;
  data: Record<string, unknown>;
  raw?: string;
}

export function scrapeGraphBaseUrl() {
  return (process.env.SGAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
}

export function scrapeGraphConfigured() {
  return Boolean(process.env.SGAI_API_KEY?.trim());
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

const extractionSchema = {
  type: 'object',
  properties: {
    companyName: { type: 'string' },
    description: { type: 'string' },
    sector: { type: 'string' },
    employees: { type: 'string' },
    signals: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, date: { type: 'string' }, sourceUrl: { type: 'string' } } } },
    publicChannels: { type: 'array', items: { type: 'string' } },
  },
};

export async function enrichCompany(url: string): Promise<ScrapeGraphExtraction> {
  if (!scrapeGraphConfigured()) throw new Error('SCRAPEGRAPH_NOT_CONFIGURED');
  const source = await validatePublicUrl(url);
  const response = await fetch(`${scrapeGraphBaseUrl()}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'SGAI-APIKEY': process.env.SGAI_API_KEY!.trim() },
    body: JSON.stringify({
      url: source.toString(),
      prompt: 'Extraia contexto comercial verificável desta página pública para o CRM Prospectra+. Identifique nome da empresa, descrição, setor, porte aproximado, sinais públicos recentes e canais públicos. Não invente fatos: quando um campo não estiver disponível, deixe-o vazio. Preserve URLs de origem nos sinais quando existirem.',
      schema: extractionSchema,
      fetchConfig: { mode: 'auto', timeout: 30000 },
    }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; json?: unknown; raw?: string };
  if (!response.ok) {
    console.error('prospectra_scrapegraph_error', `HTTP_${response.status}`);
    throw new Error(`SCRAPEGRAPH_FAILED_${response.status}`);
  }
  const data = body.json && typeof body.json === 'object' && !Array.isArray(body.json) ? body.json as Record<string, unknown> : {};
  return { provider: 'ScrapeGraphAI', requestId: body.id, sourceUrl: source.toString(), extractedAt: new Date().toISOString(), data, raw: typeof body.raw === 'string' ? body.raw : undefined };
}

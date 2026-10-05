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

export function validatePublicUrl(value: string): URL {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('SCRAPEGRAPH_INVALID_URL'); }
  const hostname = parsed.hostname.toLowerCase();
  const blockedHost = hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || hostname.endsWith('.local') || hostname.endsWith('.internal');
  const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  if (!['http:', 'https:'].includes(parsed.protocol) || blockedHost || privateIpv4 || !hostname.includes('.')) throw new Error('SCRAPEGRAPH_INVALID_URL');
  return parsed;
}

const extractionSchema = {
  type: 'object',
  properties: {
    companyName: { type: 'string' },
    description: { type: 'string' },
    sector: { type: 'string' },
    employees: { type: 'string' },
    signals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          date: { type: 'string' },
          sourceUrl: { type: 'string' },
        },
      },
    },
    publicChannels: { type: 'array', items: { type: 'string' } },
  },
};

export async function enrichCompany(url: string): Promise<ScrapeGraphExtraction> {
  if (!scrapeGraphConfigured()) throw new Error('SCRAPEGRAPH_NOT_CONFIGURED');
  const source = validatePublicUrl(url);
  const response = await fetch(`${scrapeGraphBaseUrl()}/api/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'SGAI-APIKEY': process.env.SGAI_API_KEY!.trim(),
    },
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
  return {
    provider: 'ScrapeGraphAI',
    requestId: body.id,
    sourceUrl: source.toString(),
    extractedAt: new Date().toISOString(),
    data,
    raw: typeof body.raw === 'string' ? body.raw : undefined,
  };
}

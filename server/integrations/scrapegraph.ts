export interface ScrapeGraphRequest {
  url: string;
  prompt: string;
  outputSchema?: Record<string, unknown>;
}

export interface IntegrationResult<T = unknown> {
  status: 'ok' | 'not_configured' | 'error';
  data?: T;
  detail?: string;
}

function config() {
  return {
    baseUrl: (process.env.SGAI_BASE_URL ?? 'https://api.scrapegraphai.com').replace(/\/$/, ''),
    apiKey: process.env.SGAI_API_KEY,
    scrapePath: process.env.SGAI_SCRAPE_PATH ?? '/v1/scrape',
    healthPath: process.env.SGAI_HEALTH_PATH ?? '/health',
  };
}

export async function scrapeWithGraph(request: ScrapeGraphRequest): Promise<IntegrationResult> {
  const current = config();
  if (!current.apiKey) return { status: 'not_configured', detail: 'SGAI_API_KEY ausente.' };
  const response = await fetch(`${current.baseUrl}${current.scrapePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'SGAI-APIKEY': current.apiKey },
    body: JSON.stringify({ website_url: request.url, user_prompt: request.prompt, output_schema: request.outputSchema }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { status: 'error', detail: `ScrapeGraphAI retornou HTTP ${response.status}.`, data: body };
  return { status: 'ok', data: body };
}

export async function scrapeGraphHealth(): Promise<IntegrationResult> {
  const current = config();
  if (!current.apiKey) return { status: 'not_configured', detail: 'SGAI_API_KEY ausente.' };
  const response = await fetch(`${current.baseUrl}${current.healthPath}`, { headers: { 'SGAI-APIKEY': current.apiKey } });
  return response.ok ? { status: 'ok', detail: 'ScrapeGraphAI respondeu ao health check.' } : { status: 'error', detail: `Health check HTTP ${response.status}.` };
}

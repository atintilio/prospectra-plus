import { requireActiveSession } from '../../_lib/access.js';
import { json, methodNotAllowed } from '../../_lib/http.js';
import { scrapeGraphConfigured, scrapeGraphCredits } from '../../../integrations/scrapegraph.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  const configured = scrapeGraphConfigured();
  if (!configured) return json(res, 200, { provider: 'ScrapeGraphAI', version: 'v2', configured: false, status: 'awaiting_api_key' });
  try {
    const credits = await scrapeGraphCredits();
    return json(res, 200, { provider: 'ScrapeGraphAI', version: 'v2', configured: true, status: credits.remaining === 0 ? 'insufficient_credits' : 'connected', remainingCredits: credits.remaining });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const providerStatus = Number(code.match(/^SCRAPEGRAPH_FAILED_(\d+)$/)?.[1] ?? 0);
    return json(res, 200, { provider: 'ScrapeGraphAI', version: 'v2', configured: true, status: providerStatus === 401 || providerStatus === 403 ? 'invalid_key' : 'provider_unavailable' });
  }
}

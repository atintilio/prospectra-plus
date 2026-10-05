import { json, methodNotAllowed } from '../../_lib/http.js';
import { scrapeGraphBaseUrl, scrapeGraphConfigured } from '../../../server/integrations/scrapegraph.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const configured = scrapeGraphConfigured();
  return json(res, 200, {
    provider: 'ScrapeGraphAI',
    version: 'v2',
    baseUrl: scrapeGraphBaseUrl(),
    configured,
    status: configured ? 'configured' : 'awaiting_api_key',
  });
}

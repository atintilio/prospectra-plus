import { enrichCompany } from '../../../server/integrations/scrapegraph.js';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import { readSession } from '../../_lib/session.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!readSession(req)) return json(res, 401, { error: 'not_authenticated' });
  try {
    const body = parseBody(req);
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) return json(res, 400, { error: 'url_required' });
    const result = await enrichCompany(url);
    return json(res, 200, { ok: true, extraction: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SCRAPEGRAPH_FAILED';
    if (code === 'SCRAPEGRAPH_NOT_CONFIGURED') return json(res, 503, { error: 'scrapegraph_not_configured' });
    if (code === 'SCRAPEGRAPH_INVALID_URL') return json(res, 400, { error: 'invalid_public_url' });
    const match = code.match(/^SCRAPEGRAPH_FAILED_(\d+)$/);
    if (match) return json(res, Number(match[1]) === 402 ? 402 : 502, { error: 'scrapegraph_provider_failed', providerStatus: Number(match[1]) });
    return json(res, 500, { error: 'scrapegraph_request_failed' });
  }
}

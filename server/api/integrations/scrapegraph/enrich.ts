import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { enrichCompany } from '../../../integrations/scrapegraph.js';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (context.user.workspaceMode === 'demo') return json(res, 403, { error: 'demo_external_actions_disabled' });
  if (!requireSameOrigin(req, res)) return;
  try {
    const body = parseBody(req);
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) return json(res, 400, { error: 'url_required' });
    const result = await enrichCompany(url);
    return json(res, 200, { ok: true, extraction: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SCRAPEGRAPH_FAILED';
    if (code === 'SCRAPEGRAPH_NOT_CONFIGURED') return json(res, 503, { error: 'scraper_not_configured' });
    if (code === 'SCRAPEGRAPH_INVALID_URL') return json(res, 400, { error: 'invalid_public_url' });
    const match = code.match(/^SCRAPEGRAPH_FAILED_(\d+)$/);
    if (match) {
      const providerStatus = Number(match[1]);
      return json(res, providerStatus === 401 ? 503 : providerStatus === 402 ? 402 : 502, {
        error: providerStatus === 401 ? 'scraper_auth_failed' : 'scraper_provider_failed',
        providerStatus,
      });
    }
    if (code === 'AbortError' || code.includes('timed out')) return json(res, 504, { error: 'scraper_timeout' });
    return json(res, 502, { error: 'scraper_request_failed' });
  }
}

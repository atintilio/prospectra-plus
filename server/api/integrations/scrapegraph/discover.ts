import { requireOwner, requireSameOrigin } from '../../_lib/access.js';
import { discoverCompanyPeople } from '../../../integrations/scrapegraph.js';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireOwner(req, res);
  if (!context) return;
  if (!requireSameOrigin(req, res)) return;
  try {
    const body = parseBody(req);
    const company = typeof body.company === 'string' ? body.company.trim() : '';
    const domain = typeof body.domain === 'string' ? body.domain.trim() : '';
    if (!company || !domain) return json(res, 400, { error: 'company_and_domain_required' });
    const result = await discoverCompanyPeople(company, domain);
    return json(res, 200, { ok: true, discovery: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SCRAPEGRAPH_FAILED';
    if (code === 'SCRAPEGRAPH_NOT_CONFIGURED') return json(res, 503, { error: 'scrapegraph_not_configured' });
    if (code === 'SCRAPEGRAPH_INVALID_COMPANY' || code === 'SCRAPEGRAPH_INVALID_URL') return json(res, 400, { error: 'invalid_company_or_domain' });
    if (code === 'SCRAPEGRAPH_TIMEOUT') return json(res, 504, { error: 'scrapegraph_timeout' });
    const match = code.match(/^SCRAPEGRAPH_FAILED_(\d+)$/);
    if (match) return json(res, Number(match[1]) === 402 ? 402 : 502, { error: 'scrapegraph_provider_failed', providerStatus: Number(match[1]) });
    return json(res, 502, { error: 'scrapegraph_request_failed' });
  }
}

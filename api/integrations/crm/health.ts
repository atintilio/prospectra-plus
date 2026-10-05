import { crmHealth } from '../../../server/integrations/crm-adapter';
import { json } from '../../_lib/http';
import type { ApiRequest, ApiResponse } from '../../_lib/types';

export default async function handler(_req: ApiRequest, res: ApiResponse) {
  try { const result = await crmHealth(); return json(res, result.status === 'error' ? 502 : 200, result); }
  catch { return json(res, 500, { status: 'error', detail: 'Falha inesperada no health check CRM.' }); }
}

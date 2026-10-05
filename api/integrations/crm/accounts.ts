import { listCrmAccounts } from '../../../server/integrations/crm-adapter';
import { json } from '../../_lib/http';
import { readSession } from '../../_lib/session';
import type { ApiRequest, ApiResponse } from '../../_lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (!readSession(req)) return json(res, 401, { error: 'unauthenticated' });
  try { const result = await listCrmAccounts(); return json(res, result.status === 'error' ? 502 : 200, result); }
  catch { return json(res, 500, { status: 'error', detail: 'Falha inesperada na leitura do CRM.' }); }
}

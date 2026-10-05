import { clearSession } from '../_lib/session';
import { json, methodNotAllowed } from '../_lib/http';
import type { ApiRequest, ApiResponse } from '../_lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  clearSession(res, req);
  return json(res, 200, { ok: true });
}

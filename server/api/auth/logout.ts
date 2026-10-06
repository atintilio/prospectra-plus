import { clearSession } from '../_lib/session.js';
import { json, methodNotAllowed } from '../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../_lib/types.js';

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  clearSession(res, req);
  return json(res, 200, { ok: true });
}

import { ensureAuthSchema } from '../_lib/db';
import { json, methodNotAllowed } from '../_lib/http';
import { readSession } from '../_lib/session';
import type { ApiRequest, ApiResponse } from '../_lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = readSession(req);
  if (!session) return json(res, 401, { error: 'unauthenticated' });
  try {
    const database = await ensureAuthSchema();
    const [rows] = await database.query('SELECT email, role, active FROM prospectra_users WHERE id = ? LIMIT 1', [session.id]) as [Array<Record<string, unknown>>, unknown];
    const user = rows[0];
    if (!user || Number(user.active) !== 1) return json(res, 401, { error: 'unauthenticated' });
    return json(res, 200, { ok: true, user: { email: String(user.email), role: String(user.role) } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AUTH_ME_FAILED';
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: 'auth_not_configured' });
    return json(res, 500, { error: 'auth_me_failed' });
  }
}

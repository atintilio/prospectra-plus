import { ensureAuthSchema } from '../_lib/db';
import { verifyPassword } from '../_lib/crypto';
import { json, methodNotAllowed, parseBody } from '../_lib/http';
import { issueSession } from '../_lib/session';
import type { ApiRequest, ApiResponse } from '../_lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = parseBody(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) return json(res, 400, { error: 'invalid_credentials' });
    const database = await ensureAuthSchema();
    const [rows] = await database.query('SELECT id, email, role, active, password_hash FROM prospectra_users WHERE email = ? LIMIT 1', [email]) as [Array<Record<string, unknown>>, unknown];
    const user = rows[0];
    if (!user || Number(user.active) !== 1 || typeof user.password_hash !== 'string' || !verifyPassword(password, user.password_hash)) return json(res, 401, { error: 'invalid_credentials' });
    issueSession(res, req, { id: String(user.id), email: String(user.email), role: String(user.role) === 'operator' ? 'operator' : 'master' });
    return json(res, 200, { ok: true, user: { email: String(user.email), role: String(user.role) } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AUTH_LOGIN_FAILED';
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: 'auth_not_configured' });
    return json(res, 500, { error: 'auth_login_failed' });
  }
}

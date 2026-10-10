import { loadAuthStore } from '../_lib/db.js';
import { verifyPassword } from '../_lib/crypto.js';
import { json, methodNotAllowed, parseBody } from '../_lib/http.js';
import { issueSession, isDemoRequest } from '../_lib/session.js';
import { clearLoginFailures, loginLockStatus, recordFailedLogin } from '../_lib/login-lockout.js';
import type { ApiRequest, ApiResponse } from '../_lib/types.js';
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = parseBody(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) return json(res, 400, { error: 'invalid_credentials' });
    const demo = isDemoRequest(req);
    const store = await loadAuthStore();
    const user = store.users.find((item) => item.email === email && (item.workspaceMode === 'demo') === demo);
    if (!user || !user.active || !user.passwordHash) return json(res, 401, { error: 'invalid_credentials' });
    const lockedForMs = await loginLockStatus(email, demo);
    if (lockedForMs > 0) {
      const retryAfterSeconds = Math.ceil(lockedForMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return json(res, 423, { error: 'account_temporarily_locked', retryAfterSeconds });
    }
    if (!verifyPassword(password, user.passwordHash)) {
      const failure = await recordFailedLogin(email, demo);
      if (failure.lockedForMs > 0) {
        const retryAfterSeconds = Math.ceil(failure.lockedForMs / 1000);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return json(res, 423, { error: 'account_temporarily_locked', retryAfterSeconds });
      }
      return json(res, 401, { error: 'invalid_credentials', attemptsRemaining: Math.max(0, 4 - failure.failures) });
    }
    await clearLoginFailures(email, demo);
    issueSession(res, req, { id: user.id, email: user.email, name: user.name, role: user.role, teamId: user.teamId, workspaceMode: user.workspaceMode, sessionVersion: user.sessionVersion });
    return json(res, 200, { ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, teamId: user.teamId, workspaceMode: user.workspaceMode } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AUTH_LOGIN_FAILED';
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: 'auth_not_configured' });
    return json(res, 500, { error: 'auth_login_failed' });
  }
}

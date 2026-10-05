import { randomUUID } from 'node:crypto';
import { ensureAuthSchema } from '../_lib/db';
import { digestToken, hashPassword, validatePassword } from '../_lib/crypto';
import { json, methodNotAllowed, parseBody } from '../_lib/http';
import { issueSession } from '../_lib/session';
import type { ApiRequest, ApiResponse } from '../_lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = parseBody(req);
    const token = typeof body.token === 'string' ? body.token : '';
    const password = body.password;
    const passwordError = validatePassword(password);
    if (!token || passwordError) return json(res, 400, { error: passwordError ?? 'invalid_token' });
    const database = await ensureAuthSchema();
    const connection = await database.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(`SELECT r.id AS reset_id, r.user_id, u.email, u.role
        FROM prospectra_password_resets r JOIN prospectra_users u ON u.id = r.user_id
        WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > UTC_TIMESTAMP(3) AND u.active = 1 LIMIT 1`, [digestToken(token)]) as [Array<Record<string, unknown>>, unknown];
      const reset = rows[0];
      if (!reset) { await connection.rollback(); return json(res, 400, { error: 'invalid_or_expired_token' }); }
      await connection.query('UPDATE prospectra_users SET password_hash = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?', [hashPassword(password as string), String(reset.user_id)]);
      await connection.query('UPDATE prospectra_password_resets SET used_at = UTC_TIMESTAMP(3) WHERE id = ?', [String(reset.reset_id)]);
      await connection.query('DELETE FROM prospectra_password_resets WHERE user_id = ? AND id <> ?', [String(reset.user_id), String(reset.reset_id)]);
      await connection.commit();
      issueSession(res, req, { id: String(reset.user_id), email: String(reset.email), role: String(reset.role) === 'operator' ? 'operator' : 'master' });
      return json(res, 200, { ok: true });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PASSWORD_SET_FAILED';
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: 'auth_not_configured' });
    return json(res, 500, { error: 'password_set_failed' });
  }
}

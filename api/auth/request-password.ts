import { randomUUID } from 'node:crypto';
import { ensureAuthSchema } from '../_lib/db';
import { digestToken, randomToken } from '../_lib/crypto';
import { json, methodNotAllowed, parseBody, publicOrigin } from '../_lib/http';
import { sendPasswordSetupEmail } from '../_lib/mailer';
import type { ApiRequest, ApiResponse } from '../_lib/types';

const MASTER_EMAIL = (process.env.MASTER_USER_EMAIL ?? 'atintilio@argusprime.com.br').trim().toLowerCase();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = parseBody(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) return json(res, 400, { error: 'invalid_email' });
    // Resposta indistinguível para endereços não autorizados evita enumeração de usuários.
    if (email !== MASTER_EMAIL) return json(res, 200, { ok: true, message: 'Se o endereço estiver autorizado, você receberá um link.' });
    const database = await ensureAuthSchema();
    const [rows] = await database.query('SELECT id FROM prospectra_users WHERE email = ? LIMIT 1', [email]) as [Array<Record<string, unknown>>, unknown];
    const userId = rows[0]?.id ? String(rows[0].id) : randomUUID();
    if (!rows[0]) await database.query('INSERT INTO prospectra_users (id, email, password_hash, role, active, created_at, updated_at) VALUES (?, ?, NULL, ?, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))', [userId, email, 'master']);
    const rawToken = randomToken();
    await database.query('DELETE FROM prospectra_password_resets WHERE user_id = ? OR expires_at < UTC_TIMESTAMP(3)', [userId]);
    await database.query('INSERT INTO prospectra_password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE), UTC_TIMESTAMP(3))', [randomUUID(), userId, digestToken(rawToken)]);
    const setupUrl = `${publicOrigin(req)}/definir-senha?token=${encodeURIComponent(rawToken)}`;
    try {
      await sendPasswordSetupEmail(email, setupUrl);
    } catch (error) {
      await database.query('DELETE FROM prospectra_password_resets WHERE token_hash = ?', [digestToken(rawToken)]);
      const code = error instanceof Error ? error.message : 'EMAIL_SEND_FAILED';
      if (code.includes('EMAIL_NOT_CONFIGURED')) return json(res, 503, { error: 'email_not_configured' });
      return json(res, 502, { error: 'email_provider_failed' });
    }
    return json(res, 200, { ok: true, message: 'Se o endereço estiver autorizado, você receberá um link.' });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PASSWORD_REQUEST_FAILED';
    if (code.includes('NOT_CONFIGURED')) return json(res, 503, { error: 'auth_not_configured' });
    return json(res, 500, { error: 'password_request_failed' });
  }
}

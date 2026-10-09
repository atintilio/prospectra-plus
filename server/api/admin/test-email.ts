import { requireOwner, requireSameOrigin } from '../_lib/access.js';
import { json, methodNotAllowed, parseBody } from '../_lib/http.js';
import { sendTestEmail } from '../_lib/mailer.js';
import type { ApiRequest, ApiResponse } from '../_lib/types.js';

const ALLOWED = new Set(['atintilio@argusprime.com.br', 'atintilio@gmail.com']);

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const owner = await requireOwner(req, res);
  if (!owner || !requireSameOrigin(req, res)) return;
  const body = parseBody(req);
  const recipients = Array.isArray(body.recipients) ? [...new Set(body.recipients.filter((value): value is string => typeof value === 'string').map(value => value.trim().toLowerCase()))] : [];
  if (!recipients.length || recipients.length > ALLOWED.size || recipients.some(recipient => !ALLOWED.has(recipient))) return json(res, 400, { error: 'invalid_test_recipients' });
  try {
    await sendTestEmail(recipients);
    return json(res, 202, { ok: true, recipients, status: 'accepted' });
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : 'test_email_failed' });
  }
}

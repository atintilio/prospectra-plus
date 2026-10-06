import { randomUUID, timingSafeEqual } from 'node:crypto';
import { json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import { markProspectingConnection } from '../../_lib/prospecting.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

function sameSecret(candidate: string | undefined, expected: string | undefined): boolean {
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const token = Array.isArray(req.query?.token) ? req.query?.token[0] : req.query?.token;
  if (!sameSecret(token, process.env.UNIPILE_WEBHOOK_SECRET?.trim())) return json(res, 401, { error: 'invalid_webhook_token' });
  try {
    const body = parseBody(req);
    const [userId, rawChannel] = typeof body.name === 'string' ? body.name.split(':', 2) : [];
    const channel = rawChannel === 'whatsapp' ? 'whatsapp' : rawChannel === 'linkedin' ? 'linkedin' : null;
    const providerAccountId = typeof body.account_id === 'string' ? body.account_id : undefined;
    const status = typeof body.status === 'string' ? body.status : '';
    if (!userId || !channel || !providerAccountId) return json(res, 400, { error: 'invalid_webhook_payload' });
    const connectionStatus = status === 'CREATION_SUCCESS' || status === 'RECONNECTED' ? 'connected' : status.includes('CREDENTIALS') ? 'reconnect_required' : 'failed';
    await markProspectingConnection({ id: randomUUID(), provider: 'unipile', userId, providerAccountId, channel, status: connectionStatus, lastError: connectionStatus === 'failed' ? status.slice(0, 120) : undefined });
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 500, { error: 'prospecting_webhook_failed' });
  }
}

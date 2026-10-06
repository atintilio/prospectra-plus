import { timingSafeEqual } from 'node:crypto';
import { header, json, methodNotAllowed, parseBody } from '../../_lib/http.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

function sameSecret(provided: string | undefined, expected: string | undefined) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  if (!sameSecret(header(req, 'x-prospectra-webhook-secret'), secret)) return json(res, 401, { error: 'invalid_webhook_secret' });
  const body = parseBody(req);
  const event = typeof body.event === 'string' ? body.event : 'unknown';
  const instance = typeof body.instance === 'string' ? body.instance : undefined;
  console.info('prospectra_evolution_webhook', JSON.stringify({ event, instance, receivedAt: new Date().toISOString() }));
  return json(res, 200, { ok: true, accepted: true });
}

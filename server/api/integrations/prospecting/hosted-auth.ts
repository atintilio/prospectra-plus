import { randomUUID } from 'node:crypto';
import { requireActiveSession, requireSameOrigin } from '../../_lib/access.js';
import { json, methodNotAllowed, parseBody, publicOrigin } from '../../_lib/http.js';
import { markProspectingConnection } from '../../_lib/prospecting.js';
import type { ApiRequest, ApiResponse } from '../../_lib/types.js';

function unipileConfig() {
  const dsn = process.env.UNIPILE_DSN?.trim().replace(/\/$/, '');
  const apiKey = process.env.UNIPILE_API_KEY?.trim();
  const webhookSecret = process.env.UNIPILE_WEBHOOK_SECRET?.trim();
  if (!dsn || !apiKey || !webhookSecret) throw new Error('UNIPILE_NOT_CONFIGURED');
  try {
    const url = new URL(dsn);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalid');
  } catch {
    throw new Error('UNIPILE_NOT_CONFIGURED');
  }
  return { dsn, apiKey, webhookSecret };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const context = await requireActiveSession(req, res);
  if (!context) return;
  if (!requireSameOrigin(req, res)) return;
  try {
    const body = parseBody(req);
    const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'linkedin';
    const provider = channel === 'linkedin' ? 'LINKEDIN' : 'WHATSAPP';
    const config = unipileConfig();
    const origin = publicOrigin(req);
    const expiresOn = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const notifyUrl = `${origin}/api/integrations/prospecting/unipile-webhook?token=${encodeURIComponent(config.webhookSecret)}`;
    const response = await fetch(`${config.dsn}/api/v1/hosted/accounts/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-KEY': config.apiKey },
      body: JSON.stringify({ type: 'create', providers: [provider], api_url: config.dsn, expiresOn, success_redirect_url: `${origin}/configuracoes?connection=success`, failure_redirect_url: `${origin}/configuracoes?connection=failed`, notify_url: notifyUrl, name: `${context.user.id}:${channel}` }),
    });
    const payload = await response.json().catch(() => ({})) as { url?: unknown };
    if (!response.ok || typeof payload.url !== 'string' || !payload.url.startsWith('http')) throw new Error(`UNIPILE_HOSTED_AUTH_${response.status}`);
    await markProspectingConnection({ id: randomUUID(), provider: 'unipile', userId: context.user.id, channel, status: 'pending' });
    return json(res, 200, { ok: true, url: payload.url, expiresOn });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNIPILE_HOSTED_AUTH_FAILED';
    if (code === 'UNIPILE_NOT_CONFIGURED') return json(res, 503, { error: 'unipile_not_configured' });
    return json(res, 502, { error: 'unipile_hosted_auth_failed' });
  }
}

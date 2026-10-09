import { createHmac, createHash } from 'node:crypto';
export type LoginState = { status: 'disconnected' | 'starting' | 'awaiting_login' | 'authenticated' | 'expired' | 'failed' | 'busy' | 'unavailable'; viewerUrl?: string; expiresAt?: string; detail?: string };
export function loginGatewayConfig() {
  const key = process.env.LINKEDIN_LOGIN_GATEWAY_TOKEN?.trim();
  const scraperKey = process.env.SCRAPER_API_KEY?.trim() || process.env.SGAI_API_KEY?.trim();
  const base = process.env.LINKEDIN_LOGIN_GATEWAY_URL?.trim() || `${(process.env.SCRAPER_BASE_URL?.trim() || 'https://scraper.prospectra.argusprime.com.br').replace(/\/$/, '')}/linkedin-login`;
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('gateway_not_configured');
  const token = key || (scraperKey ? createHmac('sha256', scraperKey).update('prospectra-linkedin-login-v1').digest('hex') : '');
  if (!token) throw new Error('gateway_not_configured');
  return { base: base.replace(/\/$/, ''), token };
}
export function validateLoginState(value: unknown, base: string): LoginState {
  const p = value as LoginState;
  if (!p || !['disconnected','starting','awaiting_login','authenticated','expired','failed','busy','unavailable'].includes(p.status)) throw new Error('invalid_gateway_response');
  const result: LoginState = { status: p.status };
  if (p.expiresAt && Number.isFinite(Date.parse(p.expiresAt))) result.expiresAt = p.expiresAt;
  if (p.viewerUrl && p.status === 'awaiting_login') {
    const url = new URL(p.viewerUrl);
    const allowed = new URL(base);
    if (url.protocol !== 'https:' || url.origin !== allowed.origin || !url.pathname.startsWith(`${allowed.pathname}/view/`) || url.username || url.password) throw new Error('invalid_viewer_url');
    result.viewerUrl = url.toString();
  }
  return result;
}
export async function linkedinLogin(userId: string, method: 'GET' | 'POST' | 'DELETE'): Promise<LoginState> {
  const config = loginGatewayConfig();
  const id = createHash('sha256').update(userId).digest('hex');
  const response = await fetch(`${config.base}/api/session/${id}`, { method, headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
  if (!response.ok) throw new Error('gateway_unavailable');
  return validateLoginState(await response.json(), config.base);
}

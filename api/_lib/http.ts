import type { ApiRequest, ApiResponse } from './types';

export function json(res: ApiResponse, status: number, body: unknown) { res.status(status).json(body); }
export function methodNotAllowed(res: ApiResponse, allowed: string[]) { res.setHeader('Allow', allowed); json(res, 405, { error: 'method_not_allowed' }); }
export function parseBody(req: ApiRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) as Record<string, unknown>; } catch { return {}; } }
  return {};
}
export function header(req: ApiRequest, name: string): string | undefined { const value = req.headers[name.toLowerCase()] ?? req.headers[name]; return Array.isArray(value) ? value[0] : value; }
export function publicOrigin(req: ApiRequest): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const forwardedHost = header(req, 'x-forwarded-host') ?? header(req, 'host');
  const forwardedProto = header(req, 'x-forwarded-proto') ?? 'https';
  if (!forwardedHost) throw new Error('PUBLIC_APP_URL_NOT_CONFIGURED');
  return `${forwardedProto.split(',')[0].trim()}://${forwardedHost.split(',')[0].trim()}`;
}
export function isLocalRequest(req: ApiRequest): boolean { const host = header(req, 'host') ?? ''; return host.startsWith('localhost') || host.startsWith('127.0.0.1'); }
export function setCookie(res: ApiResponse, name: string, value: string, maxAge: number, local = false) { const sameSite = local ? 'Lax' : 'None'; const secure = local ? '' : '; Secure'; res.setHeader('Set-Cookie', `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secure}`); }
export function clearCookie(res: ApiResponse, name: string, local = false) { setCookie(res, name, '', 0, local); }

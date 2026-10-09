import { createHmac, timingSafeEqual } from 'node:crypto';
import { clearCookie, header, isLocalRequest, setCookie } from './http.js';
import type { ApiRequest, ApiResponse, AuthUser } from './types.js';
export const SESSION_COOKIE = 'prospectra_session';
export const DEMO_SESSION_COOKIE = 'prospectra_demo_session';
export function isDemoRequest(req: ApiRequest): boolean { return header(req, 'x-prospectra-session') === 'demo'; }
const MAX_AGE = 60 * 60 * 24 * 30;
type SessionPayload = AuthUser & { exp: number };
function secret(): string { if (!process.env.AUTH_SECRET) throw new Error('AUTH_SECRET_NOT_CONFIGURED'); return process.env.AUTH_SECRET; }
function encode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function decode<T>(value: string): T { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T; }
function sign(value: string): string { return createHmac('sha256', secret()).update(value).digest('base64url'); }
export function issueSession(res: ApiResponse, req: ApiRequest, user: AuthUser) { const payload: SessionPayload = { ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE }; const body = encode(payload); setCookie(res, user.workspaceMode === 'demo' ? DEMO_SESSION_COOKIE : SESSION_COOKIE, `${body}.${sign(body)}`, MAX_AGE, isLocalRequest(req)); }
export function clearSession(res: ApiResponse, req: ApiRequest) { clearCookie(res, isDemoRequest(req) ? DEMO_SESSION_COOKIE : SESSION_COOKIE, isLocalRequest(req)); }
export function readSession(req: ApiRequest): AuthUser | null { const cookieName = isDemoRequest(req) ? DEMO_SESSION_COOKIE : SESSION_COOKIE; const cookie = header(req, 'cookie') ?? ''; const match = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`)); const value = match?.slice(`${cookieName}=`.length); if (!value) return null; const [body, signature] = value.split('.'); if (!body || !signature) return null; try { const expected = sign(body); const valid = expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); if (!valid) return null; const payload = decode<SessionPayload>(body); if (isDemoRequest(req) !== (payload.workspaceMode === 'demo')) return null; if (!payload.id || !payload.email || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) return null; return { id: payload.id, email: payload.email, name: payload.name, role: payload.role, teamId: payload.teamId, workspaceMode: payload.workspaceMode }; } catch { return null; } }

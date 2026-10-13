import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import type { ApiRequest, ApiResponse } from '../api/_lib/types.js';
import { header, isLocalRequest, publicOrigin } from '../api/_lib/http.js';

const STATE_COOKIE = 'prospectra_linkedin_state';
const STATE_TTL_SECONDS = 10 * 60;
const SCOPES = 'openid profile email';

export type LinkedInProfile = {
  subject: string;
  name: string;
  email?: string;
  picture?: string;
  connectedAt: string;
};

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error('AUTH_SECRET_NOT_CONFIGURED');
  return value;
}

function credentials(req: ApiRequest) {
  const clientId = process.env.LINKEDIN_OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_OIDC_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('LINKEDIN_OIDC_NOT_CONFIGURED');
  const origin = publicOrigin(req);
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' && !isLocalRequest(req)) throw new Error('INVALID_PUBLIC_ORIGIN');
  return { clientId, clientSecret, redirectUri: `${parsed.origin}/api/integrations/linkedin/callback` };
}

export function linkedinOidcConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_OIDC_CLIENT_ID?.trim() && process.env.LINKEDIN_OIDC_CLIENT_SECRET?.trim());
}

function connectionPath(userId: string): string {
  return `prospectra/linkedin-oidc/${createHash('sha256').update(userId).digest('hex')}.json`;
}

export async function readLinkedInProfile(userId: string): Promise<LinkedInProfile | null> {
  const blob = await get(connectionPath(userId), { access: 'private', useCache: false });
  if (!blob) return null;
  if (blob.statusCode !== 200) throw new Error('LINKEDIN_CONNECTION_NOT_READABLE');
  const value = JSON.parse(await new Response(blob.stream).text()) as Partial<LinkedInProfile>;
  if (typeof value.subject !== 'string' || !value.subject || typeof value.name !== 'string' || typeof value.connectedAt !== 'string') throw new Error('INVALID_LINKEDIN_CONNECTION');
  return { subject: value.subject, name: value.name, email: value.email, picture: value.picture, connectedAt: value.connectedAt };
}

export async function removeLinkedInProfile(userId: string): Promise<void> {
  await del(connectionPath(userId));
}

function cookie(req: ApiRequest, value: string, maxAge: number): string {
  return `${STATE_COOKIE}=${value}; Path=/api/integrations/linkedin; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${isLocalRequest(req) ? '' : '; Secure'}`;
}

function stateSignature(body: string): string {
  return createHmac('sha256', secret()).update(`linkedin-oidc:${body}`).digest('base64url');
}

export function createLinkedInAuthorization(req: ApiRequest, res: ApiResponse, userId: string): string {
  const { clientId, redirectUri } = credentials(req);
  const state = randomBytes(32).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, state, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 })).toString('base64url');
  res.setHeader('Set-Cookie', cookie(req, `${payload}.${stateSignature(payload)}`, STATE_TTL_SECONDS));
  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SCOPES);
  return url.toString();
}

export function consumeLinkedInState(req: ApiRequest, res: ApiResponse, userId: string, returnedState: string): boolean {
  res.setHeader('Set-Cookie', cookie(req, '', 0));
  const raw = header(req, 'cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${STATE_COOKIE}=`))?.slice(STATE_COOKIE.length + 1);
  if (!raw || !returnedState) return false;
  const [body, signature] = raw.split('.');
  if (!body || !signature) return false;
  const expected = stateSignature(body);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { userId?: string; state?: string; expiresAt?: number };
    return payload.userId === userId && payload.state === returnedState && typeof payload.expiresAt === 'number' && payload.expiresAt > Date.now();
  } catch { return false; }
}

export async function exchangeLinkedInCode(req: ApiRequest, code: string): Promise<LinkedInProfile> {
  const { clientId, clientSecret, redirectUri } = credentials(req);
  const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenResponse.ok) throw new Error('LINKEDIN_TOKEN_EXCHANGE_FAILED');
  const tokens = await tokenResponse.json() as { access_token?: string };
  if (!tokens.access_token) throw new Error('LINKEDIN_TOKEN_MISSING');
  const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!profileResponse.ok) throw new Error('LINKEDIN_PROFILE_FAILED');
  const value = await profileResponse.json() as { sub?: unknown; name?: unknown; email?: unknown; picture?: unknown };
  if (typeof value.sub !== 'string' || !value.sub || typeof value.name !== 'string' || !value.name) throw new Error('LINKEDIN_PROFILE_INVALID');
  return {
    subject: value.sub.slice(0, 200),
    name: value.name.slice(0, 200),
    email: typeof value.email === 'string' ? value.email.slice(0, 320) : undefined,
    picture: typeof value.picture === 'string' && value.picture.startsWith('https://') ? value.picture.slice(0, 1000) : undefined,
    connectedAt: new Date().toISOString(),
  };
}

export async function saveLinkedInProfile(userId: string, profile: LinkedInProfile): Promise<void> {
  await put(connectionPath(userId), JSON.stringify(profile), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json', cacheControlMaxAge: 60,
  });
}

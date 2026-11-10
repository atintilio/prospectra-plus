import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';
import { buildCampaignMessage } from '@/lib/email-message';

const SCOPES = 'offline_access User.Read Mail.Send';
export const STATE_COOKIE = 'prospectra_office365_state';
export const STATE_TTL_SECONDS = 600;
type Scope = { orgId: string; userId: string; sessionId: string };

export async function canUseOffice365(db: DB, scope: Pick<Scope, 'orgId' | 'userId'>): Promise<boolean> {
  const [row] = await db.select({
    orgActive: schema.orgs.active,
    orgDemo: schema.orgs.isDemo,
    userStatus: schema.users.status,
    platformRole: schema.users.platformRole,
    memberUserId: schema.memberships.userId,
  }).from(schema.users)
    .innerJoin(schema.orgs, eq(schema.orgs.id, scope.orgId))
    .leftJoin(schema.memberships, and(eq(schema.memberships.orgId, schema.orgs.id), eq(schema.memberships.userId, schema.users.id)))
    .where(eq(schema.users.id, scope.userId)).limit(1);
  return Boolean(row?.orgActive && !row.orgDemo && row.userStatus === 'active' && (row.platformRole === 'admin' || row.memberUserId));
}

export async function assertOffice365Access(db: DB, scope: Pick<Scope, 'orgId' | 'userId'>): Promise<void> {
  if (!(await canUseOffice365(db, scope))) throw new Error('OFFICE365_ACCESS_DENIED');
}

export function office365Config() {
  const tenant = process.env.OFFICE365_TENANT_ID?.trim() || process.env.MS_TENANT_ID?.trim();
  const clientId = process.env.OFFICE365_CLIENT_ID?.trim() || process.env.MS_CLIENT_ID?.trim();
  const clientSecret = process.env.OFFICE365_CLIENT_SECRET?.trim() || process.env.MS_CLIENT_SECRET?.trim();
  const redirectUri = process.env.OFFICE365_REDIRECT_URI?.trim() || (process.env.PUBLIC_APP_URL?.trim() ? `${process.env.PUBLIC_APP_URL.trim().replace(/\/$/, '')}/api/integrations/office365/callback` : '');
  const tokenKey = process.env.OFFICE365_TOKEN_KEY?.trim();
  return tenant && clientId && clientSecret && redirectUri && tokenKey && tokenKey.length >= 32
    ? { tenant, clientId, clientSecret, redirectUri, tokenKey } : null;
}

function key() {
  const config = office365Config();
  if (!config) throw new Error('OFFICE365_CONNECTION_NOT_CONFIGURED');
  return createHash('sha256').update(config.tokenKey).digest();
}

export function encryptToken(token: string, scope: Pick<Scope, 'orgId' | 'userId'>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`${scope.orgId}:${scope.userId}`));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(x => x.toString('base64url')).join('.');
}

export function decryptToken(value: string, scope: Pick<Scope, 'orgId' | 'userId'>): string {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('OFFICE365_TOKEN_INVALID');
  const [iv, tag, encrypted] = parts.map(x => Buffer.from(x, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16) throw new Error('OFFICE365_TOKEN_INVALID');
  const cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(`${scope.orgId}:${scope.userId}`));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
}

function stateSignature(payload: string, scope: Scope) {
  return createHmac('sha256', key()).update(`${scope.sessionId}:${payload}`).digest('base64url');
}

export function createState(scope: Scope) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const payload = Buffer.from(JSON.stringify({ state, verifier, orgId: scope.orgId, userId: scope.userId, exp: Date.now() + STATE_TTL_SECONDS * 1000 })).toString('base64url');
  return { state, challenge, cookie: `${payload}.${stateSignature(payload, scope)}` };
}

export function verifyState(cookie: string | undefined, state: string, scope: Scope): string | null {
  if (!cookie || !state) return null;
  const [payload, signature] = cookie.split('.');
  if (!payload || !signature) return null;
  const a = Buffer.from(stateSignature(payload, scope));
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { state: string; verifier: string; orgId: string; userId: string; exp: number };
    return data.state === state && data.orgId === scope.orgId && data.userId === scope.userId && data.exp > Date.now() && typeof data.verifier === 'string' ? data.verifier : null;
  } catch { return null; }
}

export function authorizeUrl(state: string, challenge: string) {
  const config = office365Config();
  if (!config) throw new Error('OFFICE365_CONNECTION_NOT_CONFIGURED');
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenant)}/oauth2/v2.0/authorize`);
  for (const [k, v] of Object.entries({ client_id: config.clientId, response_type: 'code', redirect_uri: config.redirectUri, response_mode: 'query', scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256' })) url.searchParams.set(k, v);
  return url.toString();
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number };
async function tokenRequest(tenant: string, body: URLSearchParams): Promise<TokenResponse> {
  const config = office365Config();
  if (!config) throw new Error('OFFICE365_CONNECTION_NOT_CONFIGURED');
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('scope', SCOPES);
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`OFFICE365_TOKEN_FAILED_${response.status}`);
  return response.json() as Promise<TokenResponse>;
}

export async function connect(code: string, verifier: string, scope: Scope, db: DB) {
  await assertOffice365Access(db, scope);
  const config = office365Config();
  if (!config) throw new Error('OFFICE365_CONNECTION_NOT_CONFIGURED');
  const token = await tokenRequest(config.tenant, new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: config.redirectUri }));
  if (!token.access_token || !token.refresh_token || !token.expires_in) throw new Error('OFFICE365_TOKEN_INCOMPLETE');
  const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`OFFICE365_PROFILE_FAILED_${response.status}`);
  const profile = await response.json() as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string };
  if (!profile.id || !(profile.mail || profile.userPrincipalName)) throw new Error('OFFICE365_PROFILE_INVALID');
  const claims = JSON.parse(Buffer.from(token.access_token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { tid?: string };
  if (!claims.tid || !/^[0-9a-f-]{36}$/i.test(claims.tid)) throw new Error('OFFICE365_TENANT_INVALID');
  const now = new Date();
  const values = { tenantId: claims.tid, microsoftUserId: profile.id, email: profile.mail || profile.userPrincipalName!, name: profile.displayName || '', accessToken: encryptToken(token.access_token, scope), refreshToken: encryptToken(token.refresh_token, scope), expiresAt: new Date(now.getTime() + token.expires_in * 1000), refreshLockUntil: null, updatedAt: now };
  await db.insert(schema.office365Connections).values({ orgId: scope.orgId, userId: scope.userId, ...values }).onConflictDoUpdate({ target: [schema.office365Connections.orgId, schema.office365Connections.userId], set: { ...values, connectedAt: now } });
}

export async function status(scope: Pick<Scope, 'orgId' | 'userId'>, db: DB) {
  if (!(await canUseOffice365(db, scope))) return { status: 'disconnected' };
  if (!office365Config()) return { status: 'configuration_required' };
  const [row] = await db.select({ email: schema.office365Connections.email, name: schema.office365Connections.name, connectedAt: schema.office365Connections.connectedAt }).from(schema.office365Connections).where(and(eq(schema.office365Connections.orgId, scope.orgId), eq(schema.office365Connections.userId, scope.userId))).limit(1);
  return row ? { status: 'connected', email: row.email, name: row.name, connectedAt: row.connectedAt.toISOString() } : { status: 'disconnected' };
}

export async function disconnect(scope: Pick<Scope, 'orgId' | 'userId'>, db: DB) {
  await db.delete(schema.office365Connections).where(and(eq(schema.office365Connections.orgId, scope.orgId), eq(schema.office365Connections.userId, scope.userId)));
}

async function accessToken(scope: Pick<Scope, 'orgId' | 'userId'>, db: DB): Promise<string> {
  const table = schema.office365Connections;
  // Aguarda o refresh de outro request até o fim da janela de lock (20 s).
  for (let attempt = 0; attempt < 50; attempt++) {
    const [row] = await db.select().from(table).where(and(eq(table.orgId, scope.orgId), eq(table.userId, scope.userId))).limit(1);
    if (!row) throw new Error('OFFICE365_ACCOUNT_NOT_CONNECTED');
    if (row.expiresAt.getTime() > Date.now() + 120000) return decryptToken(row.accessToken, scope);
    const now = new Date();
    const lockUntil = new Date(now.getTime() + 20000);
    const [claimed] = await db.update(table).set({ refreshLockUntil: lockUntil }).where(and(eq(table.id, row.id), or(isNull(table.refreshLockUntil), lt(table.refreshLockUntil, now)))).returning({ id: table.id });
    if (!claimed) { await new Promise(resolve => setTimeout(resolve, 500)); continue; }
    try {
      const token = await tokenRequest(row.tenantId, new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptToken(row.refreshToken, scope) }));
      if (!token.access_token || !token.expires_in) throw new Error('OFFICE365_REFRESH_INCOMPLETE');
      const [saved] = await db.update(table).set({ accessToken: encryptToken(token.access_token, scope), refreshToken: encryptToken(token.refresh_token || decryptToken(row.refreshToken, scope), scope), expiresAt: new Date(Date.now() + token.expires_in * 1000), refreshLockUntil: null, updatedAt: new Date() }).where(and(eq(table.id, row.id), eq(table.refreshLockUntil, lockUntil))).returning({ id: table.id });
      if (!saved) throw new Error('OFFICE365_CONNECTION_CHANGED');
      return token.access_token;
    } catch (error) {
      await db.update(table).set({ refreshLockUntil: null }).where(and(eq(table.id, row.id), eq(table.refreshLockUntil, lockUntil)));
      throw error;
    }
  }
  throw new Error('OFFICE365_REFRESH_BUSY');
}

export async function sendCampaignEmail(db: DB, scope: Pick<Scope, 'orgId' | 'userId'>, to: string, subject: string, body: string) {
  await assertOffice365Access(db, scope);
  const token = await accessToken(scope, db);
  const [sender] = await db.select({ signature: schema.users.emailSignature }).from(schema.users).where(eq(schema.users.id, scope.userId));
  const [image] = await db.select({ contentType: schema.userSignatureImages.contentType, data: schema.userSignatureImages.data })
    .from(schema.userSignatureImages).where(eq(schema.userSignatureImages.userId, scope.userId));
  const message = buildCampaignMessage({ to, subject, body, signature: sender?.signature, image });
  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, saveToSentItems: true }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`OFFICE365_SEND_FAILED_${response.status}`);
}

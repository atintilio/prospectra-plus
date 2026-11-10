import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema } from '@/db';
import { testDb, seedOrg } from './helpers';
import { assertOffice365Access, authorizeUrl, connect, createState, decryptToken, disconnect, encryptToken, sendCampaignEmail, status, verifyState } from '@/lib/office365/connection';

const keys = ['OFFICE365_TENANT_ID', 'OFFICE365_CLIENT_ID', 'OFFICE365_CLIENT_SECRET', 'OFFICE365_REDIRECT_URI', 'OFFICE365_TOKEN_KEY'] as const;
const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
beforeEach(() => {
  process.env.OFFICE365_TENANT_ID = 'organizations';
  process.env.OFFICE365_CLIENT_ID = 'client';
  process.env.OFFICE365_CLIENT_SECRET = 'secret';
  process.env.OFFICE365_REDIRECT_URI = 'https://prospectra.test/api/integrations/office365/callback';
  process.env.OFFICE365_TOKEN_KEY = 'a-secret-key-with-at-least-32-characters';
});
afterEach(() => { for (const key of keys) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key]!; vi.unstubAllGlobals(); });

it('binds signed PKCE state to the session and encrypts tokens for one org/user', () => {
  const scope = { orgId: 'org-a', userId: 'user-a', sessionId: 'session-a' };
  const state = createState(scope);
  const url = new URL(authorizeUrl(state.state, state.challenge));
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('scope')).toContain('Mail.Send');
  expect(verifyState(state.cookie, state.state, scope)).toBeTruthy();
  expect(verifyState(state.cookie, state.state, { ...scope, sessionId: 'another-session' })).toBeNull();
  const encrypted = encryptToken('sensitive-token', scope);
  expect(encrypted).not.toContain('sensitive-token');
  expect(decryptToken(encrypted, scope)).toBe('sensitive-token');
  expect(() => decryptToken(encrypted, { ...scope, userId: 'another-user' })).toThrow();
});

it('stores only encrypted delegated tokens, sends as /me, and stops sending after disconnect', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Office 365');
  const scope = { orgId: org.id, userId: user.id, sessionId: 'session-a' };
  const tenant = '11111111-1111-1111-1111-111111111111';
  const access = `x.${Buffer.from(JSON.stringify({ tid: tenant })).toString('base64url')}.x`;
  const calls: string[] = [];
  let tokenCalls = 0;
  let sentBody = '';
  await db.update(schema.users).set({ emailSignature: 'André\nArgus Prime' }).where(eq(schema.users.id, user.id));
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push(String(input));
    if (String(input).endsWith('/token')) {
      tokenCalls++;
      if (tokenCalls === 2) await new Promise(resolve => setTimeout(resolve, 4500));
      return Response.json({ access_token: access, refresh_token: 'refresh-secret', expires_in: 3600 });
    }
    if (String(input).includes('/me?$select=')) return Response.json({ id: 'microsoft-user', displayName: 'Seller', mail: 'seller@example.com' });
    if (String(input).endsWith('/me/sendMail')) { sentBody = JSON.parse(String(init?.body)).message.body.content; return new Response(null, { status: 202 }); }
    throw new Error('unexpected request');
  }));
  await connect('code', 'verifier', scope, db);
  const [row] = await db.select().from(schema.office365Connections).where(and(eq(schema.office365Connections.orgId, org.id), eq(schema.office365Connections.userId, user.id)));
  expect(row.tenantId).toBe(tenant);
  expect(row.accessToken).not.toContain(access);
  expect(row.refreshToken).not.toContain('refresh-secret');
  expect((await status(scope, db)).email).toBe('seller@example.com');
  await sendCampaignEmail(db, scope, 'lead@example.com', 'Hello', 'Message');
  expect(sentBody).toBe('Message\n\nAndré\nArgus Prime');
  expect(calls.at(-1)).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
  await db.update(schema.office365Connections).set({ expiresAt: new Date(0) }).where(eq(schema.office365Connections.id, row.id));
  await Promise.all([
    sendCampaignEmail(db, scope, 'lead1@example.com', 'Hello', 'Message'),
    sendCampaignEmail(db, scope, 'lead2@example.com', 'Hello', 'Message'),
  ]);
  expect(tokenCalls).toBe(2);
  await disconnect(scope, db);
  await expect(sendCampaignEmail(db, scope, 'lead@example.com', 'Hello', 'Message')).rejects.toThrow('OFFICE365_ACCOUNT_NOT_CONNECTED');
});

it('never connects or sends for a demo, inactive org, or blocked user', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Office guard');
  const scope = { orgId: org.id, userId: user.id, sessionId: 'session-a' };
  const network = vi.fn();
  vi.stubGlobal('fetch', network);
  for (const blocked of [
    async () => db.update(schema.orgs).set({ isDemo: true }).where(eq(schema.orgs.id, org.id)),
    async () => db.update(schema.orgs).set({ isDemo: false, active: false }).where(eq(schema.orgs.id, org.id)),
    async () => { await db.update(schema.orgs).set({ active: true }).where(eq(schema.orgs.id, org.id)); return db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id)); },
  ]) {
    await blocked();
    expect((await status(scope, db)).status).toBe('disconnected');
    await expect(connect('code', 'verifier', scope, db)).rejects.toThrow('OFFICE365_ACCESS_DENIED');
    await expect(sendCampaignEmail(db, scope, 'lead@example.com', 'Hello', 'Message')).rejects.toThrow('OFFICE365_ACCESS_DENIED');
  }
  expect(network).not.toHaveBeenCalled();
});

it('allows an active platform admin without a legacy org membership', async () => {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'Office admin');
  await db.delete(schema.memberships).where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.userId, user.id)));
  await db.update(schema.users).set({ platformRole: 'admin' }).where(eq(schema.users.id, user.id));
  await expect(assertOffice365Access(db, { orgId: org.id, userId: user.id })).resolves.toBeUndefined();
});

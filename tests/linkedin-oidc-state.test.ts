import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeLinkedInState, createLinkedInAuthorization } from '../server/integrations/linkedin-oidc';

function response() {
  const headers = new Map<string, string>();
  return { headers, setHeader: vi.fn((name: string, value: string) => { headers.set(name, value); return undefined; }) } as any;
}

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('LinkedIn authorization state', () => {
  it('uses the registered callback and binds authorization to one Prospectra user', () => {
    vi.stubEnv('AUTH_SECRET', 'test-only-session-secret');
    vi.stubEnv('LINKEDIN_OIDC_CLIENT_ID', 'client-123');
    vi.stubEnv('LINKEDIN_OIDC_CLIENT_SECRET', 'server-secret');
    vi.stubEnv('PUBLIC_APP_URL', 'https://prospectra.example');
    const req = { headers: { host: 'prospectra.example' } } as any;
    const res = response();
    const url = new URL(createLinkedInAuthorization(req, res, 'alice'));
    expect(url.origin).toBe('https://www.linkedin.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://prospectra.example/api/integrations/linkedin/callback');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
    const saved = res.headers.get('Set-Cookie')!.split(';')[0];
    const callbackReq = { headers: { cookie: saved, host: 'prospectra.example' } } as any;
    expect(consumeLinkedInState(callbackReq, response(), 'bob', url.searchParams.get('state')!)).toBe(false);
    expect(consumeLinkedInState(callbackReq, response(), 'alice', url.searchParams.get('state')!)).toBe(true);
    expect(consumeLinkedInState(callbackReq, response(), 'alice', 'forged')).toBe(false);
  });
  it('rejects expired state', () => {
    vi.stubEnv('AUTH_SECRET', 'test-only-session-secret');
    vi.stubEnv('LINKEDIN_OIDC_CLIENT_ID', 'client-123');
    vi.stubEnv('LINKEDIN_OIDC_CLIENT_SECRET', 'server-secret');
    vi.stubEnv('PUBLIC_APP_URL', 'https://prospectra.example');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    const req = { headers: { host: 'prospectra.example' } } as any;
    const res = response();
    const url = new URL(createLinkedInAuthorization(req, res, 'alice'));
    vi.setSystemTime(new Date('2026-10-13T12:11:00Z'));
    const callbackReq = { headers: { cookie: res.headers.get('Set-Cookie')!.split(';')[0] } } as any;
    expect(consumeLinkedInState(callbackReq, response(), 'alice', url.searchParams.get('state')!)).toBe(false);
  });
});

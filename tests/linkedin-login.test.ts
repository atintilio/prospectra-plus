import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkedinLogin, validateLoginState } from '../server/integrations/linkedin-login';
const base = 'https://scraper.prospectra.argusprime.com.br/linkedin-login';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('LinkedIn login security boundary', () => {
  it('rejects viewer URLs from another origin, credentials or route', () => {
    for (const viewerUrl of ['https://evil.example/view/x', 'http://scraper.prospectra.argusprime.com.br/linkedin-login/view/x', 'https://u:p@scraper.prospectra.argusprime.com.br/linkedin-login/view/x', `${base}/api/session/x`]) {
      expect(() => validateLoginState({status:'awaiting_login',viewerUrl},base)).toThrow();
    }
  });
  it('never exposes viewer URLs after expiration or authentication', () => {
    expect(validateLoginState({status:'expired',viewerUrl:`${base}/view/token`},base)).toEqual({status:'expired'});
    expect(() => validateLoginState({status:'connected'},base)).toThrow();
  });
  it('scopes each request to the authenticated user and keeps the gateway key in the backend', async () => {
    vi.stubEnv('LINKEDIN_LOGIN_GATEWAY_URL',base); vi.stubEnv('LINKEDIN_LOGIN_GATEWAY_TOKEN','test-secret');
    const mock = vi.fn().mockImplementation(async()=>new Response(JSON.stringify({status:'disconnected'})));
    vi.stubGlobal('fetch',mock);
    await linkedinLogin('user-a','GET'); await linkedinLogin('user-b','POST');
    expect(mock.mock.calls[0][0]).not.toBe(mock.mock.calls[1][0]);
    expect(mock.mock.calls[0][0]).not.toContain('user-a');
    expect(mock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-secret');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/api/_lib/access', () => ({ requireActiveSession: vi.fn(), requireSameOrigin: vi.fn() }));
vi.mock('../server/integrations/linkedin-oidc', () => ({
  linkedinOidcConfigured: vi.fn(), readLinkedInProfile: vi.fn(), removeLinkedInProfile: vi.fn(),
}));

import handler from '../server/api/integrations/linkedin/connect';
import { requireActiveSession, requireSameOrigin } from '../server/api/_lib/access';
import { linkedinOidcConfigured, readLinkedInProfile, removeLinkedInProfile } from '../server/integrations/linkedin-oidc';

function response() { const res: any = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; }
afterEach(() => vi.resetAllMocks());

describe('LinkedIn OpenID connection API', () => {
  it('does not read another account without a session', async () => {
    vi.mocked(requireActiveSession).mockResolvedValue(null);
    await handler({ method: 'GET' } as any, response());
    expect(readLinkedInProfile).not.toHaveBeenCalled();
  });
  it('blocks demonstration users', async () => {
    vi.mocked(requireActiveSession).mockResolvedValue({ user: { id: 'demo', workspaceMode: 'demo' } } as any);
    const res = response();
    await handler({ method: 'GET' } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it('blocks cross-origin disconnects', async () => {
    vi.mocked(requireActiveSession).mockResolvedValue({ user: { id: 'alice' } } as any);
    vi.mocked(requireSameOrigin).mockReturnValue(false);
    await handler({ method: 'DELETE' } as any, response());
    expect(removeLinkedInProfile).not.toHaveBeenCalled();
  });
  it('reads only the signed-in user connection', async () => {
    vi.mocked(requireActiveSession).mockResolvedValue({ user: { id: 'alice' } } as any);
    vi.mocked(linkedinOidcConfigured).mockReturnValue(true);
    vi.mocked(readLinkedInProfile).mockResolvedValue({ subject: 'linkedin-1', name: 'Alice', connectedAt: '2026-10-13T00:00:00.000Z' });
    const res = response();
    await handler({ method: 'GET', query: { userId: 'bob' } } as any, res);
    expect(readLinkedInProfile).toHaveBeenCalledWith('alice');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'authenticated' }));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedState } from '../src/data';

vi.mock('../server/api/_lib/access', () => ({ requireActiveSession: vi.fn(), requireSameOrigin: vi.fn() }));
vi.mock('../server/api/_lib/workspace', () => ({
  loadWorkspaceState: vi.fn(),
  visibleWorkspaceState: (state: unknown) => state,
}));

import handler from '../server/api/ai/assist';
import { requireActiveSession, requireSameOrigin } from '../server/api/_lib/access';
import { loadWorkspaceState } from '../server/api/_lib/workspace';

function response() {
  const result = { statusCode: 0, body: null as unknown, headers: {} as Record<string, string> };
  const res: any = {
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; },
    setHeader(name: string, value: string) { result.headers[name] = value; return res; },
  };
  return { res, result };
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  vi.mocked(requireActiveSession).mockResolvedValue({ user: { id: 'user-1', role: 'admin' } } as any);
  vi.mocked(requireSameOrigin).mockReturnValue(true);
  vi.mocked(loadWorkspaceState).mockResolvedValue({ state: structuredClone(seedState) } as any);
});
afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('agente assistido', () => {
  it('não usa o provedor sem sessão', async () => {
    vi.mocked(requireActiveSession).mockResolvedValue(null);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await handler({ method: 'POST', body: { accountId: seedState.accounts[0].id }, headers: {} }, response().res);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantém a chave no servidor e força o roteador gratuito', async () => {
    const account = seedState.accounts.find((item) => !item.paused && !item.suppressed && item.contacts.length && item.evidence.some((evidence) => evidence.verified))!;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: ['Contexto confirmado'], draft: 'Olá! Gostaria de conversar sobre o contexto publicado.', nextAction: 'Revisar e abordar', rationale: 'Há evidência verificada', evidenceIds: [account.evidence[0].id, 'inventado'] }) } }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const { res, result } = response();
    await handler({ method: 'POST', body: { accountId: account.id, contactId: account.contacts[0].id }, headers: {} }, res);
    expect(result.statusCode).toBe(200);
    expect((result.body as any).draft).toContain('Olá!');
    expect((result.body as any).evidenceIds).toEqual([account.evidence[0].id]);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe('openrouter/free');
    expect(sent.messages[1].content).not.toContain(account.contacts[0].email);
  });

  it('não libera texto de abordagem para conta suprimida', async () => {
    const account = seedState.accounts.find((item) => item.suppressed)!;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insights: ['Não contatar'], draft: 'Olá', nextAction: 'Enviar', evidenceIds: [] }) } }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const { res, result } = response();
    await handler({ method: 'POST', body: { accountId: account.id }, headers: {} }, res);
    expect(result.statusCode).toBe(200);
    expect((result.body as any).draft).toBe('');
    expect((result.body as any).readyForReview).toBe(false);
    expect((result.body as any).nextAction).toContain('Não contatar');
  });

  it('retorna indisponível sem credencial e não chama a IA', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { res, result } = response();
    await handler({ method: 'POST', body: { accountId: seedState.accounts[0].id }, headers: {} }, res);
    expect(result.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkedinExecutor } from '@/lib/linkedin/http-executor';

const item = { id: 'a1', type: 'invite' as const, leadLinkedinUrl: 'https://www.linkedin.com/in/ana', leadName: 'Ana', body: 'Oi' };
const env = (over: Record<string, string> = {}) => ({ LINKEDIN_WORKER_URL: 'https://worker.vps/li', LINKEDIN_WORKER_KEY: 'k', ...over }) as unknown as NodeJS.ProcessEnv;

afterEach(() => vi.restoreAllMocks());

describe('linkedinExecutor (cliente HTTP do worker)', () => {
  it('sem env → sem executor (fluxo assistido continua)', () => {
    expect(linkedinExecutor({} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('recusa URL não-HTTPS ou com credenciais/query', () => {
    expect(() => linkedinExecutor(env({ LINKEDIN_WORKER_URL: 'http://worker.vps/li' }))).toThrow();
    expect(() => linkedinExecutor(env({ LINKEDIN_WORKER_URL: 'https://u:p@worker.vps/li' }))).toThrow();
    expect(() => linkedinExecutor(env({ LINKEDIN_WORKER_URL: 'https://worker.vps/li?x=1' }))).toThrow();
  });

  it('200 + {state:sent} → sent com providerId; faz POST /dispatch autenticado', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ state: 'sent', providerId: 'p1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await linkedinExecutor(env())!.dispatch(item);
    expect(r).toEqual({ state: 'sent', providerId: 'p1' });
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://worker.vps/li/dispatch');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer k' });
  });

  it('HTTP não-ok, estado não-sent e exceção → unknown (nunca reenviado)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    expect(await linkedinExecutor(env())!.dispatch(item)).toEqual({ state: 'unknown' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ state: 'queued' }), { status: 200 })));
    expect(await linkedinExecutor(env())!.dispatch(item)).toEqual({ state: 'unknown' });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
    expect(await linkedinExecutor(env())!.dispatch(item)).toEqual({ state: 'unknown' });
  });
});

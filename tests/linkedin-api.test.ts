import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

/**
 * As rotas de integração do LinkedIn rodam de verdade contra um Postgres em
 * memória (PGlite). A sessão e o banco são injetados: nenhum teste toca a
 * rede do LinkedIn nem precisa de sessão real.
 */
const f = vi.hoisted(() => ({
  auth: vi.fn(),
  db: undefined as unknown,
  jar: new Map<string, string>(),
}));

vi.mock('@/lib/auth', () => ({ requireOrg: f.auth }));
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return { ...actual, getDb: async () => f.db };
});
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (f.jar.has(name) ? { name, value: f.jar.get(name) as string } : undefined),
    set: (name: string, value: string) => {
      f.jar.set(name, value);
    },
    delete: (name: string) => {
      f.jar.delete(name);
    },
  }),
}));

import { GET as connectGet, DELETE as connectDelete } from '@/app/api/integrations/linkedin/connect/route';
import { GET as startGet } from '@/app/api/integrations/linkedin/start/route';
import { GET as callbackGet } from '@/app/api/integrations/linkedin/callback/route';
import { createLinkedInState, LINKEDIN_STATE_COOKIE, saveLinkedInConnection } from '@/lib/linkedin/connection';
import { schema } from '@/db';
import { testDb, seedOrg } from './helpers';

const ENV_KEYS = [
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'LINKEDIN_REDIRECT_URI',
  'LINKEDIN_STATE_SECRET',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  f.jar.clear();
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

function configureLinkedin(): void {
  process.env.LINKEDIN_CLIENT_ID = 'client-id-123';
  process.env.LINKEDIN_CLIENT_SECRET = 'client-secret-456';
  process.env.LINKEDIN_REDIRECT_URI = 'https://prospectra.test/api/integrations/linkedin/callback';
}

async function setup() {
  const db = await testDb();
  const { org, user } = await seedOrg(db, 'LinkedIn API');
  f.db = db;
  f.auth.mockResolvedValue({ user: { id: user.id }, org: { id: org.id }, role: 'owner', sessionId: 'session-1' });
  return { db, org, user };
}

/** Corpo JSON da resposta. */
async function json(res: Response): Promise<{ status?: string; profile?: { name?: string }; ok?: boolean; error?: string }> {
  return (await res.json()) as never;
}

describe('API do LinkedIn — estado da conexão', () => {
  it('devolve o estado do usuário logado', async () => {
    configureLinkedin();
    await setup();
    const res = await connectGet();
    expect(res.status).toBe(200);
    expect((await json(res)).status).toBe('disconnected');
  });

  it('devolve o perfil quando a conexão está gravada', async () => {
    configureLinkedin();
    const { db, org, user } = await setup();
    await saveLinkedInConnection(db, { orgId: org.id, userId: user.id, profileName: 'João da Silva' });
    const payload = await json(await connectGet());
    expect(payload.status).toBe('authenticated');
    expect(payload.profile?.name).toBe('João da Silva');
  });

  it('sem credencial do aplicativo: configuration_required', async () => {
    await setup();
    expect((await json(await connectGet())).status).toBe('configuration_required');
  });

  it('sem sessão: 401 e nenhuma informação', async () => {
    await setup();
    f.auth.mockRejectedValue(Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT;replace;/login;307;' }));
    const res = await connectGet();
    expect(res.status).toBe(401);
    expect((await json(res)).error).toBeTruthy();
  });

  it('desconectar volta para disconnected', async () => {
    configureLinkedin();
    const { db, org, user } = await setup();
    await saveLinkedInConnection(db, { orgId: org.id, userId: user.id, profileName: 'João da Silva' });
    const res = await connectDelete();
    expect(res.status).toBe(200);
    expect((await json(res)).status).toBe('disconnected');
    expect((await json(await connectGet())).status).toBe('disconnected');
    const rows = await db.select().from(schema.linkedinConnections).where(eq(schema.linkedinConnections.userId, user.id));
    expect(rows[0]?.status).toBe('revoked');
  });
});

describe('API do LinkedIn — início da autorização', () => {
  it('redireciona para o authorize do LinkedIn com o state no cookie httpOnly', async () => {
    configureLinkedin();
    await setup();
    const res = await startGet();
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(location.searchParams.get('scope')).toBe('openid profile email');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(LINKEDIN_STATE_COOKIE);
    expect(cookie).toContain('HttpOnly');
  });

  it('sem credencial do aplicativo: a janela avisa que falta configuração', async () => {
    await setup();
    const res = await startGet();
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('prospectra-linkedin-oidc');
    expect(html).toContain('error');
  });
});

describe('API do LinkedIn — callback', () => {
  it('state inválido: o popup recebe erro e nada é gravado', async () => {
    configureLinkedin();
    const { db } = await setup();
    const res = await callbackGet(new Request('http://localhost/api/integrations/linkedin/callback?code=abc&state=forjado'));
    const html = await res.text();
    expect(html).toContain('prospectra-linkedin-oidc');
    expect(html).toContain('"error"');
    expect(await db.select().from(schema.linkedinConnections)).toHaveLength(0);
  });

  it('usuário cancelou no LinkedIn: o popup recebe cancelled', async () => {
    configureLinkedin();
    const { user } = await setup();
    const { cookie, state } = createLinkedInState('session-1', user.id);
    f.jar.set(LINKEDIN_STATE_COOKIE, cookie);
    const res = await callbackGet(
      new Request(`http://localhost/api/integrations/linkedin/callback?error=access_denied&state=${state}`),
    );
    const html = await res.text();
    expect(html).toContain('"cancelled"');
  });

  it('code válido: a conexão é gravada e o popup recebe connected', async () => {
    configureLinkedin();
    const { db, org, user } = await setup();
    const { cookie, state } = createLinkedInState('session-1', user.id);
    f.jar.set(LINKEDIN_STATE_COOKIE, cookie);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes('accessToken')) {
          return new Response(JSON.stringify({ access_token: 'token-123' }), { status: 200 });
        }
        return new Response(JSON.stringify({ sub: 'sub-1', name: 'Maria Souza', email: 'maria@exemplo.com' }), { status: 200 });
      }),
    );
    const res = await callbackGet(
      new Request(`http://localhost/api/integrations/linkedin/callback?code=code-1&state=${state}`),
    );
    const html = await res.text();
    expect(html).toContain('"connected"');
    const rows = await db.select().from(schema.linkedinConnections).where(eq(schema.linkedinConnections.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.profileName).toBe('Maria Souza');
    expect(rows[0]?.orgId).toBe(org.id);
  });
});

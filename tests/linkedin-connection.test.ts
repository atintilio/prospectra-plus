import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, seedOrg } from './helpers';
import { schema, type DB } from '@/db';
import {
  buildAuthorizeUrl,
  consumeCallback,
  createLinkedInState,
  disconnect,
  getLinkedInStatus,
  isLinkedInConfigured,
  saveLinkedInConnection,
  verifyLinkedInState,
} from '@/lib/linkedin/connection';

/** Credenciais do LinkedIn (servidor). Cada teste decide se elas existem. */
const ENV_KEYS = [
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'LINKEDIN_REDIRECT_URI',
  'LINKEDIN_STATE_SECRET',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/** Ambiente com o aplicativo do LinkedIn configurado. */
function configureLinkedin(): void {
  process.env.LINKEDIN_CLIENT_ID = 'client-id-123';
  process.env.LINKEDIN_CLIENT_SECRET = 'client-secret-456';
  process.env.LINKEDIN_REDIRECT_URI = 'https://prospectra.test/api/integrations/linkedin/callback';
}

/** Banco que falha: simula o banco fora do ar. */
const brokenDb = {
  select: () => {
    throw new Error('banco indisponível');
  },
} as unknown as DB;

describe('conexão LinkedIn — os quatro estados', () => {
  it('sem credencial do aplicativo: configuration_required', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Sem Credencial');
    expect(isLinkedInConfigured()).toBe(false);
    const state = await getLinkedInStatus(user.id, org.id, db);
    expect(state.status).toBe('configuration_required');
    expect(state.profile).toBeUndefined();
  });

  it('conexão já gravada continua autenticada mesmo sem a credencial (estado simulado da demo)', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Conexao Simulada');
    await saveLinkedInConnection(db, {
      orgId: org.id,
      userId: user.id,
      providerId: 'sub-demo',
      profileName: 'João da Silva',
      profileEmail: 'joao.silva@atlasconsultoria.demo',
    });
    const state = await getLinkedInStatus(user.id, org.id, db);
    expect(state.status).toBe('authenticated');
    expect(state.profile?.name).toBe('João da Silva');
  });

  it('sem conexão gravada: disconnected', async () => {
    configureLinkedin();
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Desconectado');
    expect(await getLinkedInStatus(user.id, org.id, db)).toEqual({ status: 'disconnected' });
  });

  it('conexão gravada vira authenticated, com o perfil vinculado', async () => {
    configureLinkedin();
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Conectado');
    await saveLinkedInConnection(db, {
      orgId: org.id,
      userId: user.id,
      providerId: 'sub-123',
      profileName: 'João da Silva',
      profileEmail: 'joao.silva@exemplo.com',
    });
    const state = await getLinkedInStatus(user.id, org.id, db);
    expect(state.status).toBe('authenticated');
    expect(state.profile?.name).toBe('João da Silva');
    expect(state.profile?.email).toBe('joao.silva@exemplo.com');
    expect(state.profile?.connectedAt).toBeTruthy();
  });

  it('banco fora do ar: unavailable (sem quebrar a tela)', async () => {
    configureLinkedin();
    expect(await getLinkedInStatus('user-1', 'org-1', brokenDb)).toEqual({ status: 'unavailable' });
  });

  it('a conexão é da pessoa na operação dela: outra org não enxerga', async () => {
    configureLinkedin();
    const db = await testDb();
    const a = await seedOrg(db, 'Operacao A');
    const b = await seedOrg(db, 'Operacao B');
    await saveLinkedInConnection(db, {
      orgId: a.org.id,
      userId: a.user.id,
      profileName: 'João da Silva',
    });
    expect((await getLinkedInStatus(a.user.id, a.org.id, db)).status).toBe('authenticated');
    expect((await getLinkedInStatus(a.user.id, b.org.id, db)).status).toBe('disconnected');
  });

  it('o segredo do aplicativo nunca aparece na resposta', async () => {
    configureLinkedin();
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Segredo');
    await saveLinkedInConnection(db, { orgId: org.id, userId: user.id, profileName: 'João da Silva' });
    const state = await getLinkedInStatus(user.id, org.id, db);
    expect(JSON.stringify(state)).not.toContain('client-secret-456');
    expect(JSON.stringify(state)).not.toContain('client-id-123');
  });
});

describe('conexão LinkedIn — URL de autorização', () => {
  it('monta a URL do LinkedIn com state, redirect_uri e os scopes de members', () => {
    configureLinkedin();
    const url = new URL(buildAuthorizeUrl('state-abc'));
    expect(`${url.origin}${url.pathname}`).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-id-123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://prospectra.test/api/integrations/linkedin/callback');
    expect(url.searchParams.get('state')).toBe('state-abc');
    expect(url.searchParams.get('scope')).toBe('openid profile email');
  });

  it('sem credencial a URL não é montada', () => {
    expect(() => buildAuthorizeUrl('state-abc')).toThrow();
  });
});

describe('conexão LinkedIn — state assinado', () => {
  it('vale para a sessão e o usuário que iniciaram o fluxo', () => {
    const { state, cookie } = createLinkedInState('session-1', 'user-1');
    expect(verifyLinkedInState(cookie, state, 'user-1', 'session-1')).toBe(true);
    expect(verifyLinkedInState(cookie, state, 'user-2', 'session-1')).toBe(false);
    expect(verifyLinkedInState(cookie, state, 'user-1', 'session-2')).toBe(false);
    expect(verifyLinkedInState(cookie, 'outro-state', 'user-1', 'session-1')).toBe(false);
    expect(verifyLinkedInState(undefined, state, 'user-1', 'session-1')).toBe(false);
  });

  it('cookie adulterado é recusado', () => {
    const { state, cookie } = createLinkedInState('session-1', 'user-1');
    const [, assinatura] = cookie.split('.');
    expect(verifyLinkedInState(`${cookie.split('.')[0]}.${assinatura}x`, state, 'user-1', 'session-1')).toBe(false);
  });
});

describe('conexão LinkedIn — callback', () => {
  it('troca o code, busca o perfil e grava a conexão do usuário', async () => {
    configureLinkedin();
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Callback');
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('accessToken')) {
        return new Response(JSON.stringify({ access_token: 'token-123', scope: 'openid profile email' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ sub: 'sub-999', name: 'Maria Souza', email: 'maria@exemplo.com' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const outcome = await consumeCallback('code-1', 'state-1', {
      userId: user.id,
      orgId: org.id,
      db,
      fetchImpl,
    });
    expect(outcome.status).toBe('authenticated');
    expect(outcome.profile?.name).toBe('Maria Souza');

    const rows = await db
      .select()
      .from(schema.linkedinConnections)
      .where(eq(schema.linkedinConnections.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('connected');
    expect(rows[0]?.profileName).toBe('Maria Souza');
    expect(rows[0]?.profileEmail).toBe('maria@exemplo.com');
    expect(rows[0]?.scopes).toBe('openid profile email');
  });

  it('rede ou provedor fora do ar: unavailable e nada gravado', async () => {
    configureLinkedin();
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Falha');
    const fetchImpl = vi.fn(async () => {
      throw new Error('rede fora do ar');
    }) as unknown as typeof fetch;

    const outcome = await consumeCallback('code-1', 'state-1', {
      userId: user.id,
      orgId: org.id,
      db,
      fetchImpl,
    });
    expect(outcome.status).toBe('unavailable');
    expect(await db.select().from(schema.linkedinConnections)).toHaveLength(0);
  });

  it('token recusado pelo provedor: unavailable, sem gravar', async () => {
    configureLinkedin();
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Token Recusado');
    const fetchImpl = vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch;

    const outcome = await consumeCallback('code-1', 'state-1', {
      userId: user.id,
      orgId: org.id,
      db,
      fetchImpl,
    });
    expect(outcome.status).toBe('unavailable');
    expect(await db.select().from(schema.linkedinConnections)).toHaveLength(0);
  });
});

describe('conexão LinkedIn — gravar e desconectar', () => {
  it('gravar de novo renova a mesma conexão (não duplica)', async () => {
    configureLinkedin();
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Renovar');
    await saveLinkedInConnection(db, { orgId: org.id, userId: user.id, profileName: 'João da Silva' });
    await saveLinkedInConnection(db, { orgId: org.id, userId: user.id, profileName: 'João da Silva' });
    const rows = await db.select().from(schema.linkedinConnections);
    expect(rows).toHaveLength(1);
  });

  it('desconectar volta para disconnected e marca a conexão como revogada', async () => {
    configureLinkedin();
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Revogar');
    await saveLinkedInConnection(db, { orgId: org.id, userId: user.id, profileName: 'João da Silva' });
    expect(await disconnect(user.id, org.id, db)).toBe(true);
    expect((await getLinkedInStatus(user.id, org.id, db)).status).toBe('disconnected');
    const rows = await db.select().from(schema.linkedinConnections);
    expect(rows[0]?.status).toBe('revoked');
  });
});

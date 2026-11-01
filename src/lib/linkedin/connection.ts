import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';

/**
 * Conexão da conta do LinkedIn do próprio usuário (OpenID Connect).
 *
 * Regras (PRD RF1):
 *  - o `client_secret` e o token NUNCA saem do servidor: o app só orquestra a
 *    autorização e guarda apenas o perfil vinculado (nada de token no banco);
 *  - sem `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` / `LINKEDIN_REDIRECT_URI`
 *    o estado é `configuration_required` — a tela explica o que falta e o app
 *    continua funcionando (N6);
 *  - o `orgId` vem SEMPRE da sessão (nunca do cliente) e a conexão é do usuário
 *    logado: uma conta por pessoa (RF1);
 *  - falha de rede ou erro do provedor viram `unavailable`: nada de estado
 *    "fingido" (N4).
 */

export const LINKEDIN_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
export const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
export const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
/** Scopes do LinkedIn (OpenID Connect): identidade do membro. */
export const LINKEDIN_SCOPES = 'openid profile email';
/** Cookie httpOnly que carrega o `state` assinado entre /start e /callback. */
export const LINKEDIN_STATE_COOKIE = 'prospectra_linkedin_state';
/** Validade do `state` (10 minutos). */
export const LINKEDIN_STATE_TTL_MS = 10 * 60 * 1000;

export type LinkedInStatus = 'disconnected' | 'authenticated' | 'configuration_required' | 'unavailable';
export type LinkedInProfile = {
  name: string;
  email?: string;
  connectedAt: string;
  providerId?: string;
};
export type LinkedInConnectionState = { status: LinkedInStatus; profile?: LinkedInProfile };

export type LinkedInConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Credenciais do LinkedIn (somente servidor). `null` quando falta alguma. */
export function linkedinConfig(env: NodeJS.ProcessEnv = process.env): LinkedInConfig | null {
  const clientId = env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = env.LINKEDIN_CLIENT_SECRET?.trim();
  const redirectUri = env.LINKEDIN_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** O aplicativo do LinkedIn está configurado neste ambiente? */
export function isLinkedInConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return linkedinConfig(env) !== null;
}

/** URL de autorização do LinkedIn (OpenID Connect) com o `state` assinado. */
export function buildAuthorizeUrl(state: string, env: NodeJS.ProcessEnv = process.env): string {
  const cfg = linkedinConfig(env);
  if (!cfg) throw new Error('linkedin_not_configured');
  const url = new URL(LINKEDIN_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', LINKEDIN_SCOPES);
  return url.toString();
}

// ── `state` assinado: liga o callback à sessão que iniciou a autorização ──

/** Chave da assinatura: segredo dedicado ou, na falta dele, o id da sessão. */
function stateKey(sessionId: string, env: NodeJS.ProcessEnv): string {
  return env.LINKEDIN_STATE_SECRET?.trim() || sessionId;
}

function signState(payload: string, sessionId: string, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', stateKey(sessionId, env)).update(`linkedin-oidc:${payload}`).digest('base64url');
}

/** Gera o `state` aleatório e o valor do cookie assinado (uso único). */
export function createLinkedInState(
  sessionId: string,
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): { state: string; cookie: string } {
  const state = randomBytes(32).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ userId, state, exp: Date.now() + LINKEDIN_STATE_TTL_MS }),
  ).toString('base64url');
  return { state, cookie: `${payload}.${signState(payload, sessionId, env)}` };
}

/** O `state` devolvido pelo LinkedIn é o que esta sessão iniciou? */
export function verifyLinkedInState(
  cookie: string | undefined | null,
  state: string,
  userId: string,
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!cookie || !state) return false;
  const [payload, signature] = cookie.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(signState(payload, sessionId, env));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
      state?: string;
      exp?: number;
    };
    return (
      parsed.userId === userId &&
      parsed.state === state &&
      typeof parsed.exp === 'number' &&
      parsed.exp > Date.now()
    );
  } catch {
    return false;
  }
}

// ── Estado da conexão ──

/**
 * Estado da conexão do usuário na operação.
 *
 * `authenticated` quando há uma conexão gravada (uma conta por pessoa);
 * `configuration_required` quando falta credencial do aplicativo e não há
 * conexão nenhuma (a tela explica o que falta); `unavailable` quando o banco
 * falha — nada de estado "fingido" (N4).
 */
export async function getLinkedInStatus(
  userId: string,
  orgId: string,
  db?: DB,
): Promise<LinkedInConnectionState> {
  let row: typeof schema.linkedinConnections.$inferSelect | undefined;
  try {
    const database = db ?? (await getDb());
    [row] = await database
      .select()
      .from(schema.linkedinConnections)
      .where(
        and(
          eq(schema.linkedinConnections.orgId, orgId),
          eq(schema.linkedinConnections.userId, userId),
        ),
      );
  } catch {
    return { status: 'unavailable' };
  }
  if (!row || row.status !== 'connected') {
    // Sem conexão: se o aplicativo do LinkedIn não está configurado, a tela
    // precisa explicar o que falta em vez de mandar o usuário para o vazio.
    if (!isLinkedInConfigured()) return { status: 'configuration_required' };
    return { status: 'disconnected' };
  }
  return {
    status: 'authenticated',
    profile: {
      name: row.profileName,
      email: row.profileEmail || undefined,
      connectedAt: (row.connectedAt ?? row.updatedAt).toISOString(),
      providerId: row.providerId || undefined,
    },
  };
}

/**
 * Grava (ou renova) a conexão do usuário. Idempotente: uma conta por
 * usuário e operação (índice único em `org_id` + `user_id`).
 */
export async function saveLinkedInConnection(
  db: DB,
  input: {
    orgId: string;
    userId: string;
    providerId?: string;
    profileName?: string;
    profileEmail?: string;
    scopes?: string;
    connectedAt?: Date;
  },
): Promise<void> {
  const now = new Date();
  const connectedAt = input.connectedAt ?? now;
  const values = {
    providerId: input.providerId ?? '',
    profileName: input.profileName ?? '',
    profileEmail: input.profileEmail ?? '',
    status: 'connected' as const,
    scopes: input.scopes ?? LINKEDIN_SCOPES,
    connectedAt,
    updatedAt: now,
  };
  await db
    .insert(schema.linkedinConnections)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [schema.linkedinConnections.orgId, schema.linkedinConnections.userId],
      set: values,
    });
}

/** Desconecta a conta do usuário (o registro fica como `revoked`). */
export async function disconnect(userId: string, orgId: string, db?: DB): Promise<boolean> {
  const database = db ?? (await getDb());
  const rows = await database
    .update(schema.linkedinConnections)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(
      and(
        eq(schema.linkedinConnections.orgId, orgId),
        eq(schema.linkedinConnections.userId, userId),
      ),
    )
    .returning({ id: schema.linkedinConnections.id });
  return rows.length > 0;
}

// ── Callback: troca o `code` por token, busca o perfil e grava ──

export type LinkedInCallbackOutcome = {
  status: LinkedInStatus;
  profile?: LinkedInProfile;
  error?: string;
};

export type LinkedInCallbackOptions = {
  userId: string;
  orgId: string;
  db?: DB;
  /** Injetável para teste (nunca é o fetch do navegador). */
  fetchImpl?: typeof fetch;
  now?: Date;
};

/** Troca o `code` pelo access token. O segredo nunca sai daqui. */
async function exchangeCode(
  code: string,
  cfg: LinkedInConfig,
  doFetch: typeof fetch,
): Promise<{ accessToken: string; scope: string }> {
  const res = await doFetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error('linkedin_token_exchange_failed');
  const data = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    scope?: unknown;
  } | null;
  const accessToken = typeof data?.access_token === 'string' ? data.access_token : '';
  if (!accessToken) throw new Error('linkedin_token_missing');
  const scope = typeof data?.scope === 'string' && data.scope ? data.scope : LINKEDIN_SCOPES;
  return { accessToken, scope };
}

/** Perfil do membro no LinkedIn (OpenID Connect userinfo). */
async function fetchProfile(
  accessToken: string,
  doFetch: typeof fetch,
): Promise<{ sub: string; name: string; email?: string }> {
  const res = await doFetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error('linkedin_profile_failed');
  const data = (await res.json().catch(() => null)) as {
    sub?: unknown;
    name?: unknown;
    email?: unknown;
  } | null;
  const sub = typeof data?.sub === 'string' ? data.sub.slice(0, 200) : '';
  const name = typeof data?.name === 'string' ? data.name.slice(0, 200) : '';
  if (!sub || !name) throw new Error('linkedin_profile_invalid');
  const email = typeof data?.email === 'string' ? data.email.slice(0, 320) : undefined;
  return { sub, name, email };
}

/**
 * Consome o callback do LinkedIn: troca o `code`, busca o perfil e grava a
 * conexão do usuário. Erro de rede ou do provedor NÃO quebra a request:
 * vira `unavailable` (o popup avisa e o app segue funcionando).
 */
export async function consumeCallback(
  code: string,
  state: string,
  options: LinkedInCallbackOptions,
): Promise<LinkedInCallbackOutcome> {
  const cfg = linkedinConfig();
  if (!cfg) return { status: 'configuration_required', error: 'linkedin_not_configured' };
  if (!code || !state) return { status: 'unavailable', error: 'linkedin_code_missing' };
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const token = await exchangeCode(code, cfg, doFetch);
    const profile = await fetchProfile(token.accessToken, doFetch);
    const connectedAt = options.now ?? new Date();
    const database = options.db ?? (await getDb());
    await saveLinkedInConnection(database, {
      orgId: options.orgId,
      userId: options.userId,
      providerId: profile.sub,
      profileName: profile.name,
      profileEmail: profile.email ?? '',
      scopes: token.scope,
      connectedAt,
    });
    return {
      status: 'authenticated',
      profile: {
        name: profile.name,
        email: profile.email,
        connectedAt: connectedAt.toISOString(),
        providerId: profile.sub,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    const error = message.startsWith('linkedin_') ? message : 'linkedin_request_failed';
    return { status: 'unavailable', error };
  }
}

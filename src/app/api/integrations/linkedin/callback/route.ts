import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import {
  consumeCallback,
  LINKEDIN_STATE_COOKIE,
  verifyLinkedInState,
} from '@/lib/linkedin/connection';
import { requireLinkedInScope } from '../_auth';
import { popupPage } from '../_popup';

export const dynamic = 'force-dynamic';

/**
 * Callback do LinkedIn (OpenID Connect).
 *
 * 1. valida o `state` (assinado, da sessão que iniciou o fluxo);
 * 2. troca o `code` por token, busca o perfil e grava a conexão do usuário;
 * 3. devolve a página mínima que avisa o popup (`postMessage`).
 *
 * Erro de rede ou do provedor não derruba a request: o popup recebe
 * `result: 'error'` e o app continua funcionando.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const state = params.get('state') ?? '';
  const code = params.get('code') ?? '';
  const providerError = params.get('error');

  const scope = await requireLinkedInScope();
  if (!scope.ok) return scope.response;

  const jar = await cookies();
  const valid = verifyLinkedInState(
    jar.get(LINKEDIN_STATE_COOKIE)?.value,
    state,
    scope.userId,
    scope.sessionId,
  );

  // O `state` é de uso único: o cookie some depois do callback.
  const finish = (result: 'connected' | 'cancelled' | 'error', message?: string) => {
    const res = popupPage(result, message);
    res.cookies.set(LINKEDIN_STATE_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/integrations/linkedin',
      maxAge: 0,
    });
    return res;
  };

  if (!valid) {
    return finish('error', 'A autorização do LinkedIn não foi reconhecida. Tente conectar de novo.');
  }
  if (providerError) {
    return finish('cancelled');
  }
  if (!code) {
    return finish('error', 'O LinkedIn não devolveu o código de autorização. Tente novamente.');
  }

  try {
    const db = await getDb();
    const outcome = await consumeCallback(code, state, {
      userId: scope.userId,
      orgId: scope.orgId,
      db,
    });
    if (outcome.status !== 'authenticated') {
      return finish('error', 'Não foi possível concluir a conexão com o LinkedIn. Tente novamente.');
    }
    return finish('connected');
  } catch {
    return finish('error', 'Não foi possível concluir a conexão com o LinkedIn. Tente novamente.');
  }
}

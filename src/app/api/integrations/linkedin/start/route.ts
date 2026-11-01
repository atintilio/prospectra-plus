import { NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  createLinkedInState,
  isLinkedInConfigured,
  LINKEDIN_STATE_COOKIE,
  LINKEDIN_STATE_TTL_MS,
} from '@/lib/linkedin/connection';
import { requireLinkedInScope } from '../_auth';
import { popupPage } from '../_popup';

export const dynamic = 'force-dynamic';

/**
 * Inicia a autorização do LinkedIn: redireciona para o authorize do provedor.
 *
 * O `state` é aleatório e assinado; ele viaja num cookie httpOnly (uso
 * único) ligado à sessão que iniciou o fluxo. O `client_secret` fica no
 * servidor — o navegador só vê o redirect do LinkedIn.
 */
export async function GET() {
  const scope = await requireLinkedInScope();
  if (!scope.ok) return scope.response;

  if (!isLinkedInConfigured()) {
    // Configuração pendente: a janela avisa e fecha (nada de estado fingido).
    return popupPage('error', 'A conexão com o LinkedIn ainda não está configurada neste ambiente.');
  }

  const { state, cookie } = createLinkedInState(scope.sessionId, scope.userId);
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set(LINKEDIN_STATE_COOKIE, cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/integrations/linkedin',
    maxAge: Math.floor(LINKEDIN_STATE_TTL_MS / 1000),
  });
  return res;
}

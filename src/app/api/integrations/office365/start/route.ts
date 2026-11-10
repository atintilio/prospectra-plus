import { NextResponse } from 'next/server';
import { requireLinkedInScope } from '../../linkedin/_auth';
import { authorizeUrl, createState, office365Config, STATE_COOKIE, STATE_TTL_SECONDS } from '@/lib/office365/connection';
import { popup } from '../_popup';

export const dynamic = 'force-dynamic';

export async function GET() {
  const scope = await requireLinkedInScope();
  if (!scope.ok) return scope.response;
  if (!office365Config()) return popup('error', 'A conexão Office 365 ainda não está configurada.');
  const state = createState(scope);
  const response = NextResponse.redirect(authorizeUrl(state.state, state.challenge));
  response.cookies.set(STATE_COOKIE, state.cookie, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/integrations/office365', maxAge: STATE_TTL_SECONDS });
  return response;
}

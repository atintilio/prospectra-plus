import { cookies } from 'next/headers';
import { getDb } from '@/db';
import { requireLinkedInScope } from '../../linkedin/_auth';
import { connect, STATE_COOKIE, verifyState } from '@/lib/office365/connection';
import { popup } from '../_popup';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const scope = await requireLinkedInScope();
  if (!scope.ok) return scope.response;
  const params = new URL(req.url).searchParams;
  const verifier = verifyState((await cookies()).get(STATE_COOKIE)?.value, params.get('state') || '', scope);
  const finish = (result: 'connected' | 'cancelled' | 'error', message: string) => {
    const response = popup(result, message);
    response.cookies.set(STATE_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/integrations/office365', maxAge: 0 });
    return response;
  };
  if (!verifier) return finish('error', 'A autorização expirou ou não pertence a esta sessão.');
  if (params.has('error')) return finish('cancelled', 'Autorização cancelada no Microsoft.');
  const code = params.get('code');
  if (!code) return finish('error', 'O Microsoft não devolveu o código de autorização.');
  try {
    await connect(code, verifier, scope, await getDb());
    return finish('connected', 'Sua conta Office 365 foi conectada.');
  } catch {
    return finish('error', 'Não foi possível conectar a conta Office 365. Tente novamente.');
  }
}

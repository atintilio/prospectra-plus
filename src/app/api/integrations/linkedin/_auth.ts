import { NextResponse } from 'next/server';
import { requireOrg } from '@/lib/auth';

export type LinkedInScope = { ok: true; orgId: string; userId: string; sessionId: string };
export type LinkedInScopeError = { ok: false; response: NextResponse };

/**
 * Sessão da operação (orgId + userId SEMPRE da sessão).
 * O `orgId` NUNCA vem do cliente: é o da sessão, como em `requireOrg`.
 * `requireOrg()` redireciona quando não há sessão/equipe; numa API isso vira
 * 401/403 em JSON (mesmo contrato das rotas internas da agenda).
 */
export async function requireLinkedInScope(): Promise<LinkedInScope | LinkedInScopeError> {
  try {
    const ctx = await requireOrg();
    return { ok: true, orgId: ctx.org.id, userId: ctx.user.id, sessionId: ctx.sessionId };
  } catch (err) {
    const digest =
      typeof err === 'object' && err !== null && 'digest' in err && typeof (err as { digest?: unknown }).digest === 'string'
        ? (err as { digest: string }).digest
        : '';
    if (digest.startsWith('NEXT_REDIRECT')) {
      const target = digest.split(';')[2] ?? '';
      if (target === '/login') {
        return { ok: false, response: NextResponse.json({ ok: false, error: 'Sessão expirada. Entre novamente.' }, { status: 401 }) };
      }
      return { ok: false, response: NextResponse.json({ ok: false, error: 'Você não tem acesso a esta operação.' }, { status: 403 }) };
    }
    return { ok: false, response: NextResponse.json({ ok: false, error: 'Não foi possível validar a sessão.' }, { status: 500 }) };
  }
}

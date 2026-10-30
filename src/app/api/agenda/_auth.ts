import { NextResponse } from 'next/server';
import { requireOrg } from '@/lib/auth';
import type { Scope } from '@/lib/whatsapp/akg';
import { fail } from './_http';

export type ScopeResult = { ok: true; scope: Scope } | { ok: false; response: NextResponse };

/**
 * Escopo (orgId + userId) a partir da sessão do Prospectra.
 * O `orgId` NUNCA vem do cliente: é sempre o da sessão.
 * `requireOrg()` redireciona quando não há sessão/equipe; aqui isso vira 401/403 em JSON.
 */
export async function requireScope(): Promise<ScopeResult> {
  try {
    const ctx = await requireOrg();
    return { ok: true, scope: { orgId: ctx.org.id, userId: ctx.user.id } };
  } catch (err) {
    const digest =
      typeof err === 'object' && err !== null && 'digest' in err && typeof (err as { digest?: unknown }).digest === 'string'
        ? (err as { digest: string }).digest
        : '';
    if (digest.startsWith('NEXT_REDIRECT')) {
      const target = digest.split(';')[2] ?? '';
      if (target === '/login') {
        return { ok: false, response: fail('Sessão expirada. Entre novamente.', 401) };
      }
      return { ok: false, response: fail('Você não tem acesso a esta operação.', 403) };
    }
    return { ok: false, response: fail('Não foi possível validar a sessão.', 500) };
  }
}

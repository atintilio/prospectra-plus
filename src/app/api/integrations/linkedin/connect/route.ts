import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { disconnect, getLinkedInStatus } from '@/lib/linkedin/connection';
import { requireLinkedInScope } from '../_auth';

export const dynamic = 'force-dynamic';

/**
 * Estado da conta LinkedIn do usuário logado.
 *
 * O `orgId` vem SEMPRE da sessão (`requireOrg`), nunca do cliente: a conexão
 * é da pessoa na operação dela. Resposta: `{ status, profile? }` com status
 * `disconnected` | `authenticated` | `configuration_required` | `unavailable`.
 */
export async function GET() {
  const scope = await requireLinkedInScope();
  if (!scope.ok) return scope.response;
  try {
    const db = await getDb();
    return NextResponse.json(await getLinkedInStatus(scope.userId, scope.orgId, db));
  } catch {
    // Sem banco não há estado: honesto e sem quebrar a tela.
    return NextResponse.json({ status: 'unavailable' });
  }
}

/** Desconecta a conta do usuário logado (o registro fica como `revoked`). */
export async function DELETE() {
  const scope = await requireLinkedInScope();
  if (!scope.ok) return scope.response;
  try {
    const db = await getDb();
    await disconnect(scope.userId, scope.orgId, db);
    return NextResponse.json({ ok: true, status: 'disconnected' });
  } catch {
    return NextResponse.json({ ok: false, error: 'Não foi possível desconectar a conta LinkedIn.' }, { status: 500 });
  }
}

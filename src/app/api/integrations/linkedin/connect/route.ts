import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
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
    const status = await getLinkedInStatus(scope.userId, scope.orgId, db);
    // Na DEMONSTRAÇÃO a conta é a da persona ("João da Silva"): o visitante
    // vê um caso completo e coerente. Fora da demo, cada pessoa vê a própria.
    if (status.status !== 'authenticated' && (await isDemoOrg(db, scope.orgId))) {
      const persona = await demoPersonaConnection(db, scope.orgId);
      if (persona) return NextResponse.json({ ...persona, demo: true });
    }
    return NextResponse.json(status);
  } catch {
    // Sem banco não há estado: honesto e sem quebrar a tela.
    return NextResponse.json({ status: 'unavailable' });
  }
}

/** A operação da sessão é a demonstração? */
async function isDemoOrg(db: Awaited<ReturnType<typeof getDb>>, orgId: string): Promise<boolean> {
  const [row] = await db.select({ isDemo: schema.orgs.isDemo }).from(schema.orgs).where(eq(schema.orgs.id, orgId)).limit(1);
  return row?.isDemo === true;
}

/** Conexão da persona da demo (a conta "João da Silva"). */
async function demoPersonaConnection(db: Awaited<ReturnType<typeof getDb>>, orgId: string) {
  const [row] = await db
    .select({
      profileName: schema.linkedinConnections.profileName,
      profileEmail: schema.linkedinConnections.profileEmail,
      connectedAt: schema.linkedinConnections.connectedAt,
    })
    .from(schema.linkedinConnections)
    .where(eq(schema.linkedinConnections.orgId, orgId))
    .limit(1);
  if (!row?.profileName) return null;
  return {
    status: 'authenticated' as const,
    profile: {
      name: row.profileName,
      email: row.profileEmail || undefined,
      connectedAt: (row.connectedAt ?? new Date()).toISOString(),
    },
  };
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

import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireUser } from '@/lib/auth';
import { resetDemo } from '@/lib/demo-reset';

export const dynamic = 'force-dynamic';

/**
 * Recria a demonstração do zero (operação de demonstração do usuário).
 *
 * Só quem é administrador do Prospectra pode chamar: a rota apaga a operação
 * de demonstração do usuário e semeia a base fictícia de novo. A operação de
 * produção nunca é tocada — o reset age só em `orgs.is_demo = true`.
 */
export async function POST() {
  const ctx = await requireUser();
  if (ctx.user.platformRole !== 'admin') {
    return NextResponse.json({ error: 'Somente administradores podem recriar a demonstração.' }, { status: 403 });
  }
  const db = await getDb();
  try {
    const orgId = await resetDemo(db, { id: ctx.user.id, name: ctx.user.name ?? ctx.user.email });
    return NextResponse.json({ ok: true, orgId });
  } catch (error) {
    console.error('[demo] falha ao recriar a demonstracao', error);
    return NextResponse.json({ error: 'Não foi possível recriar a demonstração.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { requireLinkedInScope } from '../../linkedin/_auth';
import { disconnect, status } from '@/lib/office365/connection';

export const dynamic = 'force-dynamic';

export async function GET() {
  const scope = await requireLinkedInScope();
  if (!scope.ok) return scope.response;
  try { return NextResponse.json(await status(scope, await getDb())); }
  catch { return NextResponse.json({ status: 'unavailable' }, { status: 503 }); }
}

export async function DELETE(req: Request) {
  const expectedOrigin = new URL(process.env.PUBLIC_APP_URL || req.url).origin;
  if (req.headers.get('origin') !== expectedOrigin || (req.headers.has('content-type') && !req.headers.get('content-type')?.startsWith('application/json'))) {
    return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  }
  const scope = await requireLinkedInScope();
  if (!scope.ok) return scope.response;
  try {
    await disconnect(scope, await getDb());
    return NextResponse.json({ status: 'disconnected' });
  } catch { return NextResponse.json({ error: 'Não foi possível desconectar a conta.' }, { status: 500 }); }
}

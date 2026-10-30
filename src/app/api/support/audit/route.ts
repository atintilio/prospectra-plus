import { NextResponse } from 'next/server';
import { requireOrg } from '@/lib/auth';
import { listAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Trilha de auditoria da operação (ações recentes). */
export async function GET(req: Request) {
  const ctx = await requireOrg();
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? '100');
  const action = url.searchParams.get('action') ?? undefined;
  const entity = url.searchParams.get('entity') ?? undefined;
  const days = Number(url.searchParams.get('days') ?? '0');
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined;

  const rows = await listAudit(ctx.org.id, {
    limit: Number.isFinite(limit) ? limit : 100,
    action: action || undefined,
    entity: entity || undefined,
    since,
  });

  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      actorUserId: r.actorUserId,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

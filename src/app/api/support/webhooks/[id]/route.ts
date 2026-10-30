import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrg, canManage } from '@/lib/auth';
import { updateWebhook, deleteWebhook } from '@/lib/webhooks';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const BODY = z.object({
  url: z.string().min(8).max(500).optional(),
  events: z.array(z.string()).min(1).optional(),
  active: z.boolean().optional(),
});

/** Atualiza um webhook. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireOrg();
  if (!canManage(session.role)) {
    return NextResponse.json({ error: 'Apenas gestores podem alterar webhooks.' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const parsed = BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 });
  }
  try {
    const hook = await updateWebhook(session.org.id, id, parsed.data);
    if (!hook) return NextResponse.json({ error: 'Webhook não encontrado.' }, { status: 404 });
    await recordAudit(session.org.id, {
      actorUserId: session.user.id,
      action: 'webhook.updated',
      entity: 'webhook_endpoint',
      entityId: hook.id,
      payload: { url: hook.url, events: hook.events, active: hook.active },
    });
    return NextResponse.json({ webhook: { id: hook.id, url: hook.url, events: hook.events, active: hook.active } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Não foi possível atualizar o webhook.' }, { status: 400 });
  }
}

/** Remove um webhook. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireOrg();
  if (!canManage(session.role)) {
    return NextResponse.json({ error: 'Apenas gestores podem remover webhooks.' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const ok = await deleteWebhook(session.org.id, id);
  if (!ok) return NextResponse.json({ error: 'Webhook não encontrado.' }, { status: 404 });
  await recordAudit(session.org.id, {
    actorUserId: session.user.id,
    action: 'webhook.deleted',
    entity: 'webhook_endpoint',
    entityId: id,
  });
  return NextResponse.json({ ok: true });
}

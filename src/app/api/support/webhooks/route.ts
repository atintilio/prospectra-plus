import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrg, canManage } from '@/lib/auth';
import { getDb } from '@/db';
import { listWebhooks, createWebhook, WEBHOOK_EVENTS } from '@/lib/webhooks';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Webhooks cadastrados pela operação. */
export async function GET() {
  const ctx = await requireOrg();
  const db = await getDb();
  const rows = await listWebhooks(db, ctx.org.id);
  return NextResponse.json({
    webhooks: rows.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      active: w.active,
      // A assinatura só é exibida no momento da criação.
      secretPreview: `${w.secret.slice(0, 6)}…${w.secret.slice(-4)}`,
      createdAt: w.createdAt.toISOString(),
    })),
    events: WEBHOOK_EVENTS,
  });
}

const BODY = z.object({
  url: z.string().min(8, 'Informe a URL completa do parceiro').max(500),
  events: z.array(z.string()).min(1, 'Escolha ao menos um evento'),
  active: z.boolean().optional(),
});

/** Cadastra um webhook (a assinatura aparece só nesta resposta). */
export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Apenas gestores podem cadastrar webhooks.' }, { status: 403 });
  }
  const parsed = BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 });
  }
  try {
    const hook = await createWebhook(ctx.org.id, parsed.data);
    await recordAudit(ctx.org.id, {
      actorUserId: ctx.user.id,
      action: 'webhook.created',
      entity: 'webhook_endpoint',
      entityId: hook.id,
      payload: { url: hook.url, events: hook.events },
    });
    return NextResponse.json({
      webhook: { id: hook.id, url: hook.url, events: hook.events, active: hook.active },
      secret: hook.secret,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Não foi possível criar o webhook.' }, { status: 400 });
  }
}

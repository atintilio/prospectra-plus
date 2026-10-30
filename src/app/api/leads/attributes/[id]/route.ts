import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrg, canManage } from '@/lib/auth';
import { updateAttributeDef, deleteAttributeDef } from '@/lib/lead-attributes';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const BODY = z.object({
  name: z.string().min(1).max(80).optional(),
  type: z.enum(['text', 'number', 'date', 'bool', 'select']).optional(),
  options: z.union([z.array(z.string()), z.string()]).optional(),
  required: z.boolean().optional(),
  position: z.number().int().optional(),
});

/** Atualiza um campo personalizado. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireOrg();
  if (!canManage(session.role)) {
    return NextResponse.json({ error: 'Apenas gestores podem alterar os campos.' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const parsed = BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 });
  }
  try {
    const def = await updateAttributeDef(session.org.id, id, parsed.data);
    await recordAudit(session.org.id, {
      actorUserId: session.user.id,
      action: 'lead_attribute.updated',
      entity: 'lead_attribute_def',
      entityId: def.id,
      payload: { name: def.name, key: def.key },
    });
    return NextResponse.json({ def });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Não foi possível atualizar o campo.' }, { status: 400 });
  }
}

/** Remove um campo personalizado (os valores preenchidos são preservados no lead). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireOrg();
  if (!canManage(session.role)) {
    return NextResponse.json({ error: 'Apenas gestores podem alterar os campos.' }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    await deleteAttributeDef(session.org.id, id);
    await recordAudit(session.org.id, {
      actorUserId: session.user.id,
      action: 'lead_attribute.deleted',
      entity: 'lead_attribute_def',
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Não foi possível remover o campo.' }, { status: 400 });
  }
}

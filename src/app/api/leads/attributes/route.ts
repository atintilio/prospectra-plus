import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrg, canManage } from '@/lib/auth';
import { listAttributeDefs, createAttributeDef } from '@/lib/lead-attributes';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Lista os campos personalizados da operação. */
export async function GET() {
  const ctx = await requireOrg();
  const defs = await listAttributeDefs(ctx.org.id);
  return NextResponse.json({ defs });
}

const BODY = z.object({
  name: z.string().min(1, 'Informe o nome do campo').max(80),
  type: z.enum(['text', 'number', 'date', 'bool', 'select']).optional(),
  options: z.union([z.array(z.string()), z.string()]).optional(),
  required: z.boolean().optional(),
  position: z.number().int().optional(),
});

/** Cria um campo personalizado. */
export async function POST(req: Request) {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Apenas gestores podem alterar os campos.' }, { status: 403 });
  }
  const parsed = BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 });
  }
  try {
    const def = await createAttributeDef(ctx.org.id, parsed.data);
    await recordAudit(ctx.org.id, {
      actorUserId: ctx.user.id,
      action: 'lead_attribute.created',
      entity: 'lead_attribute_def',
      entityId: def.id,
      payload: { name: def.name, key: def.key, type: def.type },
    });
    return NextResponse.json({ def }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Não foi possível criar o campo.' }, { status: 400 });
  }
}

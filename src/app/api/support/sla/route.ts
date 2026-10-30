import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrg, canManage } from '@/lib/auth';
import { getSlaPolicy, updateSlaPolicy } from '@/lib/support-sla';
import { getSchedule } from '@/lib/support-schedule';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Política de SLA da operação + o horário que ela respeita. */
export async function GET() {
  const ctx = await requireOrg();
  const [policy, schedule] = await Promise.all([getSlaPolicy(ctx.org.id), getSchedule(ctx.org.id)]);
  return NextResponse.json({ policy, schedule });
}

const BODY = z.object({
  firstResponseMinutes: z.number().int().min(5).max(43200).optional(),
  resolutionMinutes: z.number().int().min(5).max(43200).optional(),
  businessHoursOnly: z.boolean().optional(),
});

/** Atualiza a política de SLA. */
export async function PUT(req: Request) {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Apenas gestores podem mudar o SLA.' }, { status: 403 });
  }
  const parsed = BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 });
  }
  try {
    const policy = await updateSlaPolicy(ctx.org.id, parsed.data);
    await recordAudit(ctx.org.id, {
      actorUserId: ctx.user.id,
      action: 'sla_policy.updated',
      entity: 'support_sla_policy',
      entityId: policy.id,
      payload: {
        firstResponseMinutes: policy.firstResponseMinutes,
        resolutionMinutes: policy.resolutionMinutes,
        businessHoursOnly: policy.businessHoursOnly,
      },
    });
    return NextResponse.json({ policy });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Não foi possível salvar o SLA.' }, { status: 400 });
  }
}

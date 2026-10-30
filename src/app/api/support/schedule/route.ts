import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrg, canManage } from '@/lib/auth';
import { getSchedule, upsertSchedule, isValidTimeZone } from '@/lib/support-schedule';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** Horário de atendimento da operação. */
export async function GET() {
  const ctx = await requireOrg();
  const schedule = await getSchedule(ctx.org.id);
  return NextResponse.json({ schedule });
}

const BODY = z.object({
  timezone: z.string().min(1).max(64).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  openMinute: z.number().int().min(0).max(1440).optional(),
  closeMinute: z.number().int().min(0).max(1440).optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyMessage: z.string().max(1000).optional(),
});

/** Atualiza o horário de atendimento e a auto-resposta. */
export async function PUT(req: Request) {
  const ctx = await requireOrg();
  if (!canManage(ctx.role)) {
    return NextResponse.json({ error: 'Apenas gestores podem mudar o horário.' }, { status: 403 });
  }
  const parsed = BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 });
  }
  if (parsed.data.timezone && !isValidTimeZone(parsed.data.timezone)) {
    return NextResponse.json({ error: 'Fuso horário inválido.' }, { status: 400 });
  }
  try {
    const schedule = await upsertSchedule(ctx.org.id, parsed.data);
    await recordAudit(ctx.org.id, {
      actorUserId: ctx.user.id,
      action: 'schedule.updated',
      entity: 'support_schedule',
      entityId: schedule.id,
      payload: {
        timezone: schedule.timezone,
        weekdays: schedule.weekdays,
        openMinute: schedule.openMinute,
        closeMinute: schedule.closeMinute,
        autoReplyEnabled: schedule.autoReplyEnabled,
      },
    });
    return NextResponse.json({ schedule });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Não foi possível salvar o horário.' }, { status: 400 });
  }
}

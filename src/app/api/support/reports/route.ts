import { requireOrg } from '@/lib/auth';
import { parseDay, parseDayEnd, supportReport } from '@/lib/support-reports';

export const dynamic = 'force-dynamic';

/**
 * Relatório de atendimento da operação (volume, primeira resposta, SLA, resolução,
 * CSAT, agentes e times).
 * GET /api/support/reports?from=2026-10-01&to=2026-10-31 (datas em YYYY-MM-DD).
 * Sem período: últimos 30 dias. Só devolve dados da operação do usuário.
 */
export async function GET(req: Request) {
  const ctx = await requireOrg();
  const params = new URL(req.url).searchParams;

  const fromRaw = params.get('from');
  const toRaw = params.get('to');
  const from = fromRaw ? parseDay(fromRaw) : null;
  const to = toRaw ? parseDayEnd(toRaw) : null;
  if ((fromRaw && !from) || (toRaw && !to)) {
    return Response.json({ error: 'Período inválido. Use from/to no formato YYYY-MM-DD.' }, { status: 400 });
  }

  const report = await supportReport(ctx.org.id, { from, to });
  return Response.json(report);
}

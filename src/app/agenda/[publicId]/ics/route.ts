import { getDb } from '@/db';
import { buildIcs, getMeetingByToken } from '@/lib/agenda';

export const dynamic = 'force-dynamic';

// Convite .ics público (mesmo token da página da reunião).
export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const db = await getDb();
  const m = await getMeetingByToken(db, publicId);
  if (!m) return new Response('Not found', { status: 404 });
  const ics = buildIcs(m, m.status);
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8; method=REQUEST',
      'Content-Disposition': `attachment; filename="prospectra-${m.publicId.slice(0, 8)}.ics"`,
    },
  });
}

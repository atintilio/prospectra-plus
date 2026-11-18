import { getDb } from '@/db';
import { aiGenerator } from '@/lib/ai';
import { runScheduler } from '@/lib/cadence';
import { flushDeletionReports } from '@/lib/deletion-audit';
import { goEnabled } from '@/lib/go/client';
import { pushDueActionsToGo } from '@/lib/go/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Chamado pela Vercel Cron (diário no plano Hobby). As telas também rodam o scheduler ao abrir.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });
  const db = await getDb();
  const r = await runScheduler(db, { generate: aiGenerator });
  await flushDeletionReports(db);
  // Automação híbrida: se o Go estiver ligado, entrega as ações pendentes ao worker.
  // Falha do Go nunca derruba o cron; a ação fica pendente para o próximo ciclo.
  let go: { pushed: number; skipped: number; failed: number } | undefined;
  if (goEnabled()) { try { go = await pushDueActionsToGo(db); } catch { go = { pushed: 0, skipped: 0, failed: 0 }; } }
  return Response.json({ ...r, go });
}


import { getDb } from '@/db';
import { aiGenerator } from '@/lib/ai';
import { runScheduler } from '@/lib/cadence';
import {runHarveyQueue} from '@/lib/harvey-operations';
import { flushDeletionReports } from '@/lib/deletion-audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Chamado pela Vercel Cron (diário no plano Hobby). As telas também rodam o scheduler ao abrir.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });
  const db = await getDb();
  const r = await runScheduler(db, { generate: aiGenerator });
  await flushDeletionReports(db);
  const harvey=await runHarveyQueue(db);
  return Response.json({...r,harvey});
}


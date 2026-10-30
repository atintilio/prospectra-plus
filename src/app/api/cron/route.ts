import { getDb } from '@/db';
import { aiGenerator } from '@/lib/ai';
import { runScheduler } from '@/lib/cadence';
import {runHarveyQueue} from '@/lib/harvey-operations';
import {resumeHarveyInbound} from '@/lib/harvey-webhooks';
import { flushDeletionReports } from '@/lib/deletion-audit';
import { discoverPendingDisc } from '@/lib/communication';
import { runLinkedinQueue, linkedinAutomationEnabled } from '@/lib/linkedin/automation';
import { linkedinExecutor } from '@/lib/linkedin/http-executor';
import { sendMeetingReminders } from '@/lib/agenda-reminders';
import { runIntelligenceQueue, type IntelligenceRunSummary } from '@/lib/intelligence/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Chamado pela Vercel Cron (diário no plano Hobby). As telas também rodam o scheduler ao abrir.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });
  const db = await getDb();
  const r = await runScheduler(db, { generate: aiGenerator });
  await flushDeletionReports(db);
  const harveyInbound=await resumeHarveyInbound(db);
  const harvey=await runHarveyQueue(db);
  // LinkedIn automático só despacha quando ligado e com worker configurado; senão fica assistido.
  const linkedin = linkedinAutomationEnabled() ? await runLinkedinQueue(db, { executor: linkedinExecutor() }) : null;
  const disc = await discoverPendingDisc(db);
  // Lembrete das reuniões que entram na janela — uma vez por reserva.
  const reminders = await sendMeetingReminders(db);
  // Fila da inteligência comercial: o executor conclui as análises enfileiradas.
  // Uma falha aqui não pode derrubar as outras rotinas do cron.
  let intelligence: IntelligenceRunSummary | null = null;
  try {
    intelligence = await runIntelligenceQueue(db);
  } catch (error) {
    console.error('[intelligence] falha ao rodar o ciclo da fila:', error instanceof Error ? error.message : String(error));
  }
  return Response.json({...r,harveyInbound,harvey,linkedin,disc,reminders,intelligence});
}


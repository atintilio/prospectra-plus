import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { aiConfigured } from '@/lib/ai';
import { mailerConfigured } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export async function GET() {
  let database = 'ok';
  try { const db = await getDb(); await db.execute(sql`select 1`); } catch { database = 'error'; }
  return Response.json({ status: database === 'ok' ? 'ok' : 'degraded', version: '2.0.0', database, office365: mailerConfigured() ? 'configured' : 'missing', ai: aiConfigured() ? 'configured' : 'missing' },
    { status: database === 'ok' ? 200 : 503 });
}

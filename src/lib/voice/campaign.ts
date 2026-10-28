import 'server-only';
import { and, eq } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import { completeAction } from '@/lib/cadence';

// Quando a mensagem de voz é enviada, conclui a ação da campanha e avança a cadência.
// O job de voz da campanha usa job.id == action.id; jobs manuais (sem ação) são ignorados.
export async function completeVoiceAction(db: DB, job: { id: string; orgId: string; userId: string; text: string }): Promise<boolean> {
  const [action] = await db.select({ id: schema.actions.id }).from(schema.actions)
    .where(and(eq(schema.actions.id, job.id), eq(schema.actions.orgId, job.orgId)));
  if (!action) return false;
  await completeAction(db, job.orgId, job.userId, job.id, 'done', job.text);
  return true;
}

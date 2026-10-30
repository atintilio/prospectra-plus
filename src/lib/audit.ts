import 'server-only';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { getDb, schema, type DB } from '@/db';

/**
 * Trilha de auditoria (Helpin fase D).
 *
 * Toda ação sensível (mudar política de SLA, criar webhook, responder
 * ticket, responder CSAT…) vira um registro consultável por operação.
 */

export const AUDIT_ENTITIES = [
  'support_conversation', 'support_sla_policy', 'support_schedule', 'support_prechat_form',
  'lead_attribute_def', 'webhook_endpoint', 'csat', 'automation_rule',
] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export type AuditEntryInput = {
  actorUserId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

export type AuditRow = typeof schema.auditLog.$inferSelect;

export type AuditQuery = {
  limit?: number;
  action?: string;
  entity?: string;
  since?: Date;
  until?: Date;
};

/** Registra uma ação. Nunca lança erro para não derrubar a operação principal. */
export async function recordAudit(orgId: string, entry: AuditEntryInput): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      orgId,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      payload: (entry.payload ?? {}) as Record<string, unknown>,
    });
  } catch (err) {
    console.error('[audit] falha ao registrar', entry.action, err);
  }
}

export async function listAudit(orgId: string, query: AuditQuery = {}): Promise<AuditRow[]> {
  const db = await getDb();
  const filters: SQL[] = [eq(schema.auditLog.orgId, orgId)];
  if (query.action) filters.push(eq(schema.auditLog.action, query.action));
  if (query.entity) filters.push(eq(schema.auditLog.entity, query.entity));
  if (query.since) filters.push(gte(schema.auditLog.createdAt, query.since));
  if (query.until) filters.push(lte(schema.auditLog.createdAt, query.until));
  const limit = Math.max(1, Math.min(500, query.limit ?? 100));
  return db.select().from(schema.auditLog).where(and(...filters)).orderBy(desc(schema.auditLog.createdAt)).limit(limit);
}

/** Trimestre os registros por ação (usado na visão de atividade). */
export async function auditSummary(orgId: string, since?: Date): Promise<{ action: string; count: number }[]> {
  const db: DB = await getDb();
  const rows = await db
    .select({ action: schema.auditLog.action, count: schema.auditLog.id })
    .from(schema.auditLog)
    .where(since ? and(eq(schema.auditLog.orgId, orgId), gte(schema.auditLog.createdAt, since)) : eq(schema.auditLog.orgId, orgId))
    .groupBy(schema.auditLog.action)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(50);
  return rows.map((r) => ({ action: r.action, count: Number(r.count ?? 0) }));
}

import { and, asc, eq } from 'drizzle-orm';
import { schema, type DB } from '@/db';

/** Parceiro padrão dos usuários vindos do v1: a org do dono (admin master) ou a mais antiga. */
export async function defaultOrgId(db: DB): Promise<string | null> {
  const [owned] = await db.select({ id: schema.orgs.id }).from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.role, 'owner'), eq(schema.orgs.isDemo, false), eq(schema.orgs.active, true)))
    .orderBy(asc(schema.orgs.createdAt)).limit(1);
  if (owned) return owned.id;
  const [any] = await db.select({ id: schema.orgs.id }).from(schema.orgs)
    .where(and(eq(schema.orgs.isDemo, false), eq(schema.orgs.active, true))).orderBy(asc(schema.orgs.createdAt)).limit(1);
  return any?.id ?? null;
}

/** Usuário sem nenhuma equipe (caso típico de conta migrada do v1) entra na equipe padrão. */
export async function ensureTeam(db: DB, userId: string, legacyRole?: string | null): Promise<boolean> {
  const [has] = await db.select({ orgId: schema.memberships.orgId }).from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.orgs.isDemo, false))).limit(1);
  if (has) return false;
  const orgId = await defaultOrgId(db);
  if (!orgId) return false;
  await db.insert(schema.memberships).values({ orgId, userId, role: legacyRole === 'admin' ? 'manager' : 'sdr' }).onConflictDoNothing();
  return true;
}

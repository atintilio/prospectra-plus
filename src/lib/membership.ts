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

/**
 * Garante que o admin master tenha operação e equipe de dono.
 *
 * Depois de um incidente em que o banco foi recriado, as operações podem sumir
 * mesmo com as contas de pé: o login cria a sessão sem parceiro e o usuário cai
 * em /sem-equipe, com o Prospectra "aberto" mas sem nada para usar.
 */
export async function ensureMasterOrg(db: DB, userId: string, orgName = 'Argus Prime'): Promise<string> {
  const [membership] = await db.select({ orgId: schema.memberships.orgId }).from(schema.memberships)
    .where(eq(schema.memberships.userId, userId)).limit(1);
  if (membership) return membership.orgId;
  const [found] = await db.select().from(schema.orgs).where(eq(schema.orgs.name, orgName)).limit(1);
  const org = found ?? (await db.insert(schema.orgs).values({ name: orgName, seats: 50, searchCreditsMonth: 5000 }).returning())[0];
  await db.insert(schema.memberships).values({ orgId: org.id, userId, role: 'owner' }).onConflictDoNothing();
  return org.id;
}

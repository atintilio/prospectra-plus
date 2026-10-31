import { and, eq, inArray, like } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import { ensureDemo, findDemoOrg } from '@/lib/demo';

/**
 * Recria a demonstração do zero: apaga tudo que pertence à operação de
 * demonstração do usuário e semeia a base fictícia novamente.
 *
 * Serve para apresentar a suíte sempre igual, do começo ao fim.
 * Nunca toca na operação de produção.
 *
 * Ao apagar a org, o banco limpa as tabelas filhas em cascade. Duas não
 * cascateiam e são apagadas antes: `sessions` (set null) e `deletion_reports`
 * (sem chave estrangeira).
 */
export async function resetDemo(db: DB, user: { id: string; name: string }): Promise<string> {
  const orgId = await findDemoOrg(db, user.id);
  if (!orgId) return ensureDemo(db, user);

  // membros da demo (para apagar as contas ficticias depois)
  const membros = await db
    .select({ id: schema.users.id })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, orgId));

  // 1) o que nao cascateia
  await db.delete(schema.sessions).where(eq(schema.sessions.orgId, orgId));
  await db.delete(schema.deletionReports).where(eq(schema.deletionReports.orgId, orgId));

  // 2) a operacao (cascade limpa o resto)
  await db.delete(schema.orgs).where(eq(schema.orgs.id, orgId));

  // 3) as contas ficticias (nao tem cascade: ficam orfas).
  // CUIDADO: o dono da demo (o usuario logado) NAO e ficticio e nao pode ser apagado.
  const ficticios = membros.map((m) => m.id).filter((id) => id !== user.id);
  if (ficticios.length) {
    await db.delete(schema.users).where(
      and(
        inArray(schema.users.id, ficticios),
        like(schema.users.email, 'demo-%@demo.invalid'),
      ),
    );
  }

  // 4) semeia de novo
  return ensureDemo(db, user);
}

/** A demonstracao deste usuario ja existe? */
export async function demoExists(db: DB, userId: string): Promise<boolean> {
  return Boolean(await findDemoOrg(db, userId));
}

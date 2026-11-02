import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import * as schema from '@/db/schema';

/**
 * Subquery correlacionada precisa qualificar a coluna da tabela externa.
 *
 * Dentro de um fragmento `sql`, a interpolação de uma coluna (`${schema.orgs.id}`)
 * é renderizada **sem** o nome da tabela (`"id"`). Quem executa é o Postgres:
 * se a subquery tem uma tabela própria, `"id"` resolve contra ela e o
 * resultado sai errado (contagem zerada, e-mail vazio) — sem dar erro.
 *
 * A forma correta é interpolar a tabela (`${schema.orgs}.id` → `"orgs".id`).
 */
function sqlDe(q: { toSQL: () => { sql: string } }): string {
  return q.toSQL().sql;
}

describe('sql correlacionado — referência qualificada', () => {
  const db = drizzle(new PGlite(), { schema });

  it('a contagem de blocos e campanhas do fluxo referencia "flows".id', () => {
    const texto = sqlDe(db.select({
      f: schema.flows,
      steps: sql<number>`(select count(*) from ${schema.flowSteps} fs where fs.flow_id = ${schema.flows}.id)`.mapWith(Number),
      campaigns: sql<number>`(select count(*) from ${schema.campaigns} c where c.flow_id = ${schema.flows}.id)`.mapWith(Number),
    }).from(schema.flows).where(eq(schema.flows.orgId, schema.orgs.id)));
    expect(texto).toContain('"flows".id');
    expect(texto).not.toMatch(/=\s*"id"\)/);
  });

  it('as contagens da lista de campanhas referenciam "campaigns".id', () => {
    const texto = sqlDe(db.select({
      c: schema.campaigns,
      enrolled: sql<number>`(select count(*) from ${schema.enrollments} e where e.campaign_id = ${schema.campaigns}.id)`.mapWith(Number),
      replies: sql<number>`(select count(*) from ${schema.events} ev where ev.campaign_id = ${schema.campaigns}.id and ev.type = 'reply_received')`.mapWith(Number),
    }).from(schema.campaigns).where(eq(schema.campaigns.orgId, schema.orgs.id)));
    expect(texto).toContain('"campaigns".id');
    expect(texto).not.toMatch(/=\s*"id"\)/);
  });

  it('as contagens e o dono da operação referenciam "orgs".id', () => {
    const texto = sqlDe(db.select({
      o: schema.orgs,
      members: sql<number>`(select count(*) from ${schema.memberships} m where m.org_id = ${schema.orgs}.id)`.mapWith(Number),
      owner: sql<string>`(select u.email from ${schema.memberships} m join ${schema.users} u on u.id = m.user_id where m.org_id = ${schema.orgs}.id and m.role = 'owner' limit 1)`,
    }).from(schema.orgs).where(eq(schema.orgs.isDemo, false)));
    expect(texto).toContain('"orgs".id');
    expect(texto).not.toMatch(/=\s*"id"\)/);
  });

  it('a lista de operações do usuário referencia "users".id', () => {
    const texto = sqlDe(db.select({
      id: schema.users.id,
      orgs: sql<string>`coalesce((select string_agg(o.name, ', ') from ${schema.memberships} m join ${schema.orgs} o on o.id = m.org_id where m.user_id = ${schema.users}.id), '')`,
    }).from(schema.users));
    expect(texto).toContain('"users".id');
    expect(texto).not.toMatch(/=\s*"id"\)/);
  });
});

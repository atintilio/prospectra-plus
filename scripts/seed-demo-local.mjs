// Insere uma operação de demonstração JÁ EXISTE (sem semear a base fictícia):
// serve só para exercitar o botão da topbar em ambiente local.
import { PGlite } from '@electric-sql/pglite';
const EMAIL = process.env.SEED_EMAIL || 'teste@prospectra.invalid';
const c = new PGlite('.data/dev');
await c.waitReady;
const u = (await c.query('select id from users where email = $1', [EMAIL])).rows[0];
if (!u) { console.error('usuario nao encontrado'); process.exit(2); }
const existe = (await c.query('select id from orgs where is_demo = true and id in (select org_id from memberships where user_id = $1)', [u.id])).rows[0];
if (existe) { console.log('demo ja existe:', existe.id); }
else {
  const o = (await c.query(`insert into orgs (name, seats, search_credits_month, is_demo) values ('Demonstração · Atlas Consultoria', 8, 300, true) returning id`)).rows[0];
  await c.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'owner')`, [o.id, u.id]);
  console.log('demo criada:', o.id);
}
await c.close();
process.exit(0);

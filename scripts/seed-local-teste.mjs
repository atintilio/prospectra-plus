// Semeia o banco local (pglite) para o teste manual do botão de demonstração.
//   node scripts/seed-local-teste.mjs
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const DIR = process.env.PGLITE_DIR || '.data/dev';
const EMAIL = process.env.SEED_EMAIL || 'teste@prospectra.invalid';
const SENHA = process.env.SEED_SENHA || 'SenhaLocal123!';

const salt = randomBytes(16);
const key = await scrypt(SENHA, salt, 64);
const hash = `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;

const client = new PGlite(DIR);
const db = drizzle(client, { schema: {} });
await migrate(db, { migrationsFolder: 'drizzle' });

const existing = (await client.query('select id from users where email = $1', [EMAIL])).rows;
if (existing.length) {
  console.log('usuario ja existe:', EMAIL);
  await client.close();
  process.exit(0);
}

const inserted = await client.query(
  `insert into users (email, name, password_hash, platform_role, status)
   values ($1, $2, $3, 'user', 'active') returning id`,
  [EMAIL, 'Teste Local', hash],
);
const user = inserted.rows[0];
const insertedOrg = await client.query(
  `insert into orgs (name, seats, search_credits_month) values ('Argus Prime', 10, 500) returning id`,
);
const org = insertedOrg.rows[0];
await client.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'owner')`, [org.id, user.id]);

console.log(JSON.stringify({ email: EMAIL, senha: SENHA, org: org.id, user: user.id }));
await client.close();
process.exit(0);

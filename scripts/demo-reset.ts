/**
 * Recria a demonstração do zero pela linha de comando.
 *
 * Uso (na VPS):
 *   set -a; . /etc/prospectra-plus/app.env; set +a
 *   DEMO_USER_EMAIL=atintilio@argusprime.com.br pnpm exec tsx scripts/demo-reset.ts
 *
 * O que faz: apaga a operação de demonstração do usuário (em cascata no banco)
 * e semeia tudo de novo — CRM, campanhas, agenda, voz, suporte, inteligência.
 * A operação de produção nunca é tocada.
 */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { resetDemo } from '../src/lib/demo-reset';

async function main() {
  const email = (process.env.DEMO_USER_EMAIL ?? '').trim().toLowerCase();
  if (!email) {
    console.error('Informe DEMO_USER_EMAIL com o e-mail de quem tem a demonstração.');
    process.exit(1);
  }
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    console.error(`Nenhum usuário com o e-mail ${email}.`);
    process.exit(1);
  }
  const orgId = await resetDemo(db, { id: user.id, name: user.name ?? email });
  console.log(`Demonstração recriada. orgId=${orgId}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Falha ao recriar a demonstração:', error);
  process.exit(1);
});

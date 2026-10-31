import { FlaskConical, RotateCcw, Rocket } from 'lucide-react';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireUser } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { chooseEnvAction, resetDemoAction } from '@/app/(app)/actions';
import { logoutAction } from '@/app/(auth)/actions';

export const metadata = { title: 'Escolha o ambiente' };

export default async function AmbientePage() {
  const ctx = await requireUser();
  const db = await getDb();
  const prod = ctx.user.platformRole === 'admin'
    ? await db.select({ name: schema.orgs.name }).from(schema.orgs).where(eq(schema.orgs.isDemo, false)).limit(1)
    : await db.select({ name: schema.orgs.name }).from(schema.memberships).innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
        .where(and(eq(schema.memberships.userId, ctx.user.id), eq(schema.orgs.isDemo, false), eq(schema.orgs.active, true))).limit(1);
  const demo = await db.select({ id: schema.orgs.id }).from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, ctx.user.id), eq(schema.orgs.isDemo, true))).limit(1);
  const first = (ctx.user.name || '').split(' ')[0];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#eaf1ff,#fefefe_60%)] px-6 py-10">
      <Logo size={44} />
      <h1 className="mt-8 text-center text-3xl font-semibold tracking-tight">Olá{first ? `, ${first}` : ''}. Onde você quer entrar?</h1>
      <p className="mt-2 text-center text-muted">Você pode trocar de ambiente a qualquer momento pelo topo da tela.</p>
      <div className="mt-10 grid w-full max-w-3xl gap-5 sm:grid-cols-2">
        <form action={chooseEnvAction} className="card flex flex-col p-7 shadow-sm">
          <input type="hidden" name="env" value="prod" />
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white"><Rocket className="h-6 w-6" /></span>
          <h2 className="mt-5 text-xl font-semibold">Produção</h2>
          <p className="mt-1 flex-1 text-sm text-muted">Sua operação real{prod[0] ? `: ${prod[0].name}` : ''}. Leads, cadências e fila do dia de verdade.</p>
          <button className="btn-primary mt-6">Entrar em produção</button>
        </form>
        <div className="card flex flex-col p-7 shadow-sm">
          <form action={chooseEnvAction} className="flex flex-1 flex-col">
            <input type="hidden" name="env" value="demo" />
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 text-white"><FlaskConical className="h-6 w-6" /></span>
            <h2 className="mt-5 text-xl font-semibold">Demonstração</h2>
            <p className="mt-1 flex-1 text-sm text-muted">Um caso fictício completo para mostrar a parceiros: leads, campanhas, fila, equipe, agenda, suporte e inteligência. Nada é enviado de verdade.</p>
            <button className="btn-outline mt-6">Abrir demonstração</button>
          </form>
          {demo[0] && (
            <form action={resetDemoAction} className="mt-3">
              <button type="submit" className="btn-ghost w-full"><RotateCcw className="mr-2 inline h-4 w-4" />Recriar do zero</button>
            </form>
          )}
        </div>
      </div>
      <form action={logoutAction} className="mt-8"><button className="btn-ghost">Sair</button></form>
    </main>
  );
}

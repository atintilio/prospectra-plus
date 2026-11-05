import { and, asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { FlaskConical, Rocket } from 'lucide-react';
import { getDb, schema } from '@/db';
import { requireUser } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { OrgSwitcher } from '@/components/org-switcher';
import { AmbientVideo } from '@/components/ambient-video';
import { GuardaSessao } from '@/components/guarda-sessao';
import { chooseEnvAction } from '@/app/(app)/actions';
import { demoExists } from '@/lib/demo-reset';
import { DEMO_DISPLAY_NAME, displayOrgName } from '@/lib/demo-name';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const db = await getDb();
  const orgs = ctx.user.platformRole === 'admin'
    ? await db.select({ id: schema.orgs.id, name: schema.orgs.name }).from(schema.orgs).where(eq(schema.orgs.isDemo, false)).orderBy(asc(schema.orgs.name))
    : await db.select({ id: schema.orgs.id, name: schema.orgs.name }).from(schema.memberships)
        .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
        .where(and(eq(schema.memberships.userId, ctx.user.id), eq(schema.orgs.isDemo, false))).orderBy(asc(schema.orgs.name));
  const isDemo = Boolean(ctx.org?.isDemo);
  // Na demonstração a operação aparece com o rótulo genérico (o nome fictício
  // fica no banco, mas a pessoa nunca o vê).
  if (isDemo && ctx.org) orgs.splice(0, orgs.length, { id: ctx.org.id, name: displayOrgName(ctx.org) });
  // O botão "Demonstração" só existe para quem já tem uma operação de
  // demonstração (mesma regra da tela /ambiente).
  const temDemo = isDemo || (await demoExists(db, ctx.user.id));
  const initials = (ctx.user.name || ctx.user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  const roleLabel = ctx.user.platformRole === 'admin' ? 'Admin master' : ({ owner: 'Dono', manager: 'Gestor', sdr: 'SDR', closer: 'Closer' } as const)[ctx.role ?? 'sdr'];
  return (
    <div className="prospectra-shell relative flex min-h-dvh overflow-hidden">
      <AmbientVideo className="prospectra-ambient" />
      <div className="prospectra-ambient-scrim" aria-hidden="true" />
      <Sidebar isDemo={isDemo} isAdmin={ctx.user.platformRole === 'admin'} canManage={ctx.role === 'owner' || ctx.role === 'manager'} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <GuardaSessao />
        <header className="prospectra-topbar sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b px-4 md:px-8">
          <div className="md:hidden" />
          <div><OrgSwitcher orgs={orgs} current={ctx.org?.id ?? null} /></div>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/ambiente" className="btn-outline hidden sm:inline-flex">Trocar ambiente</Link>
            {isDemo ? (
              <form action={chooseEnvAction}>
                <input type="hidden" name="env" value="prod" />
                <button type="submit" aria-label="Voltar à produção" title="Voltar à produção"
                  className="btn border border-border bg-white/70 text-text hover:border-accent/40 hover:bg-surface-accent">
                  <Rocket className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Voltar à produção</span>
                </button>
              </form>
            ) : temDemo ? (
              <form action={chooseEnvAction}>
                <input type="hidden" name="env" value="demo" />
                <button type="submit" aria-label="Demonstração" title="Demonstração"
                  className="btn border border-violet-300 bg-violet-50 text-violet-800 hover:border-violet-400 hover:bg-violet-100">
                  <FlaskConical className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Demonstração</span>
                </button>
              </form>
            ) : null}
            <div className="hidden text-right sm:block"><p className="text-sm font-medium leading-tight">{ctx.user.name || ctx.user.email}</p><p className="font-mono text-[10px] uppercase tracking-[.12em] text-muted">{roleLabel}</p></div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-white">{initials}</span>
          </div>
        </header>
        {isDemo && <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-violet-600 px-4 py-2 text-center text-sm font-medium text-white">{DEMO_DISPLAY_NAME}: todos os dados são fictícios e nada é enviado de verdade.<Link href="/ambiente" className="underline underline-offset-2">Voltar ao ambiente de produção</Link></div>}
        <main className="prospectra-main flex-1 px-4 py-7 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>
    </div>
  );
}

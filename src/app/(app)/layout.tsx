import { and, asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { requireUser } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { OrgSwitcher } from '@/components/org-switcher';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const db = await getDb();
  const orgs = ctx.user.platformRole === 'admin'
    ? await db.select({ id: schema.orgs.id, name: schema.orgs.name }).from(schema.orgs).where(eq(schema.orgs.isDemo, false)).orderBy(asc(schema.orgs.name))
    : await db.select({ id: schema.orgs.id, name: schema.orgs.name }).from(schema.memberships)
        .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
        .where(and(eq(schema.memberships.userId, ctx.user.id), eq(schema.orgs.isDemo, false))).orderBy(asc(schema.orgs.name));
  const isDemo = Boolean(ctx.org?.isDemo);
  if (isDemo && ctx.org) orgs.splice(0, orgs.length, { id: ctx.org.id, name: ctx.org.name });
  const initials = (ctx.user.name || ctx.user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  const roleLabel = ctx.user.platformRole === 'admin' ? 'Admin master' : ({ owner: 'Dono', manager: 'Gestor', sdr: 'SDR', closer: 'Closer' } as const)[ctx.role ?? 'sdr'];

  return (
    <div className="prospectra-shell flex min-h-dvh">
      <Sidebar isDemo={isDemo} isAdmin={ctx.user.platformRole === 'admin'} canManage={ctx.role === 'owner' || ctx.role === 'manager'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="prospectra-topbar sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-border bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="md:hidden" />
          <OrgSwitcher orgs={orgs} current={ctx.org?.id ?? null} />
          <div className="ml-auto flex items-center gap-3">
            <Link href="/ambiente" className="btn-outline hidden sm:inline-flex">Trocar ambiente</Link>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{ctx.user.name || ctx.user.email}</p>
              <p className="text-xs text-muted">{roleLabel}</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{initials}</span>
          </div>
        </header>
        {isDemo && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-violet-600 px-4 py-2 text-center text-sm font-medium text-white">
            Ambiente de demonstração: todos os dados são fictícios e nada é enviado de verdade.
            <Link href="/ambiente" className="underline underline-offset-2">Voltar ao ambiente de produção</Link>
          </div>
        )}
        <main className="prospectra-main flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>
    </div>
  );
}

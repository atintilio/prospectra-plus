// Variação C da tela de ambiente — evolução dos dois cards.
//
// Continua com os dois cards (produção e demonstração), mas cada um passa a
// dizer o que existe de verdade naquele ambiente:
//
//   - badge de ambiente atual ("Você está aqui") no card do ambiente da sessão;
//   - uma linha de métricas por ambiente (leads, campanhas, reuniões, equipe);
//   - selos de integração (LinkedIn, WhatsApp e Voz) com o estado real;
//   - "Recriar do zero" só na demonstração, como ação discreta e com
//     confirmação explícita (dois passos na tela + trava no servidor).
//
// Esta tela NÃO está no ar: a tela ativa continua em `src/app/ambiente/page.tsx`.

import { FlaskConical, LogOut, MapPin, Mic, RotateCcw, Rocket } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { LinkedInMark } from '@/components/linkedin-mark';
import { WhatsAppMark } from '@/components/whatsapp-mark';
import { chooseEnvAction, resetDemoAction } from '@/app/(app)/actions';
import { logoutAction } from '@/app/(auth)/actions';
import { loadAmbiente, type EnvInfo, type IntegrationState } from './_ambiente-data';

export default async function VarianteC() {
  const ctx = await requireUser();
  const data = await loadAmbiente(ctx);

  // Recriar a demonstração é destrutivo: só acontece com a confirmação
  // explícita no formulário (campo `confirmar=sim`). Sem ela, nada acontece.
  async function recriarDemo(form: FormData) {
    'use server';
    if (form.get('confirmar') !== 'sim') redirect('/ambiente');
    await resetDemoAction();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#eaf1ff,#fefefe_60%)] px-5 py-10">
      <Logo size={44} />
      <h1 className="mt-7 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Olá{data.firstName ? `, ${data.firstName}` : ''}. Onde você quer entrar?
      </h1>
      <p className="mt-2 max-w-lg text-center text-sm text-muted">
        Você pode trocar de ambiente a qualquer momento pelo topo da tela.
      </p>
      <p className="mt-3 text-center text-xs text-muted">
        Ambiente ativo agora:{' '}
        <span className="font-medium text-text">
          {data.currentEnv === 'demo' ? 'Demonstração' : data.currentEnv === 'prod' ? 'Produção' : 'nenhum'}
          {data.currentOrgName ? ` · ${data.currentOrgName}` : ''}
        </span>
      </p>

      <div className="mt-9 grid w-full max-w-4xl gap-5 sm:grid-cols-2">
        <Card env={data.prod} atual={data.currentEnv === 'prod'} />
        <Card env={data.demo} atual={data.currentEnv === 'demo'} recriarDemo={recriarDemo} />
      </div>

      <form action={logoutAction} className="mt-8">
        <button className="btn-ghost" aria-label="Sair da conta">
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
        </button>
      </form>
    </main>
  );
}

/** Ação de recriar a demonstração (implementada dentro do componente, acima). */
type RecriarDemo = (form: FormData) => Promise<void>;

function Card({ env, atual, recriarDemo }: { env: EnvInfo; atual: boolean; recriarDemo?: RecriarDemo }) {
  const prod = env.key === 'prod';

  return (
    <section className="card flex flex-col p-6 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <span
          className={
            prod
              ? 'flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white'
              : 'flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 text-white'
          }
        >
          {prod ? <Rocket className="h-6 w-6" aria-hidden="true" /> : <FlaskConical className="h-6 w-6" aria-hidden="true" />}
        </span>
        {atual && (
          <span className="pill bg-success-soft text-success">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Você está aqui
          </span>
        )}
      </div>

      <h2 className="mt-5 text-xl font-semibold">{env.title}</h2>
      <p className="mt-1 text-sm font-medium text-text">
        {env.orgName ?? (prod ? 'Nenhuma operação vinculada' : 'Demonstração ainda não criada')}
      </p>
      <p className="mt-1 flex-1 text-sm text-muted">{env.tagline}</p>

      <dl className="mt-5 grid grid-cols-4 gap-2">
        <Metrica label="Leads" value={env.metrics.leads} />
        <Metrica label="Campanhas" value={env.metrics.campaigns} />
        <Metrica label="Reuniões" value={env.metrics.meetings} />
        <Metrica label="Equipe" value={env.metrics.team} />
      </dl>

      <ul className="mt-4 flex flex-wrap gap-2">
        {env.integrations.map((integracao) => (
          <Selo key={integracao.key} integracao={integracao} />
        ))}
      </ul>

      <form action={chooseEnvAction} className="mt-6">
        <input type="hidden" name="env" value={env.key} />
        <button className={prod ? 'btn-primary w-full' : 'btn-outline w-full'} disabled={prod && !env.exists}>
          {prod ? 'Entrar em produção' : 'Abrir demonstração'}
        </button>
      </form>

      {prod && !env.exists && (
        <p className="mt-3 text-xs text-muted">
          Esta conta não tem operação de produção vinculada. Peça acesso ao administrador da plataforma.
        </p>
      )}
      {!prod && !env.exists && (
        <p className="mt-3 text-xs text-muted">
          A demonstração ainda não existe: ela nasce (com dados fictícios) quando você entra.
        </p>
      )}

      {!prod && recriarDemo && (
        <details className="mt-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Recriar do zero
          </summary>
          <form action={recriarDemo} className="mt-3 rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">
              Isto apaga a demonstração desta conta e semeia a base fictícia de novo, do começo. A produção não é tocada.
            </p>
            <button type="submit" name="confirmar" value="sim" className="btn-danger mt-3 w-full">
              Sim, recriar a demonstração
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

function Metrica({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function Selo({ integracao }: { integracao: IntegrationState }) {
  return (
    <li
      className="inline-flex items-center gap-2 rounded-full border border-border bg-white/70 py-1 pl-1 pr-3 text-xs text-text"
      title={integracao.detail}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface">
        {integracao.key === 'whatsapp' ? (
          <WhatsAppMark size={14} />
        ) : integracao.key === 'linkedin' ? (
          <LinkedInMark size={14} />
        ) : (
          <Mic className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        )}
      </span>
      <span className="font-medium">
        {integracao.key === 'whatsapp' ? 'WhatsApp' : integracao.key === 'linkedin' ? 'LinkedIn' : 'Voz'}
      </span>
      <span className="text-muted">{integracao.label}</span>
      <span className="sr-only">. {integracao.detail}</span>
    </li>
  );
}

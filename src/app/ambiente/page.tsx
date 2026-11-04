// Tela de escolha de ambiente — variação A escolhida pelo dono em 02/11/2026.
//
// Tela cheia dividida em dois: produção em azul escuro, demonstração em violeta.
// Cada lado mostra o que existe de verdade naquele ambiente (métricas reais do
// banco) e o badge "Você está aqui" marca o ambiente da sessão.
//
// Histórico: as variações B (card único com alternador) e C (dois cards claros)
// foram apresentadas ao dono em 02/11/2026 e removidas depois da escolha da A.

import { FlaskConical, LogOut, MapPin, Mic, RotateCcw, Rocket } from 'lucide-react';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { AmbientVideo } from '@/components/ambient-video';
import { LinkedInMark } from '@/components/linkedin-mark';
import { WhatsAppMark } from '@/components/whatsapp-mark';
import { chooseEnvAction, resetDemoAction } from '@/app/(app)/actions';
import { logoutAction } from '@/app/(auth)/actions';
import { loadAmbiente, type EnvInfo, type IntegrationState } from './_ambiente-data';
import { GuardaSessao } from '@/components/guarda-sessao';

export const metadata = { title: 'Escolha o ambiente' };

export default async function AmbientePage() {
  const ctx = await requireUser();
  const data = await loadAmbiente(ctx);
  const atual = data.currentEnv === 'demo' ? 'Demonstração' : data.currentEnv === 'prod' ? 'Produção' : null;

  // Recriar a demonstração é destrutivo: só acontece com a confirmação
  // explícita no formulário (campo `confirmar=sim`). Sem ela, nada acontece.
  async function recriarDemo(form: FormData) {
    'use server';
    if (form.get('confirmar') !== 'sim') redirect('/ambiente');
    await resetDemoAction();
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#050a16] text-white">
      <GuardaSessao />
      <header className="ambiente-header px-5 py-6 sm:px-8">
        {/* Movimento ao fundo (mesmo video ambiente do login) so no header. */}
        <AmbientVideo className="ambiente-header-video" />
        <div className="ambiente-header-scrim" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <Logo dark size={36} />
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">Ambiente ativo agora</p>
            <p className="text-sm font-medium text-white/90">
              {atual ? `${atual}${data.currentOrgName ? ` · ${data.currentOrgName}` : ''}` : 'Nenhum ambiente selecionado'}
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 pb-8 text-center sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Olá{data.firstName ? `, ${data.firstName}` : ''}. Escolha o seu mundo.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/60">
          Dois ambientes, uma conta. Você pode trocar de ambiente a qualquer momento pelo topo da tela.
        </p>
      </div>

      <div className="grid flex-1 lg:grid-cols-2">
        <Lado env={data.prod} atual={data.currentEnv === 'prod'} />
        <Lado env={data.demo} atual={data.currentEnv === 'demo'} recriarDemo={recriarDemo} />
      </div>

      <footer className="flex justify-center px-5 py-6">
        <form action={logoutAction}>
          <button
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Sair da conta"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
          </button>
        </form>
      </footer>
    </main>
  );
}

type RecriarDemo = (form: FormData) => Promise<void>;

function Lado({
  env,
  atual,
  recriarDemo,
}: {
  env: EnvInfo;
  atual: boolean;
  recriarDemo?: RecriarDemo;
}) {
  const prod = env.key === 'prod';
  const semOperacao = !env.exists;

  return (
    <section
      className={
        prod
          ? 'flex flex-col justify-between gap-10 px-5 py-10 sm:px-8 lg:py-14 bg-[radial-gradient(ellipse_at_top,#123a7a,#08152e_62%)]'
          : 'flex flex-col justify-between gap-10 px-5 py-10 sm:px-8 lg:py-14 bg-[radial-gradient(ellipse_at_top,#5b3bc4,#221046_62%)]'
      }
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-white/85">
            {prod ? <Rocket className="h-3.5 w-3.5" aria-hidden="true" /> : <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />}
            {env.title}
          </span>
          {atual && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#08101f]">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Você está aqui
            </span>
          )}
        </div>

        <h2 className="mt-7 text-2xl font-semibold tracking-tight sm:text-3xl">
          {env.orgName ?? (prod ? 'Nenhuma operação vinculada' : 'Demonstração ainda não criada')}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">{env.tagline}</p>

        <dl className="mt-8 grid grid-cols-3 gap-3">
          <Metrica label="Leads" value={env.metrics.leads} />
          <Metrica label="Campanhas" value={env.metrics.campaigns} />
          <Metrica label="Reuniões" value={env.metrics.meetings} />
        </dl>

        <ul className="mt-6 flex flex-wrap gap-2">
          {env.integrations.map((integracao) => (
            <Selo key={integracao.key} integracao={integracao} />
          ))}
        </ul>
      </div>

      <div>
        <form action={chooseEnvAction}>
          <input type="hidden" name="env" value={env.key} />
          <button
            disabled={prod && semOperacao}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-[#08101f] transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {prod ? 'Entrar em produção' : 'Abrir demonstração'}
          </button>
        </form>
        {prod && semOperacao && (
          <p className="mt-3 text-xs text-white/60">
            Esta conta não tem operação de produção vinculada. Peça acesso ao administrador da plataforma.
          </p>
        )}
        {!prod && semOperacao && (
          <p className="mt-3 text-xs text-white/60">
            A demonstração ainda não existe: ela nasce (com dados fictícios) quando você entra.
          </p>
        )}
        {!prod && env.exists && recriarDemo && (
          <form action={recriarDemo} className="mt-4">
            <input type="hidden" name="confirmar" value="sim" />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs text-white/65 transition hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Recriar do zero
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Metrica({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-white/60">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function Selo({ integracao }: { integracao: IntegrationState }) {
  return (
    <li
      className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-1.5 pr-3 text-xs text-white/85"
      title={integracao.detail}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white">
        {integracao.key === 'whatsapp' ? (
          <WhatsAppMark size={14} />
        ) : integracao.key === 'linkedin' ? (
          <LinkedInMark size={14} />
        ) : (
          <Mic className="h-3.5 w-3.5 text-[#08101f]" aria-hidden="true" />
        )}
      </span>
      <span className="font-medium">
        {integracao.key === 'whatsapp' ? 'WhatsApp' : integracao.key === 'linkedin' ? 'LinkedIn' : 'Voz'}
      </span>
      <span className="text-white/60">{integracao.label}</span>
      <span className="sr-only">. {integracao.detail}</span>
    </li>
  );
}

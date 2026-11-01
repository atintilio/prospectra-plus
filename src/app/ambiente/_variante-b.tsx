// Variação B da tela de ambiente — card único com alternador.
//
// Um card central só. No topo, o alternador "Produção | Demonstração": o
// conteúdo que aparece embaixo (nome da operação, métricas reais, estado das
// integrações) é o do ambiente escolhido, e há um único botão, "Entrar".
//
// O alternador é um formulário GET: ele navega para `/ambiente?env=prod|demo`
// e a página passa esse valor para cá (veja `docs/guia/06-tela-de-ambiente.md`).
// Assim a tela funciona sem JavaScript.
//
// Esta tela NÃO está no ar: a tela ativa continua em `src/app/ambiente/page.tsx`.

import { LogOut, MapPin, Mic } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { Logo } from '@/components/logo';
import { LinkedInMark } from '@/components/linkedin-mark';
import { WhatsAppMark } from '@/components/whatsapp-mark';
import { chooseEnvAction } from '@/app/(app)/actions';
import { logoutAction } from '@/app/(auth)/actions';
import { loadAmbiente, type EnvKey, type IntegrationState } from './_ambiente-data';

export default async function VarianteB({ env }: { env?: EnvKey }) {
  const ctx = await requireUser();
  const data = await loadAmbiente(ctx);
  const selecionado: EnvKey = env === 'demo' ? 'demo' : env === 'prod' ? 'prod' : (data.currentEnv ?? 'prod');
  const info = selecionado === 'demo' ? data.demo : data.prod;
  const atual = data.currentEnv === selecionado;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,#eaf1ff,#fefefe_60%)] px-5 py-10">
      <Logo size={40} />
      <h1 className="mt-7 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Olá{data.firstName ? `, ${data.firstName}` : ''}. Em qual ambiente você quer trabalhar?
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-muted">
        Você pode trocar de ambiente a qualquer momento pelo topo da tela.
      </p>

      <div className="mt-8 w-full max-w-xl">
        <div className="card p-6 shadow-sm sm:p-7">
          <form method="get" role="group" aria-label="Escolha do ambiente" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1">
            <button
              type="submit"
              name="env"
              value="prod"
              aria-pressed={selecionado === 'prod'}
              className={
                selecionado === 'prod'
                  ? 'rounded-lg bg-white px-4 py-2 text-sm font-semibold text-text shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright'
                  : 'rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright'
              }
            >
              Produção
            </button>
            <button
              type="submit"
              name="env"
              value="demo"
              aria-pressed={selecionado === 'demo'}
              className={
                selecionado === 'demo'
                  ? 'rounded-lg bg-white px-4 py-2 text-sm font-semibold text-text shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright'
                  : 'rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-bright'
              }
            >
              Demonstração
            </button>
          </form>

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{info.title}</h2>
              {atual && (
                <span className="pill bg-success-soft text-success">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Você está aqui
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-text">
              {info.orgName ?? (selecionado === 'demo' ? 'Demonstração ainda não criada' : 'Nenhuma operação vinculada')}
            </p>
            <p className="mt-1 text-sm text-muted">{info.tagline}</p>

            <dl className="mt-5 grid grid-cols-3 gap-3">
              <Metrica label="Leads" value={info.metrics.leads} />
              <Metrica label="Campanhas" value={info.metrics.campaigns} />
              <Metrica label="Reuniões" value={info.metrics.meetings} />
            </dl>

            <ul className="mt-5 flex flex-wrap gap-2">
              {info.integrations.map((integracao) => (
                <Selo key={integracao.key} integracao={integracao} />
              ))}
            </ul>

            <form action={chooseEnvAction} className="mt-6">
              <input type="hidden" name="env" value={selecionado} />
              <button
                className="btn-primary w-full"
                disabled={selecionado === 'prod' && !info.exists}
              >
                Entrar
              </button>
            </form>

            {selecionado === 'prod' && !info.exists && (
              <p className="mt-3 text-xs text-muted">
                Esta conta não tem operação de produção vinculada. Peça acesso ao administrador da plataforma.
              </p>
            )}
            {selecionado === 'demo' && !info.exists && (
              <p className="mt-3 text-xs text-muted">
                A demonstração ainda não existe: ela nasce (com dados fictícios) quando você entra.
              </p>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Ambiente ativo agora:{' '}
          <span className="font-medium text-text">
            {data.currentEnv === 'demo' ? 'Demonstração' : data.currentEnv === 'prod' ? 'Produção' : 'nenhum'}
            {data.currentOrgName ? ` · ${data.currentOrgName}` : ''}
          </span>
        </p>
      </div>

      <form action={logoutAction} className="mt-6">
        <button className="btn-ghost" aria-label="Sair da conta">
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
        </button>
      </form>
    </main>
  );
}

function Metrica({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold">{value}</dd>
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

import { LiquidMetal } from '@/components/liquid-metal';
import { AnimatedLogo } from '@/components/animated-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      {/* Gotas de metal líquido azul ao fundo */}
      <div className="pointer-events-none absolute inset-0">
        <LiquidMetal />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,.85)_0%,rgba(255,255,255,.35)_45%,rgba(255,255,255,0)_75%)]" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <span className="text-xl font-semibold tracking-tight text-text">Prospectra</span>
          <span className="hidden rounded-full border border-border bg-white/70 px-3 py-1 text-xs text-muted backdrop-blur sm:inline">Uma ferramenta Argus Prime</span>
        </header>

        <div className="my-auto grid items-center gap-10 py-10 lg:grid-cols-[1.1fr_420px]">
          <div className="text-center lg:text-left">
            <AnimatedLogo className="mb-6 h-64 w-64 sm:h-72 sm:w-72 lg:-ml-10 lg:h-[26rem] lg:w-[26rem]" />
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[.18em] text-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Prospecção assistida por IA
            </p>
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-[-0.03em] text-text sm:text-6xl lg:text-7xl">
              Conexões que viram{' '}
              <span className="bg-gradient-to-b from-[#2b7fff] via-[#155dfc] to-[#0b2f8a] bg-clip-text font-serif font-normal italic text-transparent">negócios</span>
            </h1>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-muted lg:mx-0">
              Busca com IA, cadências no LinkedIn com mensagens personalizadas e um painel que mostra de onde vêm suas reuniões.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[420px] rounded-3xl border border-white/80 bg-white/75 p-8 shadow-[0_20px_60px_-20px_rgba(21,93,252,.35)] backdrop-blur-xl">
            {children}
          </div>
        </div>

        <footer className="text-center text-xs text-muted lg:text-left">© Argus Prime · Prospectra</footer>
      </div>
    </main>
  );
}

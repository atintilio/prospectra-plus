import { Logo } from '@/components/logo';

/**
 * Página de "não encontrado" da agenda pública (status HTTP 404).
 * Mantém o mesmo visual das telas públicas: quem clicou num link velho
 * entende o que houve em vez de ver uma página quebrada.
 */
export default function AgendaBookingNotFound() {
  return (
    <main className="min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Logo />
          <span className="text-xs text-muted">Agendamento</span>
        </header>
        <section className="card p-6 text-center sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Agendamento não encontrado</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            O link que você abriu não existe mais ou este evento foi desativado. Peça um novo link com a nossa equipe.
          </p>
          <a className="btn-primary mt-6" href="/agendamento">Voltar para a agenda</a>
        </section>
      </div>
    </main>
  );
}

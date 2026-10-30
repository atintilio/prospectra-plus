import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CalendarCheck, Link2, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/logo';

/**
 * Página pública de entrada da agenda: `/agendamento` (sem slug).
 *
 * É o que abre quem digita o domínio da agenda. Explica que o agendamento
 * acontece pelo link que o vendedor enviou e permite colar esse link (ou
 * apenas o código) para ser levado direto à tela certa.
 */

export const metadata: Metadata = {
  title: 'Agendar reunião',
  description: 'Escolha um horário para conversar com a equipe Prospectra.',
};

/**
 * Converte o que a pessoa colou (link completo, link sem domínio ou só o
 * código) no caminho certo dentro da agenda. Devolve `null` quando não dá
 * para adivinhar um evento.
 */
function resolveAgendaTarget(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  let path = value;
  let token = '';
  const questionMark = value.indexOf('?');
  if (questionMark !== -1) {
    const query = new URLSearchParams(value.slice(questionMark + 1));
    token = (query.get('token') ?? '').trim();
    path = value.slice(0, questionMark);
  }

  const withoutScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '');
  const segments = withoutScheme.split('/').filter(Boolean);
  const marker = segments.lastIndexOf('agendamento');
  const candidate = (marker !== -1 && segments[marker + 1]) || segments[segments.length - 1] || '';
  const slug = candidate.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) return null;

  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  if (slug === 'cancelar') return `/agendamento/cancelar${query}`;
  return `/agendamento/${slug}${query}`;
}

export default async function AgendaLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.codigo) ? sp.codigo[0] : sp.codigo;
  if (raw && raw.trim()) {
    const target = resolveAgendaTarget(raw);
    if (target) redirect(target);
  }

  return (
    <main className="min-h-dvh px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex items-center justify-between gap-3">
          <Logo />
          <span className="text-xs text-muted">Agenda</span>
        </header>

        <section className="card p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
            <CalendarCheck className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Agendar uma reunião</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Para marcar, abra o link que a nossa equipe enviou para você — por e-mail ou WhatsApp. É esse link
            que sabe com quem você está falando e em qual horário dá para conversar.
          </p>

          <form method="get" action="/agendamento" className="mt-6">
            <label className="block">
              <span className="label">Link ou código do agendamento</span>
              <input
                className="input"
                name="codigo"
                placeholder="https://agenda.exemplo.com/agendamento/reuniao"
                autoComplete="off"
                maxLength={500}
              />
            </label>
            <button className="btn-primary mt-3" type="submit">Abrir agendamento</button>
            <p className="mt-2 text-xs text-muted">
              Se preferir, cole só o código (por exemplo <code>reuniao</code>).
            </p>
          </form>
        </section>

        <section className="card mt-5 p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Como funciona</h2>
          <ul className="mt-3 space-y-3 text-sm text-muted">
            <li className="flex items-start gap-2">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              Você abre o link que recebeu e vê os horários livres, dia a dia.
            </li>
            <li className="flex items-start gap-2">
              <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              Escolhe o horário, deixa seu nome e confirma. Pronto, está agendado.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              Você recebe um link para cancelar ou remarcar — sem senha, sem login.
            </li>
          </ul>
          <p className="mt-5 text-sm text-muted">
            Não achou o link? Chame a nossa equipe no WhatsApp que a gente reenvia.
          </p>
        </section>
      </div>
    </main>
  );
}

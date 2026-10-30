'use client';

import { useActionState, useState } from 'react';
import { CalendarPlus, ExternalLink } from 'lucide-react';
import { criarAdminAgendaAction } from './actions';

export function AgendaSetupCard({ awaitingAdmin, unreachable, message }: {
  awaitingAdmin: boolean;
  unreachable: boolean;
  message?: string;
}) {
  const [state, action, pending] = useActionState(criarAdminAgendaAction, undefined);
  const [open, setOpen] = useState(false);

  if (unreachable) {
    return (
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarPlus className="h-4 w-4 text-accent" /> Agenda (cal.diy)
        </h2>
        <p className="mt-2 text-sm text-muted">
          {message || 'A agenda não está respondendo. O serviço fica na VPS, em 127.0.0.1:3102.'}
        </p>
      </section>
    );
  }

  if (!awaitingAdmin) {
    return (
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <CalendarPlus className="h-4 w-4 text-accent" /> Agenda (cal.diy)
        </h2>
        <p className="mt-2 text-sm text-muted">A agenda já tem administrador. Abra para gerenciar os agendamentos.</p>
        <a className="btn-primary mt-3 inline-flex items-center gap-1.5" href="https://agenda.argusprime.com.br" target="_blank" rel="noreferrer">
          Abrir agenda <ExternalLink className="h-4 w-4" />
        </a>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarPlus className="h-4 w-4 text-accent" /> Agenda (cal.diy)
      </h2>
      <p className="mt-2 text-sm text-muted">
        A agenda está no ar e ainda não tem administrador. Crie o primeiro acesso aqui — ele vale
        só para esta operação.
      </p>

      {!open ? (
        <button className="btn-primary mt-3" onClick={() => setOpen(true)}>Criar acesso da agenda</button>
      ) : (
        <form action={action} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nome completo</span>
              <input className="input w-full" name="fullName" minLength={3} maxLength={80} required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Usuário</span>
              <input className="input w-full" name="username" minLength={1} maxLength={40} placeholder="sem acentos nem espaços" required />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">E-mail</span>
            <input className="input w-full" type="email" name="email" required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Senha</span>
            <input className="input w-full" type="password" name="password" minLength={15} required />
            <span className="mt-1 block text-xs text-muted">Mínimo de 15 caracteres, com número e letras maiúsculas e minúsculas.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={pending}>{pending ? 'Criando…' : 'Criar administrador'}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {state?.ok && <p className="mt-3 text-sm text-muted" role="status">{state.ok}</p>}
      {state?.error && <p className="mt-3 text-sm text-danger" role="status">{state.error}</p>}
    </section>
  );
}

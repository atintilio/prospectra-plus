'use client';

import { LifeBuoy } from 'lucide-react';
import { useActionState } from 'react';
import { openSupportTicketAction } from '../actions';

export function OpenTicket() {
  const [state, action, pending] = useActionState(openSupportTicketAction, undefined);
  return (
    <section className="card mt-6 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold"><LifeBuoy className="h-4 w-4 text-accent" /> Falar com o suporte da Argus</h2>
      <p className="mt-0.5 text-sm text-muted">Precisa de ajuda com o Prospectra+? Abra um chamado para a equipe Argus.</p>
      <form action={action} className="mt-3 space-y-2">
        <input name="subject" className="input" placeholder="Assunto" maxLength={120} required />
        <textarea name="body" className="input resize-y" rows={3} placeholder="Descreva o que precisa" required />
        {state?.error && <p className="text-sm text-warning">{state.error}</p>}
        {state?.ok && <p className="text-sm text-accent">{state.ok}</p>}
        <button className="btn-primary" disabled={pending} type="submit">Abrir chamado</button>
      </form>
    </section>
  );
}

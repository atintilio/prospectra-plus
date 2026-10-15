'use client';

import { useActionState } from 'react';
import { updateAccountAction } from '../actions';
import { FormMessage, Submit } from '@/components/form';

export function AccountForm({ me }: { me: { name: string; email: string; linkedinUrl: string | null; dailyInvites: number; dailyMessages: number } }) {
  const [state, action] = useActionState(updateAccountAction, undefined);
  return (
    <form action={action} className="card max-w-2xl space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="name">Nome</label><input id="name" name="name" className="input" defaultValue={me.name} /></div>
        <div><label className="label" htmlFor="email">E-mail</label><input id="email" className="input bg-surface" value={me.email} readOnly /></div>
      </div>
      <div><label className="label" htmlFor="li">Seu perfil no LinkedIn</label><input id="li" name="linkedinUrl" className="input" defaultValue={me.linkedinUrl ?? ''} placeholder="https://www.linkedin.com/in/..." /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="di">Convites por dia</label><input id="di" name="dailyInvites" type="number" min={1} max={40} className="input" defaultValue={me.dailyInvites} />
          <p className="mt-1 text-xs text-muted">Recomendado: até 20. O LinkedIn restringe contas que exageram.</p></div>
        <div><label className="label" htmlFor="dm">Mensagens por dia</label><input id="dm" name="dailyMessages" type="number" min={1} max={100} className="input" defaultValue={me.dailyMessages} /></div>
      </div>
      <FormMessage state={state} />
      <Submit className="btn-primary" pendingText="Salvando…">Salvar</Submit>
    </form>
  );
}

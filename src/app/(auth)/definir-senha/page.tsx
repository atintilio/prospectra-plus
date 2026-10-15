'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useActionState } from 'react';
import { FormMessage, Submit } from '@/components/form';
import { setPasswordAction } from '../actions';

function SetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [state, action] = useActionState(setPasswordAction, undefined);
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Criar sua senha</h2>
      <p className="mt-1.5 text-sm text-muted">Mínimo de 10 caracteres.</p>
      <form action={action} className="mt-8 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="name">Seu nome</label>
          <input className="input" id="name" name="name" autoComplete="name" placeholder="Como você quer ser chamado" />
        </div>
        <div>
          <label className="label" htmlFor="password">Nova senha</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirmar senha</label>
          <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <FormMessage state={state} />
        <Submit pendingText="Salvando…">Salvar e entrar</Submit>
      </form>
    </>
  );
}

export default function SetPasswordPage() {
  return <Suspense><SetPasswordForm /></Suspense>;
}

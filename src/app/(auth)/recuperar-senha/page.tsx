'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormMessage, Submit } from '@/components/form';
import { requestResetAction } from '../actions';

export default function ResetPage() {
  const [state, action] = useActionState(requestResetAction, undefined);
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Definir ou recuperar senha</h2>
      <p className="mt-1.5 text-sm text-muted">Enviamos um link seguro para o seu e-mail.</p>
      <form action={action} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <FormMessage state={state} />
        <Submit pendingText="Enviando…">Enviar link</Submit>
      </form>
      <Link href="/login" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">← Voltar para o login</Link>
    </>
  );
}

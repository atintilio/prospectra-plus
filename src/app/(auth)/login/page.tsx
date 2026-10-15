'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { AnimatedLogo } from '@/components/animated-logo';
import { FormMessage, Submit } from '@/components/form';
import { loginAction } from '../actions';

export default function LoginPage() {
  const [state, action] = useActionState(loginAction, undefined);
  return (
    <>
      <AnimatedLogo className="mb-4 h-24 w-24" />
      <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
      <p className="mt-1.5 text-sm text-muted">Acesse sua conta de parceiro.</p>
      <form action={action} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Senha</label>
            <Link href="/recuperar-senha" className="mb-1.5 text-xs font-medium text-accent hover:underline">Esqueci minha senha</Link>
          </div>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <FormMessage state={state} />
        <Submit pendingText="Entrando…">Entrar</Submit>
      </form>
      <p className="mt-6 text-sm text-muted">
        Primeiro acesso? Use o link do convite que chegou no seu e-mail, ou{' '}
        <Link href="/recuperar-senha" className="font-medium text-accent hover:underline">peça um novo link</Link>.
      </p>
    </>
  );
}

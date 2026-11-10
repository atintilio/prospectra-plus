'use client';

import { useActionState } from 'react';
import { updateAccountAction } from '../actions';
import { FormMessage, Submit } from '@/components/form';

export function AccountForm({ me }: { me: { name: string; email: string; emailSignature: string; linkedinUrl: string | null; dailyInvites: number; dailyMessages: number; signatureImage: string | null } }) {
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
      <div><label className="label" htmlFor="emailSignature">Assinatura dos e-mails</label><textarea id="emailSignature" name="emailSignature" rows={5} maxLength={4000} className="input" defaultValue={me.emailSignature} /><p className="mt-1 text-xs text-muted">Adicionada ao final dos e-mails de campanha enviados pela sua conta, sem alterações pela IA.</p></div>
      <div>
        <label className="label" htmlFor="signatureImage">Assinatura em imagem (opcional)</label>
        {me.signatureImage && (
          <div className="mb-2 rounded-lg border border-border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={me.signatureImage} alt="Assinatura atual" className="max-h-40 max-w-full" />
            <label className="mt-2 flex items-center gap-2 text-xs text-muted"><input type="checkbox" name="removeSignatureImage" /> Remover esta imagem</label>
          </div>
        )}
        <input id="signatureImage" name="signatureImage" type="file" accept="image/png,image/jpeg,image/gif" className="input" />
        <p className="mt-1 text-xs text-muted">PNG, JPG ou GIF de até 1 MB. Vai ao final de cada e-mail de campanha, depois do texto da assinatura. Para trocar, envie outra imagem.</p>
      </div>
      <FormMessage state={state} />
      <Submit className="btn-primary" pendingText="Salvando…">Salvar</Submit>
    </form>
  );
}

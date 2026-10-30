'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { connectAccount, disconnectAccount, testAccount } from '@/lib/linkedin';

export type ActionState = { error?: string; ok?: string };

export async function connectLinkedInAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const session = String(formData.get('session') ?? '').trim();
  try {
    const db = await getDb();
    const { message } = await connectAccount(db, ctx.org.id, ctx.user.id, ctx.org.isDemo, { session: session || undefined });
    revalidatePath('/golinkedin'); revalidatePath('/campanhas');
    return { ok: message };
  } catch (err) {
    const code = err instanceof Error ? err.message : 'ERRO';
    if (code === 'SECRETS_KEY_NOT_CONFIGURED') return { error: 'Servidor sem SECRETS_KEY configurada: a sessão não pode ser armazenada com segurança.' };
    return { error: 'Não foi possível conectar a conta.' };
  }
}

export async function disconnectLinkedInAction(_prev: ActionState | undefined, _formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const db = await getDb();
  await disconnectAccount(db, ctx.org.id, ctx.user.id);
  revalidatePath('/golinkedin'); revalidatePath('/campanhas');
  return { ok: 'Conta desconectada.' };
}

export async function testLinkedInAction(_prev: ActionState | undefined, _formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const db = await getDb();
  const { ok, message } = await testAccount(db, ctx.org.id, ctx.user.id, ctx.org.isDemo);
  revalidatePath('/golinkedin');
  return ok ? { ok: message } : { error: message };
}

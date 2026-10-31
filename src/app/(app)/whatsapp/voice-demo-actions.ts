'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { deleteDemoVoice, saveDemoVoice } from '@/lib/voice/demo';

export type VoiceDemoState = { error?: string; ok?: string } | undefined;

type Ref = { user: Awaited<ReturnType<typeof requireOrg>>['user']; org: Awaited<ReturnType<typeof requireOrg>>['org'] };

/** Cadastra/atualiza a voz do usuário SOMENTE na organização de demonstração. */
export async function demoRegisterVoiceAction(_prev: VoiceDemoState, formData: FormData): Promise<VoiceDemoState> {
  const ctx = await requireOrg() as Ref;
  if (!ctx.org.isDemo) return { error: 'Disponível apenas no ambiente de demonstração.' };
  const transcript = String(formData.get('transcript') ?? '');
  const consent = formData.get('voiceConsent') === 'on';
  const file = formData.get('reference');
  if (!(file instanceof File)) return { error: 'Envie a gravação da sua voz.' };
  if (!consent) return { error: 'Confirme que a gravação é sua ou autorizada.' };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await saveDemoVoice(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id }, bytes, transcript);
    revalidatePath('/whatsapp'); revalidatePath('/simulador');
    return { ok: 'Voz de demo cadastrada. Ouça o áudio local no botão abaixo — nada vai para o WhatsApp.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível cadastrar a voz.' };
  }
}

/** Remove a voz de demo do usuário. */
export async function demoRevokeVoiceAction(_prev: VoiceDemoState, _formData: FormData): Promise<VoiceDemoState> {
  const ctx = await requireOrg() as Ref;
  if (!ctx.org.isDemo) return { error: 'Disponível apenas no ambiente de demonstração.' };
  try {
    await deleteDemoVoice(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id });
    revalidatePath('/whatsapp'); revalidatePath('/simulador');
    return { ok: 'Voz de demo removida.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível remover.' };
  }
}

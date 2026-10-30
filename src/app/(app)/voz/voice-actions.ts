'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/auth';
import { getDb, schema } from '@/db';
import { and, eq } from 'drizzle-orm';
import { assertWhatsAppAccess } from '@/lib/whatsapp/akg';
import { VoiceStudioGateway, voiceConfig } from '@/lib/voice/voicestudio';
import { saveVoiceProfile } from '@/lib/voice/delivery';

export type VoiceState = { ok?: string; error?: string; transcript?: string } | undefined;

/**
 * Transcreve a gravação de referência pelo Voice Studio.
 * O MOSS-TTS-Nano precisa do texto exato do áudio — transcrever evita erro de alinhamento.
 */
export async function transcreverVozAction(form: FormData): Promise<string> {
  const ctx = await requireOrg();
  const config = voiceConfig();
  if (!config) throw new Error('Voice Studio não configurado.');
  assertWhatsAppAccess(ctx);
  const file = form.get('reference');
  if (!(file instanceof File) || !file.size) throw new Error('Envie a gravação.');
  const gateway = new VoiceStudioGateway(config);
  const text = await gateway.transcribe(file);
  revalidatePath('/voz');
  return text;
}

/** Cria o perfil de voz clonada a partir da gravação enviada pelo dono. */
export async function registrarVozAction(_: VoiceState, form: FormData): Promise<VoiceState> {
  const ctx = await requireOrg();
  try {
    const scope = assertWhatsAppAccess(ctx);
    const config = voiceConfig();
    if (!config || !ctx.org.aiEnabled) throw new Error('Voz indisponível.');
    const reference = form.get('reference');
    if (!(reference instanceof File)) throw new Error('Gravação necessária.');
    const transcript = String(form.get('transcript') ?? '').trim();
    if (!transcript) throw new Error('Informe (ou transcreva) o que foi dito na gravação.');
    if (form.get('voiceConsent') !== 'on') throw new Error('Confirme a autorização de uso da voz.');

    const gateway = new VoiceStudioGateway(config);
    const result = await gateway.createProfile({
      sellerName: ctx.user.name || 'Minha voz',
      reference,
      transcript,
      consent: true,
    });
    await saveVoiceProfile(await getDb(), scope, result.profileId, config.engine, true);
    revalidatePath('/voz');
    revalidatePath('/whatsapp');
    return { ok: 'Sua voz foi clonada e vinculada somente à sua conta nesta operação.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível criar o perfil de voz.' };
  }
}

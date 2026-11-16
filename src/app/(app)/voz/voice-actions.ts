'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/auth';
import { getDb, schema } from '@/db';
import { and, eq } from 'drizzle-orm';
import { assertWhatsAppAccess } from '@/lib/whatsapp/akg';
import { VoiceStudioGateway, voiceConfig } from '@/lib/voice/voicestudio';
import { saveVoiceProfile } from '@/lib/voice/delivery';
import { arquivoDoFormulario } from '@/lib/upload';

export type VoiceState = { ok?: string; error?: string; transcript?: string } | undefined;

/**
 * Transcreve a gravação de referência pelo Voice Studio.
 * O MOSS-TTS-Nano precisa do texto exato do áudio — transcrever evita erro de alinhamento.
 */
export async function transcreverVozAction(form: FormData): Promise<{ transcript: string } | { error: string }> {
  const ctx = await requireOrg();
  const config = voiceConfig();
  if (!config || !ctx.org.active || !ctx.org.aiEnabled || ctx.user.status !== 'active') {
    return { error: 'A transcrição está indisponível para esta conta.' };
  }
  const recording = arquivoDoFormulario(form.get('reference'));
  if (!recording?.size) return { error: 'Grave sua voz antes de transcrever.' };
  try {
    const transcript = await new VoiceStudioGateway(config).transcribe(recording);
    if (transcript.length > 4000) return { error: 'A transcrição ficou longa demais. Grave uma amostra mais curta.' };
    return { transcript };
  } catch (error) {
    console.error('[voz] falha na transcrição:', error instanceof Error ? error.message : String(error));
    return { error: 'Não foi possível transcrever esta gravação. Tente novamente.' };
  }
}

/** Cria o perfil de voz clonada a partir da gravação enviada pelo dono. */
export async function registrarVozAction(_: VoiceState, form: FormData): Promise<VoiceState> {
  const ctx = await requireOrg();
  try {
    const scope = assertWhatsAppAccess(ctx);
    const config = voiceConfig();
    if (!config || !ctx.org.aiEnabled) throw new Error('Voz indisponível.');
    const reference = form.get('reference');
    const ref=arquivoDoFormulario(reference);if(!ref) throw new Error('Gravação necessária.');
    const transcript = String(form.get('transcript') ?? '').trim();
    if (!transcript) throw new Error('Informe (ou transcreva) o que foi dito na gravação.');
    if (form.get('voiceConsent') !== 'on') throw new Error('Confirme a autorização de uso da voz.');

    const gateway = new VoiceStudioGateway(config);
    const result = await gateway.createProfile({
      sellerName: ctx.user.name || 'Minha voz',
      reference: ref,
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

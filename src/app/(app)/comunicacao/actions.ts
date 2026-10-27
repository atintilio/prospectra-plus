'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { getLeadCommunicationProfile, isDiscType, saveLeadCommunicationProfile } from '@/lib/communication';

export type CommunicationActionState = { error?: string; ok?: string } | undefined;

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function validLeadId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function preferences(form: FormData) {
  return {
    preferredChannel: formText(form, 'preferredChannel') || 'unknown',
    preferredFormat: formText(form, 'preferredFormat') || 'unknown',
    notes: formText(form, 'notes').slice(0, 500),
  };
}

export async function saveDeclaredProfileAction(_: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  try {
    const ctx = await requireOrg();
    const leadId = formText(form, 'leadId');
    const typeValue = formText(form, 'profileType');
    if (!validLeadId(leadId)) return { error: 'Selecione um contato da sua carteira.' };
    if (typeValue && formText(form, 'typeDeclared') !== 'on') return { error: 'Confirme que o tipo foi informado pelo contato ou por você.' };
    if (typeValue && !isDiscType(typeValue)) return { error: 'Selecione um tipo válido ou deixe o campo sem classificação.' };
    const db = await getDb();
    const scope = { orgId: ctx.org.id, userId: ctx.user.id };
    const current = typeValue || formText(form, 'clearType') === 'on' ? null : await getLeadCommunicationProfile(db, scope, leadId);
    await saveLeadCommunicationProfile(db, scope, leadId, {
      source: typeValue || !current ? 'manual' : current.source,
      profileType: typeValue || formText(form, 'clearType') === 'on' ? typeValue || null : current?.profileType,
      answers: typeValue || formText(form, 'clearType') === 'on' ? {} : current?.answers,
      preferences: preferences(form),
    });
    revalidatePath('/comunicacao');
    revalidatePath('/inteligencia');
    return { ok: typeValue ? 'Tipo informado e preferências salvos.' : current && !formText(form, 'clearType') ? 'Preferências salvas sem alterar a avaliação existente.' : 'Preferências salvas; o tipo permanece indisponível.' };
  } catch {
    return { error: 'Não foi possível salvar. Confirme que o contato está na sua carteira e tente novamente.' };
  }
}

export async function saveObservedProfileAction(_: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  try {
    const ctx = await requireOrg();
    const leadId = formText(form, 'leadId');
    if (!validLeadId(leadId)) return { error: 'Selecione um contato da sua carteira.' };
    const answers = { q1: formText(form, 'q1'), q2: formText(form, 'q2'), q3: formText(form, 'q3'), q4: formText(form, 'q4') };
    await saveLeadCommunicationProfile(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id }, leadId, {
      source: 'observational_quiz', answers, preferences: preferences(form),
    });
    revalidatePath('/comunicacao');
    revalidatePath('/inteligencia');
    return { ok: 'Respostas registradas. Qualquer tipo exibido é uma estimativa baseada nas observações.' };
  } catch {
    return { error: 'Responda às quatro perguntas e confirme que o contato está na sua carteira.' };
  }
}

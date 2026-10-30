'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { canManage, requireOrg } from '@/lib/auth';

export type SettingsState = { error?: string; ok?: string } | undefined;

const settingsSchema = z.object({
  senderEmail: z.string().trim().email('E-mail remetente inválido.').or(z.literal('')),
  atendimentoStart: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inicial inválido (HH:MM).'),
  atendimentoEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Horário final inválido (HH:MM).'),
  autoReply: z.string().trim().max(600),
  features: z.object({
    golinkedin: z.boolean(), whatsapp: z.boolean(), helpin: z.boolean(),
    inteligencia: z.boolean(), agenda: z.boolean(), documentos: z.boolean(),
  }),
});

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await requireOrg();
  if (!canManage(ctx.role) && ctx.user.platformRole !== 'admin') return { error: 'Somente gerentes ou administradores alteram as configurações.' };
  const data = {
    senderEmail: String(formData.get('senderEmail') ?? ''),
    atendimentoStart: String(formData.get('atendimentoStart') ?? '09:00'),
    atendimentoEnd: String(formData.get('atendimentoEnd') ?? '18:00'),
    autoReply: String(formData.get('autoReply') ?? ''),
    features: {
      golinkedin: formData.get('f.golinkedin') === 'on',
      whatsapp: formData.get('f.whatsapp') === 'on',
      helpin: formData.get('f.helpin') === 'on',
      inteligencia: formData.get('f.inteligencia') === 'on',
      agenda: formData.get('f.agenda') === 'on',
      documentos: formData.get('f.documentos') === 'on',
    },
  };
  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const db = await getDb();
  const values = {
    orgId: ctx.org.id,
    senderEmail: parsed.data.senderEmail || null,
    atendimentoStart: parsed.data.atendimentoStart,
    atendimentoEnd: parsed.data.atendimentoEnd,
    autoReply: parsed.data.autoReply,
    features: parsed.data.features,
    updatedAt: new Date(),
  };
  await db.insert(schema.orgSettings).values(values)
    .onConflictDoUpdate({ target: schema.orgSettings.orgId, set: values });
  revalidatePath('/configuracoes');
  return { ok: 'Configurações salvas.' };
}

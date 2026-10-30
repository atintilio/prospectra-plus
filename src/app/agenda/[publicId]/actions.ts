'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { setMeetingStatusByToken } from '@/lib/agenda';

export type PublicState = { error?: string; ok?: string } | undefined;

const idSchema = z.string().min(10).max(64);

export async function publicConfirmAction(_prev: PublicState, formData: FormData): Promise<PublicState> {
  const publicId = idSchema.safeParse(String(formData.get('publicId') ?? ''));
  if (!publicId.success) return { error: 'Link inválido.' };
  const db = await getDb();
  const m = await setMeetingStatusByToken(db, publicId.data, 'confirmed');
  if (!m) return { error: 'Reunião não encontrada.' };
  revalidatePath(`/agenda/${publicId.data}`);
  return { ok: 'Presença confirmada. O convite (invite.ics) segue por e-mail.' };
}

export async function publicCancelAction(_prev: PublicState, formData: FormData): Promise<PublicState> {
  const publicId = idSchema.safeParse(String(formData.get('publicId') ?? ''));
  if (!publicId.success) return { error: 'Link inválido.' };
  const db = await getDb();
  const m = await setMeetingStatusByToken(db, publicId.data, 'cancelled');
  if (!m) return { error: 'Reunião não encontrada.' };
  revalidatePath(`/agenda/${publicId.data}`);
  return { ok: 'Reunião cancelada.' };
}

'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { canManage, requireOrg } from '@/lib/auth';

export type DocsState = { error?: string; ok?: string } | undefined;

const createSchema = z.object({
  title: z.string().trim().min(2, 'Informe o título do documento.').max(140),
  url: z.string().trim().url('Informe uma URL válida.').or(z.literal('')),
  notes: z.string().trim().max(2000).default(''),
});

export async function createDocumentAction(_prev: DocsState, formData: FormData): Promise<DocsState> {
  const ctx = await requireOrg();
  if (!canManage(ctx.role) && ctx.user.platformRole !== 'admin') return { error: 'Somente gerentes podem cadastrar documentos.' };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  const db = await getDb();
  await db.insert(schema.documents).values({
    orgId: ctx.org.id, createdById: ctx.user.id,
    title: parsed.data.title, url: parsed.data.url, notes: parsed.data.notes,
  });
  revalidatePath('/documentos');
  return { ok: 'Documento cadastrado.' };
}

export async function deleteDocumentAction(id: string): Promise<void> {
  const ctx = await requireOrg();
  if (!canManage(ctx.role) && ctx.user.platformRole !== 'admin') throw new Error('Sem permissão para remover documentos.');
  const db = await getDb();
  await db.delete(schema.documents).where(and(eq(schema.documents.id, id), eq(schema.documents.orgId, ctx.org.id)));
  revalidatePath('/documentos');
}

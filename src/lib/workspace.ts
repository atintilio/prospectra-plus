import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DB } from '@/db';
import type { TaskStatus } from '@/db/schema';

const titleSchema = z.string().trim().min(1).max(200);
const bodySchema = z.string().trim().max(50000);

// ---- Docs ----
export async function listDocs(db: DB, orgId: string) {
  return db.select().from(schema.docs).where(eq(schema.docs.orgId, orgId)).orderBy(desc(schema.docs.updatedAt)).limit(200);
}

export async function upsertDoc(db: DB, orgId: string, authorId: string, input: { id?: string; title: string; body: string }) {
  const title = titleSchema.parse(input.title);
  const body = bodySchema.parse(input.body ?? '');
  if (input.id) {
    const [u] = await db.update(schema.docs).set({ title, body, updatedAt: new Date() })
      .where(and(eq(schema.docs.id, input.id), eq(schema.docs.orgId, orgId))).returning();
    if (!u) throw new Error('Documento não encontrado.');
    return u;
  }
  const [c] = await db.insert(schema.docs).values({ orgId, authorId, title, body }).returning();
  return c;
}

export async function deleteDoc(db: DB, orgId: string, id: string): Promise<void> {
  await db.delete(schema.docs).where(and(eq(schema.docs.id, id), eq(schema.docs.orgId, orgId)));
}

// ---- Tarefas (projetos) ----
export async function listTasks(db: DB, orgId: string) {
  return db.select().from(schema.tasks).where(eq(schema.tasks.orgId, orgId)).orderBy(desc(schema.tasks.updatedAt)).limit(300);
}

export async function createTask(db: DB, orgId: string, input: { title: string; assignedTo?: string | null; leadId?: string | null }) {
  const title = titleSchema.parse(input.title);
  const [t] = await db.insert(schema.tasks).values({ orgId, title, assignedTo: input.assignedTo ?? null, leadId: input.leadId ?? null }).returning();
  return t;
}

export async function setTaskStatus(db: DB, orgId: string, id: string, status: TaskStatus): Promise<void> {
  await db.update(schema.tasks).set({ status, updatedAt: new Date() }).where(and(eq(schema.tasks.id, id), eq(schema.tasks.orgId, orgId)));
}

export async function assignTask(db: DB, orgId: string, id: string, userId: string | null): Promise<void> {
  await db.update(schema.tasks).set({ assignedTo: userId, updatedAt: new Date() }).where(and(eq(schema.tasks.id, id), eq(schema.tasks.orgId, orgId)));
}

export async function deleteTask(db: DB, orgId: string, id: string): Promise<void> {
  await db.delete(schema.tasks).where(and(eq(schema.tasks.id, id), eq(schema.tasks.orgId, orgId)));
}

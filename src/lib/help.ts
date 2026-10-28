import 'server-only';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type DB } from '@/db';

// Central de ajuda: busca por texto (ILIKE). Semântica (pgvector) = upgrade futuro.
export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'artigo';
}

const titleSchema = z.string().trim().min(1).max(160);
const bodySchema = z.string().trim().max(20000);
type Article = typeof schema.helpArticles.$inferSelect;

export async function upsertArticle(db: DB, orgId: string, input: { id?: string; title: string; body: string }): Promise<Article> {
  const title = titleSchema.parse(input.title);
  const body = bodySchema.parse(input.body ?? '');
  if (input.id) {
    const [u] = await db.update(schema.helpArticles).set({ title, body, updatedAt: new Date() })
      .where(and(eq(schema.helpArticles.id, input.id), eq(schema.helpArticles.orgId, orgId))).returning();
    if (!u) throw new Error('Artigo não encontrado.');
    return u;
  }
  let base = slugify(title), slug = base, n = 1;
  // slug único por operação
  while (true) {
    const [exists] = await db.select({ id: schema.helpArticles.id }).from(schema.helpArticles)
      .where(and(eq(schema.helpArticles.orgId, orgId), eq(schema.helpArticles.slug, slug)));
    if (!exists) break;
    slug = `${base}-${++n}`;
  }
  const [c] = await db.insert(schema.helpArticles).values({ orgId, slug, title, body }).returning();
  return c;
}

export async function setArticleStatus(db: DB, orgId: string, id: string, status: 'draft' | 'published'): Promise<void> {
  await db.update(schema.helpArticles).set({ status, updatedAt: new Date() })
    .where(and(eq(schema.helpArticles.id, id), eq(schema.helpArticles.orgId, orgId)));
}

export async function deleteArticle(db: DB, orgId: string, id: string): Promise<void> {
  await db.delete(schema.helpArticles).where(and(eq(schema.helpArticles.id, id), eq(schema.helpArticles.orgId, orgId)));
}

export async function listArticles(db: DB, orgId: string): Promise<Article[]> {
  return db.select().from(schema.helpArticles).where(eq(schema.helpArticles.orgId, orgId)).orderBy(desc(schema.helpArticles.updatedAt)).limit(200);
}

export async function searchPublished(db: DB, orgId: string, q?: string): Promise<Article[]> {
  const conds = [eq(schema.helpArticles.orgId, orgId), eq(schema.helpArticles.status, 'published')];
  const query = (q ?? '').trim();
  if (query) {
    const like = `%${query.replace(/[%_\\]/g, '')}%`;
    conds.push(or(ilike(schema.helpArticles.title, like), ilike(schema.helpArticles.body, like))!);
  }
  return db.select().from(schema.helpArticles).where(and(...conds)).orderBy(desc(schema.helpArticles.updatedAt)).limit(20);
}

export async function getPublishedBySlug(db: DB, orgId: string, slug: string): Promise<Article | null> {
  const [a] = await db.select().from(schema.helpArticles)
    .where(and(eq(schema.helpArticles.orgId, orgId), eq(schema.helpArticles.slug, slug), eq(schema.helpArticles.status, 'published')));
  return a ?? null;
}

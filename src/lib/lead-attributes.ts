import 'server-only';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';

// Atributos personalizados de lead por operação (Helpin fase A).
// Cada operação define seus campos (lead_attribute_defs) e cada lead guarda
// o valor preenchido em leads.attributes (jsonb), indexado pela chave do campo.

export const ATTRIBUTE_TYPES = ['text', 'number', 'date', 'bool', 'select'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export type AttributeDef = typeof schema.leadAttributeDefs.$inferSelect;
export type AttributeValue = string | number | boolean;

const KEY_MAX = 40;
const NAME_MAX = 60;
const OPTIONS_MAX = 20;
const TEXT_MAX = 5000;

/** Chave snake_case sem acento, no máximo 40 caracteres. */
export function slugifyKey(name: string): string {
  const raw = String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tira o acento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!raw) return '';
  return raw.slice(0, KEY_MAX).replace(/_+$/g, '');
}

function normalizeName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) throw new Error('Informe o nome do atributo.');
  if (name.length > NAME_MAX) throw new Error(`O nome do atributo deve ter no máximo ${NAME_MAX} caracteres.`);
  return name;
}

function normalizeType(raw: unknown): AttributeType {
  const type = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!(ATTRIBUTE_TYPES as readonly string[]).includes(type)) {
    throw new Error('Tipo inválido: use text, number, date, bool ou select.');
  }
  return type as AttributeType;
}

function normalizeRequired(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (typeof raw !== 'boolean') throw new Error('O campo "obrigatório" deve ser true ou false.');
  return raw;
}

function normalizeOptions(type: AttributeType, raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' && raw.trim() ? raw.split(',') : []);
  const cleaned = Array.from(new Set(list.map((o) => String(o ?? '').trim()).filter((o) => o.length > 0)));
  if (type !== 'select') return [];
  if (!cleaned.length) throw new Error('Campo de seleção exige pelo menos uma opção.');
  if (cleaned.length > OPTIONS_MAX) throw new Error(`O campo aceita no máximo ${OPTIONS_MAX} opções.`);
  return cleaned;
}

function normalizePosition(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error('Posição inválida: use um número inteiro a partir de 0.');
  return n;
}

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  return e.code === '23505' || e.cause?.code === '23505';
}

/** Definições da operação, na ordem de exibição (position, createdAt). */
export async function listAttributeDefs(orgId: string): Promise<AttributeDef[]> {
  const db = await getDb();
  return db.select().from(schema.leadAttributeDefs)
    .where(eq(schema.leadAttributeDefs.orgId, orgId))
    .orderBy(asc(schema.leadAttributeDefs.position), asc(schema.leadAttributeDefs.createdAt));
}

export type AttributeDefInput = {
  name: string;
  type?: AttributeType;
  options?: string[] | string;
  required?: boolean;
  position?: number;
  key?: string;
};

export type AttributeDefPatch = {
  name?: string;
  type?: AttributeType;
  options?: string[] | string;
  required?: boolean;
  position?: number;
};

/** Cria um campo na operação. A chave é única por operação (unique em org_id,key). */
export async function createAttributeDef(orgId: string, input: AttributeDefInput): Promise<AttributeDef> {
  const name = normalizeName(input?.name);
  const type = normalizeType(input?.type ?? 'text');
  const options = normalizeOptions(type, input?.options);
  const required = normalizeRequired(input?.required);
  const key = input?.key ? slugifyKey(input.key) : slugifyKey(name);
  if (!key) throw new Error('Nome inválido: não foi possível gerar a chave do atributo.');

  const db = await getDb();
  const [existing] = await db.select({ id: schema.leadAttributeDefs.id }).from(schema.leadAttributeDefs)
    .where(and(eq(schema.leadAttributeDefs.orgId, orgId), eq(schema.leadAttributeDefs.key, key)));
  if (existing) throw new Error(`Já existe um atributo com a chave "${key}" nesta operação.`);

  const position = input?.position !== undefined ? normalizePosition(input.position) : await nextPosition(orgId);
  try {
    const [def] = await db.insert(schema.leadAttributeDefs)
      .values({ orgId, name, key, type, options, required, position })
      .returning();
    return def;
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error(`Já existe um atributo com a chave "${key}" nesta operação.`);
    throw err;
  }
}

/** Edita um campo. O filtro leva id + orgId: nunca toca em campo de outra operação. */
export async function updateAttributeDef(orgId: string, id: string, patch: AttributeDefPatch): Promise<AttributeDef> {
  const db = await getDb();
  const [current] = await db.select().from(schema.leadAttributeDefs)
    .where(and(eq(schema.leadAttributeDefs.id, id), eq(schema.leadAttributeDefs.orgId, orgId)));
  if (!current) throw new Error('Atributo não encontrado.');

  const set: Partial<{
    name: string; type: AttributeType; options: string[]; required: boolean; position: number;
  }> = {};
  if (patch?.name !== undefined) set.name = normalizeName(patch.name);
  if (patch?.type !== undefined) set.type = normalizeType(patch.type);
  if (patch?.required !== undefined) set.required = normalizeRequired(patch.required);
  if (patch?.position !== undefined) set.position = normalizePosition(patch.position);
  if (patch?.options !== undefined || patch?.type !== undefined) {
    const type = set.type ?? current.type;
    set.options = normalizeOptions(type, patch.options ?? current.options);
  }

  // Renomear não muda a chave: os valores já gravados nos leads continuam válidos.
  const [def] = await db.update(schema.leadAttributeDefs).set(set)
    .where(and(eq(schema.leadAttributeDefs.id, id), eq(schema.leadAttributeDefs.orgId, orgId)))
    .returning();
  if (!def) throw new Error('Atributo não encontrado.');
  return def;
}

/** Remove o campo da operação e limpa a chave nos valores dos leads da operação. */
export async function deleteAttributeDef(orgId: string, id: string): Promise<void> {
  const db = await getDb();
  const [def] = await db.delete(schema.leadAttributeDefs)
    .where(and(eq(schema.leadAttributeDefs.id, id), eq(schema.leadAttributeDefs.orgId, orgId)))
    .returning();
  if (!def) throw new Error('Atributo não encontrado.');
  await db.update(schema.leads)
    .set({ attributes: sql`${schema.leads.attributes} - ${def.key}::text` })
    .where(eq(schema.leads.orgId, orgId));
}

/**
 * Valida (e normaliza) o valor de um campo conforme o tipo da definição.
 * Devolve o valor normalizado ou lança Error em português.
 */
export function validateAttributeValue(
  def: Pick<AttributeDef, 'type'> & { options?: string[] | null; required?: boolean },
  raw: unknown,
): AttributeValue {
  const type = normalizeType(def?.type);
  switch (type) {
    case 'text': {
      if (typeof raw !== 'string') throw new Error('Valor inválido: este campo espera texto.');
      const value = raw.trim();
      if (value.length > TEXT_MAX) throw new Error(`Valor muito longo (máximo ${TEXT_MAX} caracteres).`);
      if (def?.required && !value) throw new Error('Campo obrigatório.');
      return value;
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error('Valor inválido: este campo espera um número.');
      return raw;
    }
    case 'date': {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || !isRealDate(raw)) {
        throw new Error('Valor inválido: a data deve estar no formato AAAA-MM-DD.');
      }
      return raw;
    }
    case 'bool': {
      if (typeof raw !== 'boolean') throw new Error('Valor inválido: este campo espera sim ou não.');
      return raw;
    }
    case 'select': {
      const options = Array.isArray(def?.options) ? def.options : [];
      if (typeof raw !== 'string' || !options.includes(raw)) {
        throw new Error('Valor inválido: escolha uma das opções do campo.');
      }
      return raw;
    }
  }
}

/**
 * Grava valores de atributos do lead. Cada chave é validada contra a definição
 * da operação; o que não vem no patch é preservado.
 */
export async function mergeLeadAttributes(
  orgId: string,
  leadId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, AttributeValue>> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Valores inválidos: envie um objeto com os atributos do lead.');
  }
  const db = await getDb();
  const defs = await listAttributeDefs(orgId);
  const byKey = new Map(defs.map((d) => [d.key, d]));

  const normalized: Record<string, AttributeValue> = {};
  for (const [key, raw] of Object.entries(patch)) {
    const def = byKey.get(key);
    if (!def) throw new Error(`O atributo "${key}" não existe nesta operação.`);
    normalized[key] = validateAttributeValue(def, raw);
  }

  const [lead] = await db.select({ id: schema.leads.id, attributes: schema.leads.attributes })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, orgId)));
  if (!lead) throw new Error('Lead não encontrado.');

  const current = asRecord(lead.attributes);
  const merged: Record<string, AttributeValue> = { ...(current as Record<string, AttributeValue>), ...normalized };
  await db.update(schema.leads).set({ attributes: merged })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, orgId)));
  return merged;
}

/** Definições da operação + os valores preenchidos no lead. */
export async function leadAttributeValues(
  orgId: string,
  leadId: string,
): Promise<{ defs: AttributeDef[]; values: Record<string, AttributeValue> }> {
  const db = await getDb();
  const [lead] = await db.select({ attributes: schema.leads.attributes }).from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, orgId)));
  if (!lead) throw new Error('Lead não encontrado.');
  const defs = await listAttributeDefs(orgId);
  const raw = asRecord(lead.attributes);
  const values: Record<string, AttributeValue> = {};
  for (const def of defs) {
    const value = raw[def.key];
    if (value === undefined || value === null) continue;
    values[def.key] = value as AttributeValue;
  }
  return { defs, values };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

async function nextPosition(orgId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ position: schema.leadAttributeDefs.position }).from(schema.leadAttributeDefs)
    .where(eq(schema.leadAttributeDefs.orgId, orgId));
  return rows.reduce((max, r) => Math.max(max, r.position + 1), 0);
}

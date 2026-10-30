import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { fail, fromError, ok } from '@/app/api/agenda/_http';

export const dynamic = 'force-dynamic';

/**
 * Bloqueios da agenda: outro compromisso, reunião interna, viagem, férias.
 *
 * A tabela `agenda_blackouts` já é respeitada pelo cálculo de horários
 * (`computeSlots` descarta o slot que sobrepõe um bloqueio): o que falta aqui
 * é a API para cadastrar, listar e remover.
 *
 * Regras desta rota:
 *  - o `orgId` vem SEMPRE da sessão (`requireOrg`), nunca do corpo;
 *  - o fim tem que ser depois do início;
 *  - bloqueio no passado é recusado (não bloqueia nada);
 *  - bloqueio com mais de 1 ano à frente é recusado;
 *  - a listagem é filtrada pela operação — uma org nunca vê ( nem remove ) o
 *    bloqueio de outra.
 */

/** Teto do bloqueio: 1 ano à frente. */
const MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/** Data/hora em ISO 8601 (com `Z` ou com offset). */
const ISO_DATETIME = z
  .string()
  .trim()
  .min(1, 'Informe a data.')
  .max(64)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida.');

/** Identificador do bloqueio (uuid do banco). */
const UUID = z.string().uuid('Identificador inválido.');

/** Corpo de criação do bloqueio. */
const BLACKOUT_BODY = z
  .object({
    startAt: ISO_DATETIME,
    endAt: ISO_DATETIME,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((body) => new Date(body.endAt).getTime() > new Date(body.startAt).getTime(), {
    message: 'O fim do bloqueio precisa ser depois do início.',
    path: ['endAt'],
  });

/** Bloqueio no formato público da API. */
type BlackoutView = { id: string; startAt: string; endAt: string; reason: string };

/**
 * Sessão da operação. `requireOrg()` redireciona quando não há sessão/equipe;
 * aqui isso vira 401/403 em JSON (mesmo contrato das outras rotas internas).
 */
async function requireOrgId(): Promise<{ ok: true; orgId: string } | { ok: false; response: NextResponse }> {
  try {
    const ctx = await requireOrg();
    return { ok: true, orgId: ctx.org.id };
  } catch (err) {
    const digest =
      typeof err === 'object' && err !== null && 'digest' in err && typeof (err as { digest?: unknown }).digest === 'string'
        ? (err as { digest: string }).digest
        : '';
    if (digest.startsWith('NEXT_REDIRECT')) {
      const target = digest.split(';')[2] ?? '';
      if (target === '/login') {
        return { ok: false, response: fail('Sessão expirada. Entre novamente.', 401) };
      }
      return { ok: false, response: fail('Você não tem acesso a esta operação.', 403) };
    }
    return { ok: false, response: fail('Não foi possível validar a sessão.', 500) };
  }
}

/** Linha do banco -> formato da API (datas em ISO). */
function toView(row: { id: string; startAt: Date; endAt: Date; reason: string }): BlackoutView {
  return {
    id: row.id,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    reason: row.reason,
  };
}

/** Lê o id do bloqueio: query string (`?id=`) ou corpo JSON (`{ id }`). */
async function readId(req: Request): Promise<string | null> {
  const fromQuery = new URL(req.url).searchParams.get('id');
  if (fromQuery && fromQuery.trim()) return fromQuery.trim();
  const body = await req.json().catch(() => null);
  if (body && typeof body === 'object' && 'id' in body) {
    const value = (body as { id?: unknown }).id;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Lista os bloqueios da operação (do mais antigo para o mais recente). */
export async function GET() {
  const auth = await requireOrgId();
  if (!auth.ok) return auth.response;
  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: schema.agendaBlackouts.id,
        startAt: schema.agendaBlackouts.startAt,
        endAt: schema.agendaBlackouts.endAt,
        reason: schema.agendaBlackouts.reason,
      })
      .from(schema.agendaBlackouts)
      .where(eq(schema.agendaBlackouts.orgId, auth.orgId))
      .orderBy(asc(schema.agendaBlackouts.startAt))
      .limit(200);
    return ok({ blackouts: rows.map(toView) });
  } catch (err) {
    return fromError(err, 'Não foi possível carregar os bloqueios.', 500);
  }
}

/** Cria um bloqueio (o período sai da agenda pública). */
export async function POST(req: Request) {
  const auth = await requireOrgId();
  if (!auth.ok) return auth.response;
  const parsed = BLACKOUT_BODY.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Dados inválidos.', 400);
  }

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);
  const now = Date.now();
  if (endAt.getTime() <= startAt.getTime()) {
    return fail('O fim do bloqueio precisa ser depois do início.', 400);
  }
  if (startAt.getTime() < now) {
    return fail('Não é possível criar um bloqueio no passado.', 400);
  }
  if (endAt.getTime() > now + MAX_AHEAD_MS) {
    return fail('O bloqueio não pode passar de 1 ano à frente.', 400);
  }

  try {
    const db = await getDb();
    const [row] = await db
      .insert(schema.agendaBlackouts)
      .values({
        orgId: auth.orgId,
        startAt,
        endAt,
        reason: parsed.data.reason ?? '',
      })
      .returning({
        id: schema.agendaBlackouts.id,
        startAt: schema.agendaBlackouts.startAt,
        endAt: schema.agendaBlackouts.endAt,
        reason: schema.agendaBlackouts.reason,
      });
    return ok({ blackout: toView(row) }, 201);
  } catch (err) {
    return fromError(err, 'Não foi possível criar o bloqueio.');
  }
}

/** Remove um bloqueio da operação (os horários voltam a ficar disponíveis). */
export async function DELETE(req: Request) {
  const auth = await requireOrgId();
  if (!auth.ok) return auth.response;
  const rawId = await readId(req);
  if (!rawId) {
    return fail('Informe o bloqueio que deve ser removido.', 400);
  }
  const parsedId = UUID.safeParse(rawId);
  if (!parsedId.success) {
    return fail('Identificador inválido.', 400);
  }
  try {
    const db = await getDb();
    // O filtro por operação impede remover o bloqueio de outra org.
    const deleted = await db
      .delete(schema.agendaBlackouts)
      .where(and(eq(schema.agendaBlackouts.id, parsedId.data), eq(schema.agendaBlackouts.orgId, auth.orgId)))
      .returning({ id: schema.agendaBlackouts.id });
    if (!deleted.length) {
      return fail('Bloqueio não encontrado.', 404);
    }
    return ok({ id: parsedId.data });
  } catch (err) {
    return fromError(err, 'Não foi possível remover o bloqueio.');
  }
}

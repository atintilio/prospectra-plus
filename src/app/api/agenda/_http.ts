import { NextResponse } from 'next/server';

/** Resposta de erro padronizada: sempre JSON, nunca stack trace. */
export function fail(error: string, status: number, code?: string): NextResponse {
  const payload: { ok: false; error: string; code?: string } = { ok: false, error };
  if (code) payload.code = code;
  return NextResponse.json(payload, { status });
}

/** Resposta de sucesso padronizada: `{ ok: true, ...dados }`. */
export function ok<T extends object>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}

/**
 * Converte uma mensagem de erro da camada de dados em status HTTP coerente.
 * `não encontrado` -> 404, `já existe` -> 409, resto -> 400.
 */
export function statusFor(message: string): number {
  const m = message.toLowerCase();
  if (m.includes('não encontrado') || m.includes('nao encontrado') || m.includes('not found')) return 404;
  if (m.includes('já existe') || m.includes('ja existe')) return 409;
  return 400;
}

/**
 * Traduz um erro inesperado em resposta JSON segura.
 * Mensagens internas do banco (constraint, stack) viram respostas genéricas.
 */
export function fromError(err: unknown, fallback: string, fallbackStatus = 400): NextResponse {
  const raw = err instanceof Error ? err.message : '';
  if (!raw || raw.includes('\n') || raw.length > 300) return fail(fallback, fallbackStatus);
  const lower = raw.toLowerCase();
  if (lower.includes('foreign key')) return fail('Registro relacionado não encontrado.', 404);
  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    return fail('Já existe um registro com esses dados.', 409);
  }
  return fail(raw, statusFor(raw));
}

/**
 * Status para as rotas públicas: evento/slug inexistente é 404, o resto é 500.
 */
export function publicStatus(error: string): number {
  const m = error.toLowerCase();
  if (m.includes('não encontrado') || m.includes('nao encontrado') || m.includes('not found') || m.includes('inativ')) {
    return 404;
  }
  return 500;
}

/**
 * Regras de expiracao da sessao por inatividade.
 *
 * Regra do dono (04/11/2026): 15 minutos sem uso encerram o Prospectra e a
 * pessoa precisa entrar de novo.
 *
 * A "batida" (heartbeat) do navegador renova a sessao enquanto ha uso; sem
 * batida, a sessao expira sozinha no servidor.
 */

/** Minutos de inatividade que encerram a sessao (padrao: 15). */
export const MINUTOS_INATIVIDADE_PADRAO = 15;

/** Quanto antes do fim aparece o aviso ("sua sessao encerra em ..."). */
export const AVISO_MINUTOS_PADRAO = 2;

/** Intervalo minimo entre duas batidas do navegador. */
export const INTERVALO_PING_MS = 120_000;

/**
 * Minutos de inatividade configuraveis por `SESSION_IDLE_MINUTES`.
 * Valores absurdos caem no padrao; o teto e de 24 horas.
 */
export function minutosInatividade(configurado?: string | null): number {
  const raw = Number.parseInt(configurado ?? '', 10);
  if (!Number.isFinite(raw) || raw < 1) return MINUTOS_INATIVIDADE_PADRAO;
  return Math.min(raw, 24 * 60);
}

/**
 * Segundos que faltam para a sessao encerrar, ou `null` quando ainda nao e
 * hora de avisar.
 */
export function segundosRestantes(paradoMs: number, limiteMs: number, avisoMs: number): number | null {
  if (paradoMs >= avisoMs) return Math.max(1, Math.ceil((limiteMs - paradoMs) / 1000));
  return null;
}

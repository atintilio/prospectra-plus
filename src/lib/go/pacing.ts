import 'server-only';

// Ritmo seguro da automação de LinkedIn (aplicado no push automático ao Go):
// janela de horário comercial por fuso, espaçamento mínimo entre ações da mesma
// conta e teto semanal de convites. Funções puras para facilitar o teste.

export type PacingConfig = {
  timezone: string;
  start: string; // 'HH:MM'
  end: string;   // 'HH:MM'
  minGapMin: number;
  weeklyInviteCap: number;
};

/** Minutos desde a meia-noite no fuso informado (via Intl, sem dependências). */
export function minutesOfDay(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return (h % 24) * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes(); // fallback seguro
  }
}

function hhmmToMin(v: string): number {
  const [h, m] = String(v).split(':').map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return (h % 24) * 60 + (m % 60);
}

/** Dentro da janela comercial? Suporta janela que cruza a meia-noite (start > end). */
export function isWithinWorkingHours(cfg: Pick<PacingConfig, 'timezone' | 'start' | 'end'>, now: Date): boolean {
  const t = minutesOfDay(now, cfg.timezone);
  const s = hhmmToMin(cfg.start);
  const e = hhmmToMin(cfg.end);
  if (s === e) return true; // janela aberta 24h quando start == end
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** Já passou o espaçamento mínimo desde a última ação enviada desta conta? */
export function gapElapsed(lastSentAt: Date | null | undefined, minGapMin: number, now: Date): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= minGapMin * 60_000;
}

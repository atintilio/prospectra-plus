import { describe, expect, it } from 'vitest';
import { isWithinWorkingHours, gapElapsed, minutesOfDay } from '@/lib/go/pacing';

describe('ritmo seguro · pacing', () => {
  const tz = 'America/Sao_Paulo'; // UTC-3

  it('minutesOfDay converte para o fuso', () => {
    // 15:00Z = 12:00 em São Paulo
    expect(minutesOfDay(new Date('2026-11-18T15:00:00Z'), tz)).toBe(12 * 60);
  });

  it('janela comercial padrão 09:00–18:00', () => {
    const cfg = { timezone: tz, start: '09:00', end: '18:00' };
    expect(isWithinWorkingHours(cfg, new Date('2026-11-18T15:00:00Z'))).toBe(true);  // 12:00
    expect(isWithinWorkingHours(cfg, new Date('2026-11-18T06:00:00Z'))).toBe(false); // 03:00
    expect(isWithinWorkingHours(cfg, new Date('2026-11-18T23:00:00Z'))).toBe(false); // 20:00
  });

  it('janela que cruza a meia-noite', () => {
    const cfg = { timezone: tz, start: '22:00', end: '06:00' };
    expect(isWithinWorkingHours(cfg, new Date('2026-11-18T03:00:00Z'))).toBe(true);  // 00:00
    expect(isWithinWorkingHours(cfg, new Date('2026-11-18T15:00:00Z'))).toBe(false); // 12:00
  });

  it('espaçamento mínimo', () => {
    const now = new Date('2026-11-18T15:00:00Z');
    expect(gapElapsed(null, 30, now)).toBe(true);
    expect(gapElapsed(new Date(now.getTime() - 10 * 60_000), 30, now)).toBe(false);
    expect(gapElapsed(new Date(now.getTime() - 31 * 60_000), 30, now)).toBe(true);
  });
});

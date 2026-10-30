import { describe, it, expect } from 'vitest';
import { computeSlots, zonedParts, zonedTimeToUtc, slotDurationMs } from '@/lib/agenda-slots';

const TZ = 'America/Sao_Paulo';

/** Offset do fuso (em minutos) no instante informado, calculado pelo Intl. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - instant.getTime()) / 60_000;
}

/** Horário local -> UTC, usando o offset do Intl (independente da lib). */
function localToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = TZ,
): string {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const offset = offsetMinutes(new Date(naive), timeZone);
  return new Date(naive - offset * 60_000).toISOString();
}

/** "HH:MM" do instante no fuso informado. */
function localClock(iso: string, timeZone: string = TZ): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
}

const base = {
  durationMin: 30,
  slotIntervalMin: 30,
  minNoticeMin: 0,
  bufferMin: 0,
  timezone: TZ,
};

const WEDNESDAY_9H = { dayOfWeek: 3, startMinute: 9 * 60, endMinute: 12 * 60 };

describe('agenda-slots: fuso e conversão de horário local', () => {
  it('zonedParts devolve data, hora e dia da semana local', () => {
    // 11/11/2026 é quarta-feira; 12:00 UTC = 09:00 em São Paulo.
    expect(zonedParts(new Date('2026-11-11T12:00:00Z'), TZ)).toEqual({
      year: 2026,
      month: 11,
      day: 11,
      hour: 9,
      minute: 0,
      weekday: 3,
    });
  });

  it('zonedTimeToUtc converte o horário local no fuso para o instante UTC', () => {
    const utc = zonedTimeToUtc({ year: 2026, month: 11, day: 11, hour: 9, minute: 0, timezone: TZ });
    expect(utc.toISOString()).toBe(localToUtcIso(2026, 11, 11, 9, 0));
    // volta para o mesmo horário local
    expect(zonedParts(utc, TZ)).toEqual({
      year: 2026,
      month: 11,
      day: 11,
      hour: 9,
      minute: 0,
      weekday: 3,
    });
  });

  it('America/Sao_Paulo: 9h local sai no UTC correspondente ao offset do Intl', () => {
    const utc = zonedTimeToUtc({ year: 2026, month: 11, day: 11, hour: 9, minute: 0, timezone: TZ });
    // o offset vem do tzdata do ambiente (hoje o Brasil é UTC-3, sem horário de verão)
    expect(utc.toISOString()).toBe(localToUtcIso(2026, 11, 11, 9, 0));
    expect(localClock(utc.toISOString())).toBe('09:00');
    expect(offsetMinutes(utc, TZ)).toBe(offsetMinutes(new Date('2026-11-11T12:00:00Z'), TZ));
  });

  it('converte horário de verão brasileiro (2018) pelo offset do Intl', () => {
    // Em 15/02/2018 o Brasil usava horário de verão: 9h local = 11h UTC.
    const utc = zonedTimeToUtc({ year: 2018, month: 2, day: 15, hour: 9, minute: 0, timezone: TZ });
    expect(utc.toISOString()).toBe(localToUtcIso(2018, 2, 15, 9, 0));
    expect(localClock(utc.toISOString())).toBe('09:00');
    // o offset de verão está mais perto de zero que o de hoje
    expect(offsetMinutes(utc, TZ)).toBeGreaterThan(offsetMinutes(new Date('2026-11-11T12:00:00Z'), TZ));
  });

  it('slotDurationMs converte minutos em milissegundos', () => {
    expect(slotDurationMs(30)).toBe(1_800_000);
    expect(slotDurationMs(45)).toBe(2_700_000);
  });
});

describe('agenda-slots: regras do cálculo', () => {
  it('gera slots apenas nos dias da semana com disponibilidade', () => {
    const slots = computeSlots({
      ...base,
      availability: [WEDNESDAY_9H],
      from: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2026-12-01T00:00:00Z'),
      now: new Date('2026-10-30T00:00:00Z'),
    });
    // quartas de novembro/2026: 4, 11, 18 e 25 — 6 slots por dia (9h às 11h30)
    expect(slots).toHaveLength(24);
    expect(slots.every((s) => s.label.startsWith('qua,'))).toBe(true);
    expect(slots[0].label).toBe('qua, 04/11 às 09:00');
    expect(slots[slots.length - 1].label).toBe('qua, 25/11 às 11:30');
  });

  it('respeita a antecedência mínima', () => {
    const slots = computeSlots({
      ...base,
      minNoticeMin: 120,
      availability: [{ dayOfWeek: 2, startMinute: 9 * 60, endMinute: 12 * 60 }],
      from: new Date('2026-11-10T00:00:00Z'),
      to: new Date('2026-11-11T00:00:00Z'),
      now: new Date('2026-11-10T11:00:00Z'), // 08:00 local
    });
    // agora + 2h = 10:00 local → 09:00 e 09:30 ficam de fora
    expect(slots.map((s) => s.label)).toEqual([
      'ter, 10/11 às 10:00',
      'ter, 10/11 às 10:30',
      'ter, 10/11 às 11:00',
      'ter, 10/11 às 11:30',
    ]);
  });

  it('usa slotIntervalMin como passo dentro da janela', () => {
    const slots = computeSlots({
      ...base,
      slotIntervalMin: 45,
      availability: [WEDNESDAY_9H],
      from: new Date('2026-11-11T00:00:00Z'),
      to: new Date('2026-11-12T00:00:00Z'),
      now: new Date('2026-11-01T00:00:00Z'),
    });
    expect(slots.map((s) => s.label)).toEqual([
      'qua, 11/11 às 09:00',
      'qua, 11/11 às 09:45',
      'qua, 11/11 às 10:30',
      'qua, 11/11 às 11:15',
    ]);
    const starts = slots.map((s) => new Date(s.startIso).getTime());
    expect(starts[1] - starts[0]).toBe(45 * 60_000);
  });

  it('blackout bloqueia os slots sobrepostos', () => {
    const slots = computeSlots({
      ...base,
      availability: [WEDNESDAY_9H],
      blackouts: [
        {
          startAt: new Date(localToUtcIso(2026, 11, 11, 10, 0)),
          endAt: new Date(localToUtcIso(2026, 11, 11, 11, 0)),
        },
      ],
      from: new Date('2026-11-11T00:00:00Z'),
      to: new Date('2026-11-12T00:00:00Z'),
      now: new Date('2026-11-01T00:00:00Z'),
    });
    expect(slots.map((s) => s.label)).toEqual([
      'qua, 11/11 às 09:00',
      'qua, 11/11 às 09:30',
      'qua, 11/11 às 11:00',
      'qua, 11/11 às 11:30',
    ]);
  });

  it('reserva existente bloqueia o horário ocupado', () => {
    const slots = computeSlots({
      ...base,
      availability: [WEDNESDAY_9H],
      busy: [
        {
          start: new Date(localToUtcIso(2026, 11, 11, 10, 0)),
          end: new Date(localToUtcIso(2026, 11, 11, 11, 0)),
        },
      ],
      from: new Date('2026-11-11T00:00:00Z'),
      to: new Date('2026-11-12T00:00:00Z'),
      now: new Date('2026-11-01T00:00:00Z'),
    });
    expect(slots.map((s) => s.label)).toEqual([
      'qua, 11/11 às 09:00',
      'qua, 11/11 às 09:30',
      'qua, 11/11 às 11:00',
      'qua, 11/11 às 11:30',
    ]);
  });

  it('buffer impede slot encostado na reserva existente', () => {
    const busy = [
      {
        start: new Date(localToUtcIso(2026, 11, 11, 10, 0)),
        end: new Date(localToUtcIso(2026, 11, 11, 11, 0)),
      },
    ];
    const janela = {
      availability: [WEDNESDAY_9H],
      from: new Date('2026-11-11T00:00:00Z'),
      to: new Date('2026-11-12T00:00:00Z'),
      now: new Date('2026-11-01T00:00:00Z'),
    };

    const semBuffer = computeSlots({ ...base, ...janela, busy });
    // sem buffer, o slot que termina exatamente quando a reserva começa é livre
    expect(semBuffer.map((s) => s.label)).toContain('qua, 11/11 às 09:30');

    const comBuffer = computeSlots({ ...base, ...janela, busy, bufferMin: 30 });
    // com 30min de buffer, só sobra o que mantém distância da reserva
    expect(comBuffer.map((s) => s.label)).toEqual(['qua, 11/11 às 09:00', 'qua, 11/11 às 11:30']);
  });

  it('o fim do slot é o início + duração, no fuso do evento', () => {
    const slots = computeSlots({
      ...base,
      durationMin: 45,
      availability: [{ dayOfWeek: 3, startMinute: 9 * 60, endMinute: 11 * 60 }],
      from: new Date('2026-11-11T00:00:00Z'),
      to: new Date('2026-11-12T00:00:00Z'),
      now: new Date('2026-11-01T00:00:00Z'),
    });
    // janela 9h–11h, duração 45min: começa às 9h, 9h30 e 10h
    expect(slots).toHaveLength(3);
    const first = slots[0];
    expect(new Date(first.endIso).getTime() - new Date(first.startIso).getTime()).toBe(45 * 60_000);
    expect(first.startIso).toBe(localToUtcIso(2026, 11, 11, 9, 0));
    expect(localClock(first.startIso)).toBe('09:00');
    expect(first.label).toBe('qua, 11/11 às 09:00');
  });

  it('devolve slots em ordem cronológica e sem repetição', () => {
    const slots = computeSlots({
      ...base,
      availability: [
        { dayOfWeek: 3, startMinute: 9 * 60, endMinute: 12 * 60 },
        { dayOfWeek: 3, startMinute: 10 * 60, endMinute: 11 * 60 }, // janela sobreposta
      ],
      from: new Date('2026-11-11T00:00:00Z'),
      to: new Date('2026-11-12T00:00:00Z'),
      now: new Date('2026-11-01T00:00:00Z'),
    });
    const starts = slots.map((s) => new Date(s.startIso).getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
    expect(slots).toHaveLength(6);
  });
});

describe('agenda-slots: limites de segurança', () => {
  const todosOsDias = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    startMinute: 0,
    endMinute: 24 * 60,
  }));

  it('nunca passa de 62 dias', () => {
    const slots = computeSlots({
      ...base,
      slotIntervalMin: 24 * 60,
      availability: todosOsDias,
      from: new Date('2026-01-01T03:00:00Z'), // meia-noite local
      to: new Date('2026-12-31T00:00:00Z'),
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(slots).toHaveLength(62);
    expect(slots[0].label).toBe('qui, 01/01 às 00:00');
    expect(slots[slots.length - 1].label).toBe('ter, 03/03 às 00:00');
  });

  it('nunca devolve mais de 400 slots', () => {
    const slots = computeSlots({
      ...base,
      slotIntervalMin: 15,
      availability: todosOsDias,
      from: new Date('2026-01-01T03:00:00Z'),
      to: new Date('2026-12-31T00:00:00Z'),
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(slots).toHaveLength(400);
  });
});

describe('agenda-slots: entradas inválidas', () => {
  it('rejeita duração e intervalo inválidos em vez de engolir o erro', () => {
    expect(() =>
      computeSlots({ ...base, durationMin: 0, availability: [WEDNESDAY_9H], from: new Date(), to: new Date() }),
    ).toThrow(RangeError);
    expect(() =>
      computeSlots({ ...base, slotIntervalMin: 0, availability: [WEDNESDAY_9H], from: new Date(), to: new Date() }),
    ).toThrow(RangeError);
    expect(() => slotDurationMs(Number.NaN)).toThrow(RangeError);
  });

  it('devolve lista vazia quando não há disponibilidade', () => {
    const slots = computeSlots({
      ...base,
      availability: [],
      from: new Date('2026-11-11T00:00:00Z'),
      to: new Date('2026-11-12T00:00:00Z'),
      now: new Date('2026-11-01T00:00:00Z'),
    });
    expect(slots).toEqual([]);
  });
});

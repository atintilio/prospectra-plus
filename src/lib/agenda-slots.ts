/**
 * Cálculo de horários livres da agenda nativa.
 *
 * Tudo aqui é puro (sem banco, sem data-fns/luxon): o fuso é resolvido com
 * `Intl.DateTimeFormat(..., { timeZone }).formatToParts` e a conversão
 * "hora local -> UTC" é feita em duas passadas de ajuste de offset (a segunda
 * passada resolve o horário de verão).
 *
 * Regras (contrato da agenda nativa, seção 5):
 *  - o dia é percorrido no fuso do evento, do `from` ao `to`;
 *  - um slot só nasce se `start >= now + minNoticeMin`;
 *  - `start` precisa cair dentro de uma janela de disponibilidade do dia da
 *    semana e `end` precisa caber na janela;
 *  - o passo dentro da janela é `slotIntervalMin`;
 *  - `bufferMin` amplia as reservas existentes (`busy`) — o slot não pode
 *    encostar nelas;
 *  - slots que sobrepõem `busy` ou `blackouts` são descartados;
 *  - limites de segurança: no máximo 62 dias percorridos e 400 slots gerados.
 */

/** Fuso padrão do evento (o mesmo do `agenda_event_types.timezone`). */
export const AGENDA_DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Teto de dias percorridos na busca (evita varrer um intervalo gigante). */
export const AGENDA_MAX_DAYS = 62;

/** Teto de slots devolvidos por busca. */
export const AGENDA_MAX_SLOTS = 400;

export type AgendaSlot = {
  /** ISO UTC do início. */
  startIso: string;
  /** ISO UTC do fim. */
  endIso: string;
  /** Rótulo em pt-BR no fuso do evento, ex.: "qua, 12/11 às 14:00". */
  label: string;
};

export type SlotInput = {
  durationMin: number;
  slotIntervalMin: number;
  minNoticeMin: number;
  bufferMin: number;
  /** IANA, ex.: 'America/Sao_Paulo'. */
  timezone: string;
  /** Janelas semanais: dia da semana (0 = domingo) + minutos desde a meia-noite local. */
  availability: { dayOfWeek: number; startMinute: number; endMinute: number }[];
  blackouts?: { startAt: Date; endAt: Date }[];
  /** Reservas já existentes (requested/confirmed). */
  busy?: { start: Date; end: Date }[];
  from: Date;
  to: Date;
  now?: Date;
};

/** Dia da semana (0 = domingo) pelo nome curto devolvido pelo Intl em `en-US`. */
const WEEKDAY_BY_SHORT: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Rótulos curtos em pt-BR (0 = domingo). */
const WEEKDAY_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

const MINUTE_MS = 60_000;

type ZonedPartsInternal = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

/** Partes do instante no fuso informado (o Intl lança se o fuso não existir). */
function partsOf(date: Date, timezone: string): ZonedPartsInternal {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const raw = new Map<string, string>();
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') raw.set(part.type, part.value);
  }
  const number = (type: string): number => {
    const value = raw.get(type);
    if (value === undefined) throw new Error(`Não foi possível ler "${type}" do fuso ${timezone}.`);
    return Number(value);
  };
  const weekdayRaw = raw.get('weekday');
  const weekday = weekdayRaw === undefined ? undefined : WEEKDAY_BY_SHORT[weekdayRaw];
  if (weekday === undefined) throw new Error(`Não foi possível ler o dia da semana no fuso ${timezone}.`);
  const hour = number('hour');
  return {
    year: number('year'),
    month: number('month'),
    day: number('day'),
    hour: hour === 24 ? 0 : hour,
    minute: number('minute'),
    second: number('second'),
    weekday,
  };
}

/**
 * Data/hora local (e dia da semana) de um instante no fuso informado.
 * `weekday` segue o padrão do repo: 0 = domingo … 6 = sábado.
 */
export function zonedParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = partsOf(date, timezone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    weekday: parts.weekday,
  };
}

/**
 * Converte um horário local (ano/mês/dia/hora/minuto) no fuso informado para o
 * instante UTC correspondente.
 *
 * Duas passadas: a primeira calcula o offset do fuso no instante "cru" e corrige;
 * a segunda refaz o cálculo no instante já corrigido — é ela que acerta o
 * horário de verão (offset muda dentro do mesmo dia).
 */
export function zonedTimeToUtc(args: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timezone: string;
}): Date {
  const { year, month, day, hour, minute, timezone } = args;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = new Date(localAsUtc);
  for (let pass = 0; pass < 2; pass++) {
    const parts = partsOf(guess, timezone);
    const localOfGuess = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const offsetMs = localOfGuess - guess.getTime();
    guess = new Date(localAsUtc - offsetMs);
  }
  return guess;
}

/** Duração de uma reunião em milissegundos. */
export function slotDurationMs(durationMin: number): number {
  if (!Number.isFinite(durationMin) || durationMin < 0) {
    throw new RangeError(`Duração inválida: ${durationMin} minutos.`);
  }
  return Math.round(durationMin * MINUTE_MS);
}

/** "qua, 12/11 às 14:00" — rótulo no fuso do evento. */
function formatLabel(date: Date, timezone: string): string {
  const parts = zonedParts(date, timezone);
  const day = String(parts.day).padStart(2, '0');
  const month = String(parts.month).padStart(2, '0');
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return `${WEEKDAY_PT[parts.weekday]}, ${day}/${month} às ${hour}:${minute}`;
}

/**
 * Horários livres entre `from` e `to`.
 *
 * O slot começa dentro de `[from, to]` (o `to` limita o início do slot, não o
 * fim) e precisa respeitar as janelas de disponibilidade, a antecedência
 * mínima, as reservas existentes (com buffer) e os bloqueios.
 */
export function computeSlots(input: SlotInput): AgendaSlot[] {
  const {
    durationMin,
    slotIntervalMin,
    minNoticeMin,
    bufferMin,
    availability,
    blackouts = [],
    busy = [],
    from,
    to,
    now = new Date(),
  } = input;
  const timezone = input.timezone || AGENDA_DEFAULT_TIMEZONE;

  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    throw new RangeError('A duração da reunião precisa ser maior que zero.');
  }
  if (!Number.isFinite(slotIntervalMin) || slotIntervalMin <= 0) {
    throw new RangeError('O intervalo entre horários precisa ser maior que zero.');
  }
  if (!Number.isFinite(minNoticeMin) || minNoticeMin < 0) {
    throw new RangeError('A antecedência mínima não pode ser negativa.');
  }
  if (!Number.isFinite(bufferMin) || bufferMin < 0) {
    throw new RangeError('O intervalo entre reuniões não pode ser negativo.');
  }
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    throw new RangeError('Janela de busca inválida (from/to).');
  }

  const durationMs = slotDurationMs(durationMin);
  const bufferMs = bufferMin * MINUTE_MS;
  const earliestMs = now.getTime() + minNoticeMin * MINUTE_MS;

  // Reservas existentes ampliadas pelo intervalo entre reuniões.
  const busyBlocks = busy.map((b) => ({
    start: b.start.getTime() - bufferMs,
    end: b.end.getTime() + bufferMs,
  }));
  const blackoutBlocks = blackouts.map((b) => ({
    start: b.startAt.getTime(),
    end: b.endAt.getTime(),
  }));

  const slots: AgendaSlot[] = [];
  const emitted = new Set<number>();

  const firstDay = zonedParts(from, timezone);
  let { year, month, day } = firstDay;

  for (let dayIndex = 0; dayIndex < AGENDA_MAX_DAYS; dayIndex++) {
    const dayStartMs = zonedTimeToUtc({ year, month, day, hour: 0, minute: 0, timezone }).getTime();
    if (dayStartMs > toMs) break;

    const weekday = zonedParts(new Date(dayStartMs), timezone).weekday;
    const windows = availability.filter((w) => w.dayOfWeek === weekday);

    for (const window of windows) {
      const windowStart = Math.max(0, Math.min(24 * 60, window.startMinute));
      const windowEnd = Math.max(0, Math.min(24 * 60, window.endMinute));
      if (windowEnd <= windowStart) continue;

      for (let minute = windowStart; minute + durationMin <= windowEnd; minute += slotIntervalMin) {
        const slotStartMs = zonedTimeToUtc({
          year,
          month,
          day,
          hour: Math.floor(minute / 60),
          minute: minute % 60,
          timezone,
        }).getTime();
        const slotEndMs = slotStartMs + durationMs;

        if (slotStartMs < fromMs) continue;
        if (slotStartMs > toMs) break;
        if (slotStartMs < earliestMs) continue;
        if (emitted.has(slotStartMs)) continue;
        if (busyBlocks.some((b) => slotStartMs < b.end && slotEndMs > b.start)) continue;
        if (blackoutBlocks.some((b) => slotStartMs < b.end && slotEndMs > b.start)) continue;

        emitted.add(slotStartMs);
        slots.push({
          startIso: new Date(slotStartMs).toISOString(),
          endIso: new Date(slotEndMs).toISOString(),
          label: formatLabel(new Date(slotStartMs), timezone),
        });
        if (slots.length >= AGENDA_MAX_SLOTS) return slots;
      }
    }

    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    year = nextDay.getUTCFullYear();
    month = nextDay.getUTCMonth() + 1;
    day = nextDay.getUTCDate();
  }

  return slots;
}

import { z } from 'zod';

/** Slug do tipo de reunião (usado nas URLs públicas). */
export const SLUG = z.string().trim().min(1, 'Informe o código do evento.').max(120);

/** Identificador uuid (tipo de reunião). */
export const UUID = z.string().uuid('Identificador inválido.');

/** Data/hora em ISO 8601 (aceita `2026-11-12T14:00:00Z` e variações com offset). */
export const ISO_DATETIME = z
  .string()
  .trim()
  .min(1, 'Informe a data.')
  .max(64)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida.');

/** Janela de disponibilidade (dia da semana + minutos desde 00:00). */
export const AVAILABILITY_WINDOW = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .refine((w) => w.endMinute > w.startMinute, {
    message: 'A janela precisa terminar depois de começar.',
    path: ['endMinute'],
  });

/** Campos de um tipo de reunião (criação). */
export const EVENT_TYPE_INPUT = z.object({
  title: z.string().trim().min(1, 'Informe o título da reunião.').max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen.')
    .optional(),
  description: z.string().trim().max(2000).optional(),
  durationMin: z.number().int().min(5, 'Duração mínima de 5 minutos.').max(480).optional(),
  slotIntervalMin: z.number().int().min(5, 'Intervalo mínimo de 5 minutos.').max(240).optional(),
  minNoticeMin: z.number().int().min(0).max(20_160).optional(),
  bufferMin: z.number().int().min(0).max(480).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  location: z.string().trim().max(500).optional(),
  requiresConfirmation: z.boolean().optional(),
  availability: z.array(AVAILABILITY_WINDOW).max(80).optional(),
});

/** Campos de um tipo de reunião (edição). A disponibilidade tem rota própria. */
export const EVENT_TYPE_PATCH = z.object({
  title: z.string().trim().min(1, 'Informe o título da reunião.').max(120).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen.')
    .optional(),
  description: z.string().trim().max(2000).optional(),
  durationMin: z.number().int().min(5, 'Duração mínima de 5 minutos.').max(480).optional(),
  slotIntervalMin: z.number().int().min(5, 'Intervalo mínimo de 5 minutos.').max(240).optional(),
  minNoticeMin: z.number().int().min(0).max(20_160).optional(),
  bufferMin: z.number().int().min(0).max(480).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  location: z.string().trim().max(500).optional(),
  requiresConfirmation: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/** Corpo do agendamento público. */
export const BOOK_BODY = z.object({
  slug: SLUG,
  token: z.string().trim().max(200).optional().nullable(),
  start: ISO_DATETIME,
  attendeeName: z.string().trim().min(2, 'Informe seu nome.').max(120),
  attendeeEmail: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'E-mail inválido.')
    .optional()
    .nullable(),
  attendeePhone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/** Corpo do cancelamento público. */
export const CANCEL_BODY = z.object({
  cancelToken: z.string().trim().min(1, 'Informe o token de cancelamento.').max(200),
});

/** Corpo da disponibilidade. */
export const AVAILABILITY_BODY = z.object({
  availability: z.array(AVAILABILITY_WINDOW).max(80),
});

/** Corpo da criação de link rastreado. */
export const LINK_BODY = z.object({
  eventTypeId: UUID,
  leadId: UUID.optional().nullable(),
  channel: z.enum(['link', 'whatsapp', 'email', 'manual']).optional(),
});

/** Parâmetros de data opcionais (query string). */
export const OPTIONAL_DATE = ISO_DATETIME.optional().nullable();

/** Número inteiro opcional (query string). */
export const OPTIONAL_INT = z.preprocess(
  (v) => (v === null || v === '' || v === undefined ? undefined : Number(v)),
  z.number().int().min(1).max(500).optional(),
);

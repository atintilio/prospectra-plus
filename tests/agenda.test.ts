import { test, expect } from 'vitest';
import * as agenda from '@/lib/agenda';

/**
 * A agenda nativa substituiu o cal.com: este arquivo garante que o módulo
 * antigo (cliente HTTP do cal.diy) não voltou para o app.
 */
test('a agenda interna não expõe mais o cliente do cal.com', () => {
  expect('agendaStatus' in agenda).toBe(false);
  expect('createAgendaAdmin' in agenda).toBe(false);
  expect('AGENDA_BASE_URL' in agenda).toBe(false);
});

test('a agenda interna expõe o módulo nativo', () => {
  expect(typeof agenda.listEventTypes).toBe('function');
  expect(typeof agenda.createEventType).toBe('function');
  expect(typeof agenda.updateEventType).toBe('function');
  expect(typeof agenda.setAvailability).toBe('function');
  expect(typeof agenda.listAvailability).toBe('function');
  expect(typeof agenda.createLink).toBe('function');
  expect(typeof agenda.listBookings).toBe('function');
  expect(typeof agenda.computeSlots).toBe('function');
  expect(agenda.AGENDA_PUBLIC_URL).toMatch(/^https?:\/\//);
});

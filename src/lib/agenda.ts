import 'server-only';

/**
 * Agenda nativa do Prospectra.
 *
 * O cal.com (`agenda.argusprime.com.br`, serviço em 127.0.0.1:3102) saiu de cena:
 * a agenda agora é um módulo do próprio Prospectra — mesmo banco, mesma sessão,
 * mesma operação, lead vinculado à reserva.
 *
 * Este arquivo é o ponto de entrada único do módulo:
 *  - `./agenda-booking` → tipos de reunião, disponibilidade, links rastreados e reservas;
 *  - `./agenda-slots`   → cálculo dos horários livres (fuso do evento, antecedência, bloqueios).
 */

export * from './agenda-booking';
export * from './agenda-slots';

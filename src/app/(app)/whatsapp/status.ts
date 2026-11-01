import type { WhatsAppStatus } from '@/lib/whatsapp/akg';

/**
 * Estado do WhatsApp na tela: rótulo, tom do selo e explicação.
 *
 * O tom do selo é o mesmo usado pelo `IntegrationBadge`:
 * `ok` (pareado, verde), `alerta` (pareando/pendência) e `neutro` (desconectado).
 */

export type WhatsAppTone = 'ok' | 'alerta' | 'neutro';

export type WhatsAppStateView = {
  /** Rótulo curto do estado, usado dentro do selo. */
  label: string;
  /** Tom do selo. */
  tone: WhatsAppTone;
  /** Explicação em uma frase, mostrada abaixo do selo. */
  hint: string;
};

export const WHATSAPP_STATUS_VIEW: Record<WhatsAppStatus['state'], WhatsAppStateView> = {
  connected: {
    label: 'Pareado',
    tone: 'ok',
    hint: 'Número pareado: as mensagens são enviadas pelo seu WhatsApp.',
  },
  connecting: {
    label: 'Pareando',
    tone: 'alerta',
    hint: 'Aguardando o pareamento do número no celular.',
  },
  qr_ready: {
    label: 'Pareando',
    tone: 'alerta',
    hint: 'Escaneie o QR Code no celular para concluir o pareamento.',
  },
  disconnected: {
    label: 'Desconectado',
    tone: 'neutro',
    hint: 'Nenhum número pareado nesta conta.',
  },
  not_configured: {
    label: 'Indisponível',
    tone: 'alerta',
    hint: 'O gateway WA-AKG ainda precisa ser instalado e configurado pelo administrador.',
  },
  error: {
    label: 'Falha ao conectar',
    tone: 'alerta',
    hint: 'Não foi possível falar com o gateway WA-AKG.',
  },
};

/** Estado desconhecido nunca finge estar pareado: cai em "falha". */
export function describeWhatsAppStatus(state: WhatsAppStatus['state'] | undefined): WhatsAppStateView {
  return WHATSAPP_STATUS_VIEW[state ?? 'error'] ?? WHATSAPP_STATUS_VIEW.error;
}

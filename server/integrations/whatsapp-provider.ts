export type WhatsAppProvider = 'baileys' | 'evolution';

export function activeWhatsAppProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() === 'evolution' ? 'evolution' : 'baileys';
}

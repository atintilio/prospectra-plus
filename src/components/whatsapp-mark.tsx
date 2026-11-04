// Marca oficial do WhatsApp.
//
// Vetor oficial da marca: o glifo do telefone dentro do balão do WhatsApp.
// Não redesenhar o desenho e não trocar a cor — o traçado abaixo é o caminho
// publicado pela própria marca (o mesmo que os conjuntos oficiais de ícones
// Simple Icons e Font Awesome Brands distribuem), em viewBox 24x24.
//
// Regra de uso: exibir o símbolo como ele é, na cor oficial #25D366, para que a
// origem da mensagem (o WhatsApp) fique visível na interface.

/** Cor oficial da marca WhatsApp. */
export const WHATSAPP_BRAND_COLOR = '#25D366';

import { WHATSAPP_GLYPH } from '@/components/whatsapp-glyph';

/**
 * Símbolo do WhatsApp: o glifo oficial do telefone dentro do balão, em #25D366.
 * Use `size` em pixels e `className` para alinhar na interface.
 */
export function WhatsAppMark({
  className,
  size = 20,
  title = 'WhatsApp',
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}
    >
      <path fill={WHATSAPP_BRAND_COLOR} d={WHATSAPP_GLYPH} />
    </svg>
  );
}

export default WhatsAppMark;

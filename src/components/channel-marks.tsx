// Marcas dos canais usados nos blocos do construtor de fluxos.
//
// Regra de marca (docs/guia/04-marca-linkedin.md): o símbolo é exibido como a
// marca o publica — LinkedIn em #0A66C2, WhatsApp em #25D366. O e-mail não tem
// marca externa: usa um envelope pintado em âmbar, cor que não colide com o azul
// do app (#155dfc) nem com o verde do WhatsApp.
//
// Todo bloco é um **selo quadrado com o glifo branco** — é o que dá a leitura
// visual imediata de "isto é LinkedIn / isto é WhatsApp / isto é e-mail".

import { LINKEDIN_BRAND_COLOR } from '@/components/linkedin-mark';
import { WHATSAPP_GLYPH } from '@/components/whatsapp-glyph';
import { WHATSAPP_BRAND_COLOR } from '@/components/whatsapp-mark';

/** Âmbar do e-mail: distinto do azul do app e do verde do WhatsApp. */
export const EMAIL_BRAND_COLOR = '#D97706';

/** Canais com selo próprio. */
export type CanalMarca = 'linkedin' | 'whatsapp' | 'email';

export const CANAL_MARCA: Record<CanalMarca, { rotulo: string; cor: string }> = {
  linkedin: { rotulo: 'LinkedIn', cor: LINKEDIN_BRAND_COLOR },
  whatsapp: { rotulo: 'WhatsApp', cor: WHATSAPP_BRAND_COLOR },
  email: { rotulo: 'E-mail', cor: EMAIL_BRAND_COLOR },
};

/** Glifo do telefone (parte interna do glifo oficial do WhatsApp). */
const WHATSAPP_PHONE =
  'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347';

/** Envelope pintado (corpo cheio + aba em negativo). */
const ENVELOPE = 'M2.6 7.4A2.9 2.9 0 0 1 5.5 4.5h13a2.9 2.9 0 0 1 2.9 2.9v9.2a2.9 2.9 0 0 1-2.9 2.9h-13a2.9 2.9 0 0 1-2.9-2.9V7.4Z';

/**
 * Selo do LinkedIn: o quadrado azul oficial com o "in" branco.
 * (Mesma construção do logotipo publicado pela marca.)
 */
function LinkedInTile({ size, title, decorative }: { size: number; title?: string; decorative?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      <rect width="24" height="24" rx="4" fill={LINKEDIN_BRAND_COLOR} />
      <path
        fill="#FFFFFF"
        d="M5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286z"
      />
    </svg>
  );
}

/**
 * Selo do WhatsApp: quadrado verde oficial com o balão branco e o telefone
 * na cor do fundo — a mesma construção do ícone do aplicativo do WhatsApp.
 */
function WhatsAppTile({ size, title, decorative }: { size: number; title?: string; decorative?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      <rect width="24" height="24" rx="4" fill={WHATSAPP_BRAND_COLOR} />
      <path fill="#FFFFFF" d={WHATSAPP_GLYPH} />
      <path fill={WHATSAPP_BRAND_COLOR} d={WHATSAPP_PHONE} />
    </svg>
  );
}

/** Selo do e-mail: envelope pintado em âmbar com o glifo branco. */
function EmailTile({ size, title, decorative }: { size: number; title?: string; decorative?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      <rect width="24" height="24" rx="4" fill={EMAIL_BRAND_COLOR} />
      <path fill="#FFFFFF" d={ENVELOPE} />
      <path fill={EMAIL_BRAND_COLOR} d="M3.4 7.9 12 14l8.6-6.1v-.7L12 13.4 3.4 7.2v.7Z" />
    </svg>
  );
}

/**
 * Selo do canal. `size` em pixels.
 */
export function ChannelMark({
  channel,
  size = 20,
  title,
  decorative = false,
}: {
  channel: CanalMarca;
  size?: number;
  title?: string;
  decorative?: boolean;
}) {
  const rotulo = title ?? CANAL_MARCA[channel].rotulo;
  if (channel === 'linkedin') return <LinkedInTile size={size} title={rotulo} decorative={decorative} />;
  if (channel === 'whatsapp') return <WhatsAppTile size={size} title={rotulo} decorative={decorative} />;
  return <EmailTile size={size} title={rotulo} decorative={decorative} />;
}

/**
 * Punho de arraste: seis pontos em duas colunas (desenhado aqui, sem ícone de
 * biblioteca) — é o afordance que diz "este bloco se move".
 */
export function DragHandleMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      <g fill="currentColor">
        <circle cx="9" cy="6" r="1.9" />
        <circle cx="15" cy="6" r="1.9" />
        <circle cx="9" cy="12" r="1.9" />
        <circle cx="15" cy="12" r="1.9" />
        <circle cx="9" cy="18" r="1.9" />
        <circle cx="15" cy="18" r="1.9" />
      </g>
    </svg>
  );
}

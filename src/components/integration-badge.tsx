import type { ReactNode } from 'react';

/**
 * Selo reutilizável das integrações (WhatsApp, LinkedIn, e-mail, …).
 *
 * Mostra o símbolo da marca + o nome da integração + o estado atual, com o tom
 * já existente no design (`success-soft`, `warning-soft` e `surface`), sem
 * precisar de estilo novo no CSS global.
 */

/** Estado visual do selo. */
export type IntegrationState = 'ok' | 'alerta' | 'neutro';

/** Classe de tom de cada estado (classes já existentes no design). */
export const INTEGRATION_TONE_CLASS: Record<IntegrationState, string> = {
  ok: 'bg-success-soft text-success',
  alerta: 'bg-warning-soft text-warning',
  neutro: 'bg-surface text-muted',
};

/** Rótulo padrão do estado, quando a tela não informa um texto próprio. */
export const INTEGRATION_STATE_LABEL: Record<IntegrationState, string> = {
  ok: 'Ativo',
  alerta: 'Atenção',
  neutro: 'Inativo',
};

export function IntegrationBadge({
  name,
  symbol,
  state = 'neutro',
  status,
  className = '',
}: {
  /** Nome da integração, por exemplo "WhatsApp". */
  name: string;
  /** Símbolo da marca (por exemplo `<WhatsAppMark size={16} />`). */
  symbol?: ReactNode;
  /** Estado da integração. */
  state?: IntegrationState;
  /** Texto do estado; sem ele usa o rótulo padrão do estado. */
  status?: string;
  className?: string;
}) {
  const label = status ?? INTEGRATION_STATE_LABEL[state];
  return (
    <span
      className={`pill ${INTEGRATION_TONE_CLASS[state]} ${className}`.trim()}
      data-integration={name}
      data-state={state}
    >
      {symbol ? (
        <span aria-hidden="true" className="inline-flex items-center">
          {symbol}
        </span>
      ) : null}
      <span className="font-medium">{name}</span>
      {label ? <span>· {label}</span> : null}
    </span>
  );
}

export default IntegrationBadge;

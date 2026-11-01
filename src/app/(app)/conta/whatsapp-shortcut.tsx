'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { WhatsAppMark } from '@/components/whatsapp-mark';
import { IntegrationBadge } from '@/components/integration-badge';
import { describeWhatsAppStatus, type WhatsAppStateView } from '../whatsapp/status';
import { whatsappAction } from '../whatsapp/actions';

/** Enquanto o estado real não chega, o selo não afirma nada sobre a conexão. */
const PENDENTE: WhatsAppStateView = { label: 'Ver estado', tone: 'neutro', hint: '' };

/**
 * Atalho da integração do WhatsApp: símbolo oficial da marca + selo com o estado
 * real (a mesma fonte da tela /whatsapp), sem layout novo.
 */
export function WhatsAppShortcut() {
  const [view, setView] = useState<WhatsAppStateView>(PENDENTE);

  useEffect(() => {
    let alive = true;
    whatsappAction('status')
      .then((result) => {
        if (alive) setView(describeWhatsAppStatus(result.state));
      })
      .catch(() => {
        // Sem resposta do gateway: o selo continua neutro e a tela /whatsapp
        // mostra o detalhe do estado.
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Link href="/whatsapp" className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 hover:border-accent/40">
      <WhatsAppMark size={36} />
      <span className="min-w-0 flex-1">
        <IntegrationBadge name="WhatsApp" state={view.tone} status={view.label} />
        <span className="mt-2 block text-xs text-muted">Conecte o seu número e envie mensagens pela sua conta.</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}

export default WhatsAppShortcut;

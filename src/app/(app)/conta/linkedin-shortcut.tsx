'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LinkedInMark } from '@/components/linkedin-mark';
import { normalizeLinkedInConnection, type LinkedInConnection } from '../linkedin/status';

const API_URL = '/api/integrations/linkedin/connect';

/**
 * Texto do atalho conforme o estado real da conta.
 *
 * Sem conta conectada o atalho oferece a ação ("Conectar conta"); com a conta
 * vinculada mostra quem está conectado (mesma informação da tela /linkedin).
 */
export function linkedInShortcutSummary(connection: LinkedInConnection): string {
  const name = connection.profile?.name?.trim();
  if (connection.status === 'authenticated') {
    return name
      ? `Conta conectada — ${name}. O piloto automático escreve com a sua identidade.`
      : 'Conta conectada. O piloto automático escreve com a sua identidade.';
  }
  return 'Conectar conta para o piloto automático escrever com a sua identidade.';
}

/** Atalho de integração: símbolo da marca + estado da conta. */
export function LinkedInShortcutBody({ connection }: { connection: LinkedInConnection }) {
  return (
    <Link href="/linkedin" className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 hover:border-accent/40">
      <LinkedInMark size={36} decorative />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">LinkedIn</span>
        <span className="block text-xs text-muted">{linkedInShortcutSummary(connection)}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}

/**
 * Atalho que consulta o estado real da conta — a mesma fonte da tela /linkedin
 * (`/api/integrations/linkedin/connect`), então a demo e a operação real
 * mostram sempre a mesma situação.
 */
export function LinkedInShortcut() {
  const [connection, setConnection] = useState<LinkedInConnection>({ status: 'disconnected' });

  useEffect(() => {
    let alive = true;
    fetch(API_URL, { credentials: 'include', headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (alive) setConnection(normalizeLinkedInConnection(data));
      })
      .catch(() => {
        // Sem resposta: o atalho segue oferecendo "Conectar conta" (a tela
        // /linkedin mostra o estado detalhado).
      });
    return () => {
      alive = false;
    };
  }, []);

  return <LinkedInShortcutBody connection={connection} />;
}

export default LinkedInShortcut;

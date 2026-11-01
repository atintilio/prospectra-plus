'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, LoaderCircle, RefreshCw, ShieldCheck, Unlink } from 'lucide-react';
import { LinkedInMark } from '@/components/linkedin-mark';
import {
  describeLinkedInStatus,
  formatLinkedInDate,
  LINKEDIN_CONFIG_ITEMS,
  LINKEDIN_TONE_CLASS,
  normalizeLinkedInConnection,
  type LinkedInConnection,
} from './status';

const API_URL = '/api/integrations/linkedin/connect';
const START_URL = '/api/integrations/linkedin/start';
const OIDC_MESSAGE = 'prospectra-linkedin-oidc';

type Notice = { tone: 'ok' | 'warn' | 'error'; text: string };

const NOTICE_CLASS: Record<Notice['tone'], string> = {
  ok: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  error: 'bg-red-50 text-danger',
};

/**
 * Cartão de integração do LinkedIn (RF1 do PRD).
 *
 * O navegador abre o popup do LinkedIn em /api/integrations/linkedin/start e o
 * callback responde com `postMessage({ type: 'prospectra-linkedin-oidc' })`.
 * Se o popup for bloqueado, a pessoa abre a mesma rota na aba atual.
 */
export function LinkedInView({ demo = false }: { demo?: boolean }) {
  const [connection, setConnection] = useState<LinkedInConnection>({ status: 'disconnected' });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const popup = useRef<Window | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API_URL, { credentials: 'include', headers: { accept: 'application/json' } });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error('http');
      setConnection(normalizeLinkedInConnection(data));
    } catch {
      setConnection({ status: 'unavailable' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; result?: string } | null;
      if (!data || data.type !== OIDC_MESSAGE) return;
      popup.current = null;
      setConnecting(false);
      setBlocked(false);
      setNotice(
        data.result === 'connected'
          ? { tone: 'ok', text: 'Conta LinkedIn conectada a este usuário.' }
          : data.result === 'cancelled'
            ? { tone: 'warn', text: 'A autorização foi cancelada no LinkedIn. Nada foi alterado.' }
            : { tone: 'error', text: 'Não foi possível concluir a conexão. Tente de novo.' },
      );
      void refresh();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);

  useEffect(() => {
    if (!connecting) return;
    const timer = window.setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
        setConnecting(false);
        void refresh();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connecting, refresh]);

  const begin = () => {
    setNotice(undefined);
    setBlocked(false);
    const opened = window.open(START_URL, 'prospectra-linkedin', 'popup=yes,width=600,height=720');
    if (!opened) {
      setBlocked(true);
      setNotice({ tone: 'warn', text: 'O navegador bloqueou a janela do LinkedIn. Use o link "Abrir na mesma aba".' });
      return;
    }
    popup.current = opened;
    setConnecting(true);
    opened.focus();
  };

  const disconnect = async () => {
    setPending(true);
    try {
      const response = await fetch(API_URL, { method: 'DELETE', credentials: 'include', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('http');
      setConnection(normalizeLinkedInConnection(await response.json().catch(() => null)));
      setNotice({ tone: 'ok', text: 'Vínculo removido. O Prospectra não usa mais esta conta.' });
    } catch {
      setNotice({ tone: 'error', text: 'Não foi possível desconectar agora. Tente de novo.' });
    } finally {
      setPending(false);
    }
  };

  const view = describeLinkedInStatus(connection.status);
  const profile = connection.profile;
  const missing = connection.missing?.length ? connection.missing : LINKEDIN_CONFIG_ITEMS;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card p-5" aria-labelledby="linkedin-conta">
        <header className="flex flex-wrap items-center gap-3">
          <LinkedInMark size={40} />
          <div className="min-w-0">
            <h2 id="linkedin-conta" className="text-base font-semibold">Conta LinkedIn</h2>
            <p className="text-sm text-muted">Cada pessoa conecta a própria conta: o Prospectra escreve como você.</p>
          </div>
          <span className={`pill ml-auto ${LINKEDIN_TONE_CLASS[view.tone]}`} role="status">
            {loading ? 'Consultando…' : view.label}
          </span>
        </header>

        {demo && (
          <p className="mt-4 rounded-xl bg-violet-soft px-4 py-3 text-sm text-violet">
            Ambiente de demonstração: o estado abaixo é simulado e nenhuma conta real é conectada.
          </p>
        )}

        {view.status === 'authenticated' && !loading && (
          <>
            <div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-4">
              <p className="font-medium">{profile?.name || 'Conta conectada'}</p>
              {profile?.email && <p className="mt-0.5 text-sm text-muted">{profile.email}</p>}
              {profile?.connectedAt && (
                <p className="mt-0.5 text-xs text-muted">Conectada em {formatLinkedInDate(profile.connectedAt)}</p>
              )}
            </div>
            <p className="mt-3 text-sm text-muted">{view.hint}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-outline" onClick={begin} disabled={demo || pending || connecting}>
                {connecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {connecting ? 'Aguardando o LinkedIn…' : 'Trocar conta'}
              </button>
              <button className="btn-danger" onClick={() => void disconnect()} disabled={demo || pending || connecting}>
                <Unlink className="h-4 w-4" /> Desconectar
              </button>
              <button className="btn-ghost" onClick={() => void refresh()} disabled={pending}>
                <RefreshCw className="h-4 w-4" /> Atualizar
              </button>
            </div>
          </>
        )}

        {view.status === 'disconnected' && !loading && (
          <>
            <p className="mt-4 text-sm text-muted">{view.hint}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={begin} disabled={demo || pending || connecting}>
                {connecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {connecting ? 'Aguardando o LinkedIn…' : 'Conectar conta'}
              </button>
              <button className="btn-outline" onClick={() => void refresh()} disabled={pending}>
                <RefreshCw className="h-4 w-4" /> Atualizar status
              </button>
            </div>
          </>
        )}

        {view.status === 'configuration_required' && !loading && (
          <>
            <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
              {connection.message || view.hint}
            </p>
            <p className="mt-3 text-sm font-medium">O que falta nesta instalação</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {missing.map((item) => <li key={item}><code>{item}</code></li>)}
            </ul>
            <p className="mt-3 text-xs text-muted">
              São variáveis do servidor do Prospectra: o administrador da operação libera o aplicativo do LinkedIn.
              Enquanto isso, o resto do produto continua funcionando normalmente.
            </p>
          </>
        )}

        {view.status === 'unavailable' && !loading && (
          <>
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">
              {connection.message || view.hint}
            </p>
            <button className="btn-outline mt-3" onClick={() => void refresh()} disabled={pending}>
              <RefreshCw className="h-4 w-4" /> Tentar de novo
            </button>
          </>
        )}

        {loading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Consultando a conexão desta conta…
          </p>
        )}

        {notice && (
          <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${NOTICE_CLASS[notice.tone]}`}>
            {notice.text}
          </p>
        )}

        {!demo && (
          <p className="mt-5 border-t border-border pt-4 text-xs text-muted">
            O navegador pode bloquear a janela do LinkedIn.{' '}
            <a href={START_URL} className={`underline underline-offset-2 hover:text-text ${blocked ? 'font-semibold text-text' : ''}`}>
              Abrir na mesma aba <ExternalLink className="inline h-3 w-3" aria-hidden="true" />
            </a>
          </p>
        )}
      </section>

      <aside className="card space-y-4 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-[18px] w-[18px] text-accent" aria-hidden="true" />
          <h2 className="text-base font-semibold">Como funciona</h2>
        </div>
        <ol className="space-y-3 text-sm text-muted">
          <li><span className="font-medium text-text">1. Você autoriza.</span> A senha e a verificação em dois fatores são informadas só ao LinkedIn — nunca passam pelo Prospectra.</li>
          <li><span className="font-medium text-text">2. A operação libera o piloto.</span> O administrador da operação liga o piloto automático; ninguém é acionado sem isso.</li>
          <li><span className="font-medium text-text">3. Você revisa.</span> Convites e mensagens respeitam os seus limites diários de convites e mensagens.</li>
        </ol>
        <p className="rounded-xl bg-surface px-3 py-2 text-xs text-muted">
          O token da conta fica no servidor do Prospectra. A tela só mostra o que já está vinculado a você.
        </p>
        <p className="text-xs text-muted">
          A automação segue os termos de uso do LinkedIn e a cadência é assistida:{' '}
          <a href="https://www.linkedin.com/legal/user-agreement" target="_blank" rel="noreferrer noopener" className="underline underline-offset-2 hover:text-text">
            contrato do LinkedIn
          </a>
          .
        </p>
      </aside>
    </div>
  );
}

export default LinkedInView;

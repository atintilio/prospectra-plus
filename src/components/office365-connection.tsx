'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Connection = { status: 'connected' | 'disconnected' | 'configuration_required' | 'unavailable'; email?: string; name?: string; connectedAt?: string };
const API = '/api/integrations/office365/connect';

export function Office365Connection() {
  const [connection, setConnection] = useState<Connection>({ status: 'unavailable' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const popupTimer = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API, { credentials: 'include' });
      if (!response.ok) throw new Error('status');
      setConnection(await response.json() as Connection);
    } catch { setConnection({ status: 'unavailable' }); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => () => { if (popupTimer.current !== null) window.clearInterval(popupTimer.current); }, []);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.type !== 'prospectra-office365') return;
      if (popupTimer.current !== null) window.clearInterval(popupTimer.current);
      popupTimer.current = null;
      setBusy(false);
      setNotice(event.data.result === 'connected' ? 'Conta conectada com sucesso.' : event.data.result === 'cancelled' ? 'Autorização cancelada.' : 'Não foi possível conectar. Tente novamente.');
      void refresh();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refresh]);
  const begin = () => {
    setNotice('');
    const popup = window.open('/api/integrations/office365/start', 'prospectra-office365', 'popup=yes,width=600,height=720');
    if (!popup) { location.href = '/api/integrations/office365/start'; return; }
    setBusy(true);
    popup.focus();
    if (popupTimer.current !== null) window.clearInterval(popupTimer.current);
    popupTimer.current = window.setInterval(() => { if (popup.closed) { if (popupTimer.current !== null) window.clearInterval(popupTimer.current); popupTimer.current = null; setBusy(false); void refresh(); } }, 1000);
  };
  const remove = async () => {
    setBusy(true);
    try {
      const response = await fetch(API, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('disconnect');
      setConnection({ status: 'disconnected' });
      setNotice('Conta desvinculada. O Prospectra não enviará campanhas por ela.');
    } catch { setNotice('Não foi possível desvincular a conta.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-border bg-surface p-5" aria-label="Conexão Office 365">
    <h3 className="font-semibold">Office 365</h3>
    <p className="mt-1 text-sm text-muted">Conecte seu e-mail para enviar etapas de campanha pela sua própria conta.</p>
    {connection.status === 'connected' ? <p className="mt-3 text-sm" role="status">Conectado: <strong>{connection.name || connection.email}</strong>{connection.name ? ` · ${connection.email}` : ''}</p> : null}
    {connection.status === 'configuration_required' ? <p className="mt-3 text-sm text-warning" role="status">A conexão precisa ser configurada pelo administrador.</p> : null}
    {connection.status === 'unavailable' ? <p className="mt-3 text-sm text-warning" role="status">Não foi possível consultar a conexão agora.</p> : null}
    {notice ? <p className="mt-3 text-sm" role="status">{notice}</p> : null}
    <div className="mt-4 flex gap-2">
      {connection.status === 'connected'
        ? <button type="button" className="btn-outline" disabled={busy} onClick={() => void remove()}>{busy ? 'Desvinculando…' : 'Desvincular conta'}</button>
        : <button type="button" className="btn-primary" disabled={busy || connection.status === 'configuration_required'} onClick={begin}>{busy ? 'Aguardando Microsoft…' : 'Conectar minha conta'}</button>}
    </div>
  </section>;
}

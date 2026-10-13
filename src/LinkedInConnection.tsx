import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, LoaderCircle, RefreshCw, Unlink } from 'lucide-react';
import { apiFetch } from './apiFetch';

type Connection = {
  status: 'disconnected' | 'authenticated' | 'configuration_required' | 'unavailable';
  profile?: { name: string; email?: string; connectedAt: string };
};

const labels: Record<Connection['status'], string> = {
  disconnected: 'Não conectado',
  authenticated: 'Conta vinculada',
  configuration_required: 'Configuração pendente',
  unavailable: 'Indisponível',
};

export default function LinkedInConnection({ demo }: { demo: boolean }) {
  const [connection, setConnection] = useState<Connection>({ status: 'disconnected' });
  const [pending, setPending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');
  const popup = useRef<Window | null>(null);

  const request = useCallback(async (method: 'GET' | 'DELETE') => {
    setPending(true);
    try {
      const response = await apiFetch('/api/integrations/linkedin/connect', { method, credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('unavailable');
      setConnection(data as Connection);
      return data as Connection;
    } catch {
      setConnection({ status: 'unavailable' });
      setMessage('Não foi possível consultar a conexão LinkedIn agora.');
      return null;
    } finally { setPending(false); }
  }, []);

  useEffect(() => { if (!demo) void request('GET'); }, [demo, request]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup.current || event.data?.type !== 'prospectra-linkedin-oidc') return;
      setConnecting(false);
      setMessage(event.data.result === 'connected' ? 'Conta LinkedIn vinculada a este usuário.' : event.data.result === 'cancelled' ? 'Autorização cancelada.' : 'Não foi possível concluir a conexão. Tente novamente.');
      void request('GET');
      popup.current = null;
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [request]);
  useEffect(() => {
    if (!connecting) return;
    const timer = window.setInterval(() => {
      if (popup.current?.closed) {
        popup.current = null;
        setConnecting(false);
        void request('GET');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connecting, request]);

  const begin = () => {
    setMessage('');
    const opened = window.open('/api/integrations/linkedin/start', 'prospectra-linkedin', 'popup=yes,width=600,height=720');
    if (!opened) {
      setMessage('O navegador bloqueou a janela. Use o link “Abrir conexão na mesma aba”.');
      return;
    }
    popup.current = opened;
    setConnecting(true);
    opened.focus();
  };

  const disconnect = async () => {
    const result = await request('DELETE');
    if (result?.status === 'disconnected') setMessage('Vínculo LinkedIn removido deste usuário.');
  };

  return <section className="panel linkedin-connect-panel" aria-labelledby="linkedin-connect-title">
    <div className="linkedin-connect-heading"><span className="linkedin-connect-logo" aria-hidden="true">in</span><div><p className="eyebrow">INTEGRAÇÕES · SUA CONTA</p><h2 id="linkedin-connect-title">Conectar LinkedIn</h2><p>Autorize sua própria conta em uma janela do LinkedIn. A confirmação volta automaticamente para cá.</p></div><span role="status" className={`status-tag ${connection.status === 'authenticated' ? 'good' : 'neutral'}`}>{demo ? 'Demonstração' : labels[connection.status]}</span></div>
    <div className="linkedin-connect-actions">
      <button className="linkedin-connect-button" disabled={demo || pending || connecting || connection.status === 'configuration_required'} onClick={begin}>{connecting ? <LoaderCircle className="spin" size={20}/> : <Link2 size={20}/>} {connecting ? 'Aguardando autorização' : connection.status === 'authenticated' ? 'Trocar conta LinkedIn' : 'Conectar LinkedIn'}</button>
      <button className="outline-button" disabled={demo || pending} onClick={() => void request('GET')}><RefreshCw size={16}/> Atualizar status</button>
      {connection.status === 'authenticated' && <button className="outline-button" disabled={pending || connecting} onClick={() => void disconnect()}><Unlink size={16}/> Desconectar</button>}
    </div>
    {demo ? <p>Conexões pessoais ficam disponíveis em sua conta de produção.</p> : <p className="linkedin-connect-help">Cada usuário conecta a própria conta. Sua senha e verificação de dois fatores são informadas somente ao LinkedIn. A conexão confirma a identidade; mensagens e convites continuam assistidos.</p>}
    {connection.profile && <p role="status"><strong>{connection.profile.name}</strong>{connection.profile.email ? ` · ${connection.profile.email}` : ''} · vinculada em {new Date(connection.profile.connectedAt).toLocaleString('pt-BR')}</p>}
    {connection.status === 'configuration_required' && <p role="alert">O administrador precisa habilitar o aplicativo LinkedIn do Prospectra antes da primeira conexão.</p>}
    {message && <p role="alert">{message}</p>}
    {!demo && connection.status !== 'configuration_required' && <a className="text-button" href="/api/integrations/linkedin/start">Abrir conexão na mesma aba <ExternalLink size={15}/></a>}
  </section>;
}

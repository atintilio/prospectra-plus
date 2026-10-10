import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Link2, LoaderCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from './apiFetch';
type Connection = { status: string; viewerUrl?: string; expiresAt?: string };
const labels: Record<string, string> = { disconnected: 'Não conectado', starting: 'Preparando navegador', awaiting_login: 'Aguardando seu login', authenticated: 'Login concluído', expired: 'Tentativa expirada', failed: 'Não foi possível concluir', busy: 'Servidor ocupado', unavailable: 'Conexão indisponível' };
export default function LinkedInConnection({ demo }: { demo: boolean }) {
  const [connection, setConnection] = useState<Connection>({ status: 'disconnected' });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const request = useCallback(async (method: 'GET' | 'POST' | 'DELETE') => {
    setPending(true); setMessage('');
    try {
      const response = await apiFetch('/api/integrations/linkedin/connect', { method, credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error('unavailable');
      setConnection(data);
    } catch { setConnection({ status: 'unavailable' }); setMessage('O serviço de conexão não respondeu. Tente atualizar o status em alguns instantes.'); }
    finally { setPending(false); }
  }, []);
  useEffect(() => { if (!demo) void request('GET'); }, [demo, request]);
  useEffect(() => {
    if (!['starting','awaiting_login'].includes(connection.status)) return;
    const timer = window.setInterval(() => { if (!pending) void request('GET'); }, 5000);
    return () => window.clearInterval(timer);
  }, [connection.status, pending, request]);
  const active = ['starting','awaiting_login'].includes(connection.status);
  return <section className="panel linkedin-connect-panel" aria-labelledby="linkedin-connect-title">
    <div className="linkedin-connect-heading"><span className="linkedin-connect-logo" aria-hidden="true">in</span><div><p className="eyebrow">INTEGRAÇÕES · SUA CONTA</p><h2 id="linkedin-connect-title">Conectar LinkedIn</h2><p>Entre na sua conta pelo navegador seguro exibido nesta página.</p></div><span role="status" className={`status-tag ${connection.status === 'authenticated' ? 'good' : 'neutral'}`}>{demo ? 'Demonstração' : labels[connection.status] || 'Verificando'}</span></div>
    <div className="linkedin-connect-actions"><button className="linkedin-connect-button" disabled={demo || pending || active} onClick={() => void request('POST')}>{pending || connection.status === 'starting' ? <LoaderCircle className="spin" size={20}/> : <Link2 size={20}/>} {active ? 'Conexão em andamento' : connection.status === 'authenticated' ? 'Reconectar LinkedIn' : 'Conectar LinkedIn'}</button><button className="outline-button" disabled={demo || pending} onClick={() => void request('GET')}><RefreshCw size={16}/> Atualizar status</button>{active && <button className="text-button" disabled={pending} onClick={() => void request('DELETE')}>Cancelar tentativa</button>}</div>
    {demo ? <p>Conexões pessoais ficam disponíveis em sua conta de produção.</p> : <p className="linkedin-connect-help">1. Conecte • 2. Faça login e confirme a verificação do LinkedIn • 3. Aguarde a confirmação nesta página.</p>}
    {message && <p role="alert">{message}</p>}
    {connection.status === 'starting' && <p role="status">Preparando sua sessão. Em uma VM com poucos recursos, esta etapa pode demorar. Você pode cancelar a tentativa.</p>}
    {connection.status === 'busy' && <p role="alert">Há outra autenticação em andamento. Aguarde sua conclusão e tente novamente.</p>}
    {connection.status === 'expired' && <p role="alert">O tempo para entrar terminou. Use “Tentar pareamento remoto” para iniciar outra tentativa.</p>}
    {connection.status === 'failed' && <p role="alert">O navegador encerrou antes de confirmar seu login. Tente novamente.</p>}
    {connection.status === 'authenticated' && <p role="status">Sessão salva para seu usuário. A autenticação não confirma, por si só, o funcionamento de envios ou campanhas.</p>}
    {connection.viewerUrl && <div className="linkedin-viewer"><a className="text-button" href={connection.viewerUrl} target="_blank" rel="noopener noreferrer">Ampliar tela de login <ExternalLink size={15}/></a><iframe title="Entrar no LinkedIn" src={connection.viewerUrl} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms" /></div>}
  </section>;
}

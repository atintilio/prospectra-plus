import { apiFetch } from './apiFetch';
import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, MessageSquareText, QrCode, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';

type EvolutionPanelProps = { onToast?: (message: string) => void };
type Instance = { instance?: string; name?: string; status?: string; connectionStatus?: string; ownerJid?: string };

function statusText(instance?: Instance) {
  const value = String(instance?.status ?? instance?.connectionStatus ?? '').toLowerCase();
  return value === 'open' || value === 'connected' ? 'Conectado' : value ? value : 'Ainda não conectado';
}

function extractQr(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const candidate of [record.base64, record.qrcode, record.qr, record.qrCode]) if (typeof candidate === 'string' && candidate.length > 30) return candidate.startsWith('data:') ? candidate : `data:image/png;base64,${candidate}`;
  if (record.result) return extractQr(record.result);
  return '';
}

export default function EvolutionPanel({ onToast }: EvolutionPanelProps) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [provider, setProvider] = useState<'baileys' | 'evolution'>('baileys');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [qr, setQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch('/api/integrations/whatsapp/instances', { credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error ?? 'evolution_unavailable'));
      setProvider(payload.provider === 'evolution' ? 'evolution' : 'baileys');
      setConfigured(Boolean(payload.configured));
      setInstances(Array.isArray(payload.instances) ? payload.instances as Instance[] : []);
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'evolution_unavailable' ? 'O gateway WhatsApp não respondeu. Verifique o serviço persistente e o token.' : 'Configure BAILEYS_GATEWAY_URL e BAILEYS_GATEWAY_TOKEN no backend antes de operar o WhatsApp.');
    } finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const createInstance = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch('/api/integrations/whatsapp/instances', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error ?? 'evolution_instance_failed'));
      setMessage('Gateway iniciado. Agora gere o QR Code.'); onToast?.('Baileys Gateway iniciado no Prospectra.'); await refresh();
    } catch (error) { setMessage(error instanceof Error && error.message === 'baileys_capacity_reached' ? 'A VM gratuita está no limite de sessões simultâneas. Aguarde uma vaga antes de conectar outra conta.' : 'Não foi possível iniciar sua sessão. Confira se o gateway está disponível.'); } finally { setBusy(false); }
  };

  const connect = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await apiFetch('/api/integrations/whatsapp/connect', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error ?? 'evolution_connect_failed'));
      let image = extractQr(payload);
      for (let attempt = 0; !image && provider === 'baileys' && attempt < 15; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const qrResponse = await apiFetch('/api/integrations/whatsapp/qr', { credentials: 'include' });
        if (!qrResponse.ok) break;
        const qrPayload = await qrResponse.json().catch(() => ({}));
        image = extractQr(qrPayload);
        if (qrPayload.connected === true) break;
      }
      if (image) setQr(image);
      setMessage(image ? 'QR Code gerado. Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo.' : 'O gateway respondeu sem QR Code. Inicie a sessão e tente novamente.');
    } catch (error) { setMessage(error instanceof Error && error.message === 'baileys_capacity_reached' ? 'A VM gratuita está no limite de sessões simultâneas.' : 'Não foi possível gerar o QR Code. Inicie sua sessão e tente novamente.'); } finally { setBusy(false); }
  };

  const current = instances[0];
  return <section className="panel evolution-panel"><div className="panel-head"><div><span className="eyebrow">WHATSAPP · {provider === 'baileys' ? 'BAILEYS GATEWAY' : 'EVOLUTION API'}</span><h2>Conectar seu WhatsApp</h2><p>Esta sessão pertence somente à sua conta Prospectra. O envio exige aprovação, evidência e opt-in.</p></div><button className="icon-button" onClick={() => void refresh()} title="Atualizar gateway"><RefreshCw size={16} className={busy ? 'spin' : ''}/></button></div><div className="evolution-flow"><div className="evolution-step"><span className="evolution-number">1</span><div><strong>Iniciar sua sessão</strong><p>Abra uma sessão isolada no gateway. Se a capacidade da VM estiver cheia, tente novamente quando houver espaço.</p><button className="outline-button" onClick={() => void createInstance()} disabled={busy || configured === false}><Smartphone size={15}/>{busy ? 'Processando…' : 'Iniciar sessão'}</button></div></div><div className="evolution-step"><span className="evolution-number">2</span><div><strong>QR Code</strong><p>No WhatsApp, abra Dispositivos conectados → Conectar dispositivo e leia este código.</p><button className="outline-button" onClick={() => void connect()} disabled={busy || configured !== true}><QrCode size={15}/> Gerar QR Code</button>{qr && <img className="evolution-qr" src={qr} alt="QR Code para conectar o WhatsApp"/>}</div></div><div className="evolution-step"><span className="evolution-number">3</span><div><strong>Estado da conexão</strong><p>Atualize o estado após ler o QR Code. Cada usuário vê apenas sua própria sessão.</p><div className={`evolution-status ${current && statusText(current) === 'Conectado' ? 'good' : ''}`}><span></span>{current ? statusText(current) : configured === false ? 'Gateway indisponível' : 'Atualize para consultar'}</div></div></div></div>{message && <div className="evolution-message"><CheckCircle2 size={15}/><span>{message}</span></div>}<div className="evolution-safety"><ShieldCheck size={16}/><span>Somente texto aprovado, opt-in, número válido, evidência e conta ativa entram no envio. O token do gateway fica no servidor.</span><MessageSquareText size={16}/></div></section>;
}

import { type ReactNode, useEffect, useMemo, useState } from 'react';

const MASTER_EMAIL = 'atintilio@argusprime.com.br';
type Mode = 'login' | 'request' | 'set';
type GateStatus = 'loading' | 'authenticated' | 'logged-out' | 'setup-required';

function initialMode(): Mode {
  if (window.location.pathname === '/definir-senha') return 'set';
  if (window.location.pathname === '/recuperar-senha') return 'request';
  return 'login';
}

async function callApi(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [status, setStatus] = useState<GateStatus>('loading');
  const [email, setEmail] = useState(MASTER_EMAIL);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') ?? '', []);

  useEffect(() => {
    if (mode !== 'login') { setStatus('logged-out'); return; }
    callApi('/api/auth/me').then(({ response, data }) => {
      if (response.ok) setStatus('authenticated');
      else if (response.status === 404 || response.status === 503 || data.error === 'auth_not_configured') setStatus('setup-required');
      else setStatus('logged-out');
    }).catch(() => setStatus('setup-required'));
  }, [mode]);

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    const { response } = await callApi('/api/auth/login', { email, password });
    if (response.ok) { setStatus('authenticated'); setPassword(''); return; }
    setError(response.status === 503 ? 'A autenticação ainda não foi configurada no deployment.' : 'E-mail ou senha inválidos.');
  };

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    const { response, data } = await callApi('/api/auth/request-password', { email });
    if (response.ok) setMessage('Se o endereço estiver autorizado, enviaremos um link válido por 15 minutos.');
    else setError(data.error === 'email_not_configured' ? 'O provedor de e-mail ainda não foi configurado no deployment.' : 'Não foi possível solicitar o link agora.');
  };

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (!token) { setError('O link de criação de senha está incompleto.'); return; }
    if (password !== confirmation) { setError('As senhas não conferem.'); return; }
    const { response, data } = await callApi('/api/auth/set-password', { token, password });
    if (response.ok) { window.location.href = '/'; return; }
    setError(data.error === 'invalid_or_expired_token' ? 'Este link expirou ou já foi utilizado.' : data.error ?? 'Não foi possível salvar a senha.');
  };

  if (status === 'authenticated') return <>{children}</>;
  if (status === 'loading') return <AuthLoading />;
  if (status === 'setup-required' && mode === 'login') return <AuthSetup />;
  if (mode === 'set') return <AuthCard eyebrow="ACESSO MASTER" title="Crie sua senha" detail="Use uma senha exclusiva para o Prospectra+. O link é de uso único e expira em 15 minutos." message={message} error={error}><form onSubmit={submitPassword}><label>Nova senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} autoComplete="new-password" required /></label><label>Confirmar senha<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} autoComplete="new-password" required /></label><small className="auth-hint">Mínimo de 12 caracteres, com maiúscula, minúscula e número.</small><button className="auth-button" type="submit">Salvar senha e entrar</button></form></AuthCard>;
  if (mode === 'request') return <AuthCard eyebrow="RECUPERAÇÃO SEGURA" title="Receba um novo link" detail="Informe o e-mail autorizado. Por segurança, a resposta não revela se o endereço existe." message={message} error={error}><form onSubmit={submitRequest}><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><button className="auth-button" type="submit">Enviar link de recuperação</button><button className="auth-link" type="button" onClick={() => { setMode('login'); setMessage(''); setError(''); }}>Voltar ao login</button></form></AuthCard>;
  return <AuthCard eyebrow="PROSPECTRA+ · ARGUS PRIME" title="Acesse sua operação" detail="Entre com o usuário master do Prospectra+ para continuar." message={message} error={error}><form onSubmit={submitLogin}><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button className="auth-button" type="submit">Entrar</button><button className="auth-link" type="button" onClick={() => { setMode('request'); setMessage(''); setError(''); }}>Esqueci minha senha</button></form></AuthCard>;
}

function AuthCard({ eyebrow, title, detail, message = '', error = '', children }: { eyebrow: string; title: string; detail: string; message?: string; error?: string; children: ReactNode }) {
  return <main className="auth-shell"><div className="auth-panel"><div className="auth-brand"><img src="/prospectra-logo.svg" alt="Prospectra+" /><strong>prospectra<span>+</span></strong></div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="auth-detail">{detail}</p>{message && <div className="auth-message">{message}</div>}{error && <div className="auth-error">{error}</div>}{children}<p className="auth-footer">Argus Prime · acesso protegido · dados e credenciais ficam no servidor.</p></div></main>;
}

function AuthLoading() { return <main className="auth-shell"><div className="auth-panel auth-loading"><img src="/prospectra-logo.svg" alt="Prospectra+" /><span>Verificando sessão segura…</span></div></main>; }
function AuthSetup() { return <AuthCard eyebrow="CONFIGURAÇÃO NECESSÁRIA" title="A autenticação ainda não está pronta" detail="O deployment precisa receber o banco, a chave de sessão e o provedor de e-mail antes de liberar o acesso. Nenhum bypass de desenvolvimento é usado."><div className="auth-setup-list"><strong>Próximas configurações</strong><span>DATABASE_URL · AUTH_SECRET · PUBLIC_APP_URL</span><span>EMAIL_API_KEY · EMAIL_FROM</span></div><a className="auth-link" href="/recuperar-senha">Testar solicitação de recuperação</a></AuthCard>; }

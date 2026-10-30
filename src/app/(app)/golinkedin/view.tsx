'use client';

import { CheckCircle2, Link2, LogOut, Lock, RefreshCw, ShieldOff } from 'lucide-react';
import { useActionState } from 'react';
import { FormMessage, Submit } from '@/components/form';
import { connectLinkedInAction, disconnectLinkedInAction, testLinkedInAction, type ActionState } from './actions';

export type AccountView = {
  exists: boolean;
  label: string;
  status: string;
  statusLabel: string;
  demo: boolean;
  providerId: string | null;
  hasSession: boolean;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

function StatusPill({ status }: { status: string }) {
  const tone = status === 'connected' ? 'bg-success-soft text-success'
    : status === 'waiting' ? 'bg-surface-accent text-accent'
    : status === 'disconnected' ? 'bg-surface text-muted'
    : 'bg-red-50 text-danger';
  const map: Record<string, string> = { connected: 'Conectada', waiting: 'Aguardando', expired: 'Expirada', blocked: 'Bloqueada', disconnected: 'Desconectada' };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{map[status] ?? status}</span>;
}

export function GoLinkedInView({ account, isDemo, dailyInvites, dailyMessages }: {
  account: AccountView; isDemo: boolean; dailyInvites: number; dailyMessages: number;
}) {
  const [connectState, connectAction] = useActionState<ActionState | undefined, FormData>(connectLinkedInAction, undefined);
  const [disconnectState, disconnectAction] = useActionState<ActionState | undefined, FormData>(disconnectLinkedInAction, undefined);
  const [testState, testAction] = useActionState<ActionState | undefined, FormData>(testLinkedInAction, undefined);

  return (
    <div className="grid max-w-3xl gap-5">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-accent text-accent"><Link2 className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold">{account.exists ? `${account.label} (sua conta)` : 'Nenhuma conta cadastrada'}</p>
              <p className="text-xs text-muted">{account.providerId ? `Provedor: ${account.providerId}` : isDemo ? 'Modo demonstração: nada toca o LinkedIn.' : 'Modo assistido: a conta protege seus limites e o histórico.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDemo && <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">Simulada</span>}
            <StatusPill status={account.status} />
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Sessão registrada</dt><dd className="mt-0.5 font-medium">{account.hasSession ? 'Sim (cifrada 🔒)' : 'Não'}</dd></div>
          <div><dt className="text-xs text-muted">Conectada em</dt><dd className="mt-0.5">{account.connectedAt ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted">Última verificação</dt><dd className="mt-0.5">{account.lastCheckedAt ?? '—'}</dd></div>
          <div><dt className="text-xs text-muted">Limite de convites/dia</dt><dd className="mt-0.5">{dailyInvites}</dd></div>
          <div><dt className="text-xs text-muted">Limite de mensagens/dia</dt><dd className="mt-0.5">{dailyMessages}</dd></div>
        </dl>
        {account.lastError && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{account.lastError}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <form action={testAction}>
            <Submit className="btn-outline" pendingText="Testando…"><RefreshCw className="h-4 w-4" /> Testar conexão</Submit>
          </form>
          {account.exists && account.status !== 'disconnected' && (
            <form action={disconnectAction}>
              <ConfirmSubmit />
            </form>
          )}
        </div>
        {testState && <div className="mt-3"><FormMessage state={testState} /></div>}
        {disconnectState && <div className="mt-3"><FormMessage state={disconnectState} /></div>}
      </section>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Lock className="h-4 w-4 text-accent" /> {account.exists ? 'Reconectar / registrar sessão' : 'Conectar LinkedIn'}</h2>
        <p className="mt-1 text-sm text-muted">
          {isDemo
            ? 'No ambiente de demonstração, conectar simula todo o fluxo: nenhuma chamada real é feita ao LinkedIn.'
            : 'Cole o cookie da sessão do LinkedIn (por exemplo, li_at=…). Ele é criptografado no servidor e nunca é exibido, registrado em log ou devolvido pela API.'}
        </p>
        <form action={connectAction} className="mt-4 space-y-3">
          <textarea id="session" name="session" rows={3} className="input font-mono text-xs"
            placeholder={isDemo ? 'Opcional na demo (nada é armazenado de verdade).' : 'li_at=…'} autoComplete="off" spellCheck={false} />
          <Submit className="btn-primary" pendingText="Conectando…">{account.exists ? 'Salvar / reconectar' : 'Conectar LinkedIn'}</Submit>
        </form>
        {connectState && <div className="mt-3"><FormMessage state={connectState} /></div>}
      </section>
    </div>
  );
}

function ConfirmSubmit() {
  return (
    <button type="submit" onClick={(e) => { if (!confirm('Desconectar esta conta do LinkedIn agora?')) e.preventDefault(); }}
      className="btn-outline text-danger">
      <LogOut className="h-4 w-4" /> Desconectar
    </button>
  );
}

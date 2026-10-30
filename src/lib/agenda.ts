import 'server-only';

/**
 * Cliente da agenda (cal.diy) que roda na própria VPS.
 *
 * O primeiro acesso da agenda é a criação do administrador. A rota pública
 * `/auth/setup` fica bloqueada no nginx de propósito — só o Prospectra (que roda
 * na mesma máquina) pode criar esse usuário, pelo loopback.
 */

export const AGENDA_BASE_URL = process.env.AGENDA_BASE_URL?.trim() || 'http://127.0.0.1:3102';
export const AGENDA_PUBLIC_URL = process.env.AGENDA_PUBLIC_URL?.trim() || 'https://agenda.argusprime.com.br';

export type AgendaSetupInput = {
  username: string;
  fullName: string;
  email: string;
  password: string;
};

export type AgendaStatus = {
  /** A agenda responde e ainda não tem nenhum usuário? */
  awaitingAdmin: boolean;
  /** A agenda está fora do ar (serviço/nginx). */
  unreachable: boolean;
  message?: string;
};

/** A agenda já tem administrador? (a rota de setup responde "No setup needed" quando tem) */
export async function agendaStatus(): Promise<AgendaStatus> {
  try {
    const res = await fetch(`${AGENDA_BASE_URL}/api/auth/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (res.status === 400) {
      // "No setup needed." — já existe usuário na agenda.
      return { awaitingAdmin: false, unreachable: false };
    }
    if (res.status === 422) {
      // A rota existe e aceita: ainda não há administrador.
      return { awaitingAdmin: true, unreachable: false };
    }
    if (res.ok) return { awaitingAdmin: true, unreachable: false };
    return { awaitingAdmin: false, unreachable: false, message: `A agenda respondeu ${res.status}.` };
  } catch {
    return { awaitingAdmin: false, unreachable: true, message: 'A agenda não respondeu.' };
  }
}

/**
 * Cria o primeiro administrador da agenda.
 * A própria API da agenda recusa se já existir usuário — não há corrida nem sequestro.
 */
export async function createAgendaAdmin(input: AgendaSetupInput): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${AGENDA_BASE_URL}/api/auth/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: input.username,
        full_name: input.fullName,
        email_address: input.email,
        password: input.password,
      }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => '');
    if (res.status === 400) return { ok: false, error: 'A agenda já tem administrador — o cadastro fica disponível em /auth/setup dentro da agenda.' };
    return { ok: false, error: text?.slice(0, 200) || `A agenda recusou o cadastro (HTTP ${res.status}).` };
  } catch {
    return { ok: false, error: 'Não foi possível falar com a agenda. O serviço está no ar?' };
  }
}

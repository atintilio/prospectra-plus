import 'server-only';

// Cliente de PUSH para o worker de automação "Go" (LinkedIn).
//
// O Go executa as ações no LinkedIn (login/cookies/proxy ficam no Go, nunca aqui)
// e devolve o resultado pelo webhook em POST /api/dispatch (ver src/lib/dispatch.ts).
//
// Contrato que o Go precisa expor (extensão por-lead do backend de referência):
//   POST {GO_BASE_URL}/acoes   header x-go-secret: $GO_SECRET
//   {
//     "tarefa_id":   "<actionId uuid>",
//     "conta_id":    "<providerId da conta no Go>",
//     "tipo":        "invite" | "message" | "comment" | "react",
//     "profile_url": "<url do perfil do lead>",
//     "texto":       "<corpo da ação>",
//     "webhook_url": "<APP>/api/dispatch"
//   }
//   -> 200/201 { "tarefa_id": "..." , "status": "enfileirada" }
// O Go, ao concluir, chama o webhook: { kind:"action", state, actionId, providerId }.
// Aceite/resposta observados pelo Go: { kind:"event", event, leadId }.

export type GoConfig = { baseUrl: string; secret: string };

export function goConfig(): GoConfig | null {
  const baseUrl = process.env.GO_BASE_URL?.trim();
  const secret = process.env.GO_SECRET?.trim();
  return baseUrl && secret ? { baseUrl, secret } : null;
}

/** Automação só dispara quando explicitamente ligada E configurada. Padrão: desligada (assistido). */
export function goEnabled(): boolean {
  return process.env.GO_ENABLED?.trim() === 'true' && goConfig() !== null;
}

export type GoActionType = 'invite' | 'message' | 'comment' | 'react';
export type GoAction = { actionId: string; contaId: string; tipo: GoActionType; profileUrl: string; texto: string };

export class GoError extends Error {}

export class GoClient {
  private base: string;
  constructor(private config: GoConfig, private fetcher: typeof fetch = fetch) {
    const url = new URL(config.baseUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const prefix = url.pathname.replace(/\/$/, '');
    if (
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:' && process.env.NODE_ENV !== 'production')) ||
      url.username || url.password || url.search || url.hash ||
      (prefix !== '' && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix))
    ) throw new GoError('Configure a URL HTTPS do Go, sem credenciais ou query.');
    this.base = url.origin + prefix;
  }

  /** Enfileira uma ação por-lead no Go. Lança GoError em qualquer resultado sem confirmação. */
  async enqueue(action: GoAction, webhookUrl: string): Promise<{ tarefaId: string }> {
    let res: Response;
    try {
      res = await this.fetcher(this.base + '/acoes', {
        method: 'POST',
        headers: { 'x-go-secret': this.config.secret, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarefa_id: action.actionId, conta_id: action.contaId, tipo: action.tipo,
          profile_url: action.profileUrl, texto: action.texto, webhook_url: webhookUrl,
        }),
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new GoError('Go indisponível ou sem resposta. Nenhuma ação foi confirmada.');
    }
    if (res.status === 401 || res.status === 403) throw new GoError('Credencial do Go inválida ou sem permissão.');
    let data: unknown;
    try { data = await res.json(); } catch { throw new GoError('Resposta inválida do Go.'); }
    if (!res.ok) throw new GoError('Go recusou a tarefa.');
    const tarefaId = (data as { tarefa_id?: unknown })?.tarefa_id;
    return { tarefaId: typeof tarefaId === 'string' && tarefaId ? tarefaId : action.actionId };
  }
}

export type GoEnqueuer = Pick<GoClient, 'enqueue'>;

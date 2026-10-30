import { applyDispatch, checkDispatchSecret } from '@/lib/dispatch';
import { getDb } from '@/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Contrato do worker: POST /dispatch { "state": "sent" | "unknown", "providerId"?: string }
// Segredo via header X-Dispatch-Secret (DISPATCH_SECRET no ambiente). Sem o segredo configurado,
// o endpoint fica fechado. Nunca registre o segredo nem proveedores em log detalhado.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  if (!checkDispatchSecret(request.headers.get('X-Dispatch-Secret'))) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const { state, providerId, note, actionId } = (body ?? {}) as {
    state?: string; providerId?: string; note?: string; actionId?: string;
  };
  if (state !== 'sent' && state !== 'unknown') {
    return Response.json({ error: 'state deve ser "sent" ou "unknown".' }, { status: 400 });
  }
  try {
    const db = await getDb();
    const result = await applyDispatch(db, { state, providerId, note, actionId });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha no recebimento.';
    const status = message.includes('não encontrada') ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

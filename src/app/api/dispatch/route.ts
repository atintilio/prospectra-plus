import { checkDispatchSecret, DispatchError, receiveDispatch } from '@/lib/dispatch';
import { getDb } from '@/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Contrato do worker (header X-Dispatch-Secret; DISPATCH_SECRET no ambiente):
//   action : { "kind":"action",  "state":"sent"|"unknown", "actionId":"<uuid>", "providerId"?:"..." }
//   event  : { "kind":"event",   "event":"accepted"|"replied"|"meeting", "leadId":"<uuid>" }
//   account: { "kind":"account", "accountId":"<uuid>", "orgId":"<uuid>", "status":"...", "error"?, "screenshotUrl"? }
// Sem "kind", o corpo é tratado como "action" (compatível com o contrato anterior).
// Sem o segredo configurado, o endpoint fica fechado. Nunca registre o segredo em log.
export async function POST(request: Request) {
  if (!checkDispatchSecret(request.headers.get('X-Dispatch-Secret'))) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  try {
    const db = await getDb();
    return Response.json(await receiveDispatch(db, body));
  } catch (err) {
    if (err instanceof DispatchError) return Response.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : 'Falha no recebimento.';
    return Response.json({ error: message }, { status: 500 });
  }
}

import { scrapeWithGraph } from '../../../server/integrations/scrapegraph';
import { json, methodNotAllowed, parseBody } from '../../_lib/http';
import { readSession } from '../../_lib/session';
import type { ApiRequest, ApiResponse } from '../../_lib/types';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!readSession(req)) return json(res, 401, { error: 'unauthenticated' });
  const body = parseBody(req);
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return json(res, 400, { error: 'invalid_url' });
  try {
    const result = await scrapeWithGraph({ url, prompt: typeof body.prompt === 'string' ? body.prompt : 'Extraia descrição, setor, porte, sinais públicos recentes e URLs de contato, sempre preservando evidências.' });
    return json(res, result.status === 'error' ? 502 : 200, result);
  } catch { return json(res, 500, { status: 'error', detail: 'Falha inesperada no enriquecimento.' }); }
}

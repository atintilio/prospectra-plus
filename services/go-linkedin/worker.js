// Worker do Go: consome a fila Redis, executa a acao e devolve o resultado ao Prospectra
// via webhook POST /api/dispatch. DRY_RUN=true (padrao) NAO toca no LinkedIn: so valida o laco.
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const QUEUE = process.env.QUEUE_NAME || 'prospectra:acoes';
const DRY_RUN = process.env.DRY_RUN !== 'false'; // seguro por padrao
const DISPATCH_SECRET = (process.env.DISPATCH_SECRET || '').trim();

async function callback(url, body) {
  if (!url) { console.log('[worker] sem webhook_url; callback pulado:', JSON.stringify(body)); return; }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Dispatch-Secret': DISPATCH_SECRET }, body: JSON.stringify(body) });
    console.log(`[worker] callback ${url} -> ${res.status}`);
  } catch (e) { console.log('[worker] callback falhou:', e.message); }
}

async function executar(t) {
  if (DRY_RUN) { console.log(`[worker][DRY] ${t.tipo} -> ${t.profile_url} (tarefa ${t.tarefa_id})`); return { state: 'sent' }; }
  // TODO (proxima etapa): execucao real via Playwright (invite/message/comment/react) usando
  // cookies+proxy da conta. Seletores do LinkedIn precisam de ajuste fino ao vivo.
  throw new Error('execucao real ainda nao implementada');
}

async function loop() {
  console.log(`prospectra-go worker iniciado (DRY_RUN=${DRY_RUN}, fila=${QUEUE})`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let item;
    try { item = await redis.blpop(QUEUE, 5); } catch (e) { console.log('[worker] redis:', e.message); await new Promise(r => setTimeout(r, 1000)); continue; }
    if (!item) continue;
    let t; try { t = JSON.parse(item[1]); } catch { console.log('[worker] payload invalido'); continue; }
    try {
      const r = await executar(t);
      await callback(t.webhook_url, { kind: 'action', state: r.state, actionId: t.tarefa_id, providerId: t.conta_id });
    } catch (e) {
      console.log(`[worker] tarefa ${t.tarefa_id} falhou: ${e.message}`);
      await callback(t.webhook_url, { kind: 'action', state: 'unknown', actionId: t.tarefa_id, providerId: t.conta_id, note: e.message });
    }
  }
}
loop();

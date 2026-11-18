// Worker do Go: consome a fila Redis, executa a ação (real ou DRY_RUN) e devolve
// o resultado ao Prospectra via webhook POST /api/dispatch.
// DRY_RUN=true (padrão) NÃO toca no LinkedIn: só valida o laço.
const Redis = require('ioredis');
const { loadAccount, saveAccount } = require('./lib/accounts');

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const QUEUE = process.env.QUEUE_NAME || 'prospectra:acoes';
const DRY_RUN = process.env.DRY_RUN !== 'false'; // seguro por padrão
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

  // Execução real: carrega cookies+proxy da conta e age no LinkedIn com movimento humano.
  const { runAction } = require('./lib/linkedin'); // require tardio: só carrega patchright no modo real
  const account = loadAccount(t.conta_id);
  if (!account || !account.storageState) {
    return { state: 'skipped', account: 'disconnected', note: 'conta sem login (storageState ausente). Rode o login.' };
  }
  return runAction({
    tipo: t.tipo,
    profileUrl: t.profile_url,
    texto: t.texto || '',
    storageState: account.storageState,
    proxy: account.proxy || null,
    onStorage: (storageState) => saveAccount(t.conta_id, { storageState }),
  });
}

async function loop() {
  console.log(`prospectra-go worker iniciado (DRY_RUN=${DRY_RUN}, fila=${QUEUE})`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let item;
    try { item = await redis.blpop(QUEUE, 5); } catch (e) { console.log('[worker] redis:', e.message); await new Promise((r) => setTimeout(r, 1000)); continue; }
    if (!item) continue;
    let t; try { t = JSON.parse(item[1]); } catch { console.log('[worker] payload inválido'); continue; }
    try {
      const r = await executar(t);
      // state: sent|skipped|unknown ; account (opcional): limited|checkpoint|disconnected
      await callback(t.webhook_url, { kind: 'action', state: r.state || 'unknown', actionId: t.tarefa_id, providerId: t.conta_id, ...(r.note ? { note: r.note } : {}) });
      // Saúde da conta: só reporta se a tarefa trouxe accountId/orgId (contrato do dispatch).
      if (r.account && t.account_id && t.org_id) {
        const map = { limited: 'blocked', checkpoint: 'checkpoint', disconnected: 'expired' };
        await callback(t.webhook_url, { kind: 'account', accountId: t.account_id, orgId: t.org_id, status: map[r.account] || 'blocked' });
      }
      console.log(`[worker] tarefa ${t.tarefa_id}: state=${r.state}${r.account ? ` account=${r.account}` : ''}${r.note ? ` (${r.note})` : ''}`);
    } catch (e) {
      console.log(`[worker] tarefa ${t.tarefa_id} falhou: ${e.message}`);
      await callback(t.webhook_url, { kind: 'action', state: 'unknown', actionId: t.tarefa_id, providerId: t.conta_id, note: e.message });
    }
  }
}
loop();

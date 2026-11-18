// Armazém local de contas do Go: por conta_id guarda o storageState (cookies do
// LinkedIn capturados no login) e, opcionalmente, um proxy. Login/cookies/proxy
// vivem só aqui, nunca no Prospectra. Arquivos com permissão restrita (0600).
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.GO_DATA_DIR || path.join(__dirname, '..', '.data');
const ACCOUNTS_DIR = path.join(DATA_DIR, 'accounts');

function ensureDir() { fs.mkdirSync(ACCOUNTS_DIR, { recursive: true }); }
function safeId(id) {
  const s = String(id || '').trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(s)) throw new Error('conta_id inválido');
  return s;
}
function fileFor(id) { return path.join(ACCOUNTS_DIR, `${safeId(id)}.json`); }

/** Lê a conta: { storageState, proxy } ou null se não cadastrada/logada. */
function loadAccount(id) {
  try {
    const raw = fs.readFileSync(fileFor(id), 'utf8');
    const obj = JSON.parse(raw);
    return { storageState: obj.storageState ?? null, proxy: obj.proxy ?? null };
  } catch { return null; }
}

/** Grava/atualiza a conta de forma atômica, preservando o proxy existente. */
function saveAccount(id, patch) {
  ensureDir();
  const current = loadAccount(id) || {};
  const next = { ...current, ...patch };
  const tmp = fileFor(id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
  fs.renameSync(tmp, fileFor(id));
  try { fs.chmodSync(fileFor(id), 0o600); } catch { /* best-effort */ }
  return next;
}

/** Normaliza o proxy para o formato do Playwright, ou false. */
function toPlaywrightProxy(proxy) {
  if (!proxy || !proxy.server) return false;
  return { server: proxy.server, ...(proxy.username ? { username: proxy.username, password: proxy.password || '' } : {}) };
}

module.exports = { loadAccount, saveAccount, toPlaywrightProxy, safeId, DATA_DIR, ACCOUNTS_DIR };

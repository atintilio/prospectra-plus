// Execução real no LinkedIn com Patchright (Playwright stealth) + cursor humano.
// Reimplementação própria. Carrega cookies (storageState) e proxy da conta; nunca
// usa usuário/senha. Detecta limites do LinkedIn e protege a conta.
//
// NOTA: os seletores do LinkedIn mudam com frequência e exigem ajuste fino ao vivo
// com o dono da conta. A busca por texto do botão ("Conectar"/"Connect") dá robustez.
const { chromium } = require('patchright');
const { createCursor, sleep, rand } = require('./cursor');
const { toPlaywrightProxy } = require('./accounts');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

// Mensagens que o próprio LinkedIn mostra quando a conta está limitada/bloqueada.
const LIMIT_SIGNS = [
  'reached the weekly invitation limit',
  "you're out of invitations",
  'out of invitations for now',
  'too many requests',
  'limite semanal de convites',
  'atingiu o limite',
];
const CHECKPOINT_SIGNS = ['checkpoint/challenge', 'security verification', 'verificação de segurança', 'unusual activity'];

async function launchContext(storageState, proxy) {
  const browser = await chromium.launch({
    headless: false, // headful + xvfb = automação humana real
    timeout: 120000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,1024'],
  });
  const pxy = toPlaywrightProxy(proxy);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1024 },
    userAgent: UA,
    ...(storageState ? { storageState } : {}),
    ...(pxy ? { proxy: pxy } : {}),
  });
  const page = await context.newPage();
  return { browser, context, page };
}

function bodyText(page) { return page.evaluate(() => document.body?.innerText?.toLowerCase() || ''); }

async function statusFromPage(page) {
  const url = page.url().toLowerCase();
  if (CHECKPOINT_SIGNS.some((s) => url.includes(s))) return 'checkpoint';
  const text = await bodyText(page);
  if (CHECKPOINT_SIGNS.some((s) => text.includes(s))) return 'checkpoint';
  if (LIMIT_SIGNS.some((s) => text.includes(s))) return 'limited';
  return null;
}

async function isLoggedIn(page) {
  // Se aparecem o form de login ou o link de signup, a sessão caiu.
  const loggedOut = await page.locator('.login__form, form.login-form, a[href*="/signup"], input#username').count().catch(() => 0);
  return loggedOut === 0;
}

/** Procura um botão (role=button ou .artdeco-button) cujo texto bata com um dos termos. */
async function findButtonByText(page, terms) {
  const buttons = await page.locator('button, .artdeco-button, [role="button"]').all();
  for (const b of buttons) {
    const t = (await b.innerText().catch(() => '')).trim().toLowerCase();
    if (t && terms.some((term) => t.includes(term))) {
      if (await b.isVisible().catch(() => false)) return b;
    }
  }
  return null;
}

async function gotoProfile(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(rand(1500, 3500));
}

// ---- Ações ----

async function invite(cursor, texto) {
  const page = cursor.page;
  let connect = await findButtonByText(page, ['connect', 'conectar']);
  if (!connect) {
    // Está sob o menu "More"/"Mais".
    const more = await findButtonByText(page, ['more', 'mais']);
    if (more) { await cursor.click(more); await sleep(rand(600, 1200)); connect = await findButtonByText(page, ['connect', 'conectar']); }
  }
  if (!connect) return { state: 'skipped', note: 'já conectado ou botão Conectar ausente' };
  await cursor.click(connect);
  await sleep(rand(800, 1600));

  if (texto && texto.trim()) {
    const addNote = await findButtonByText(page, ['add a note', 'adicionar nota']);
    if (addNote) {
      await cursor.click(addNote);
      await sleep(rand(500, 1200));
      const area = page.locator('textarea[name="message"], #custom-message, textarea').first();
      if (await area.count()) await cursor.type(area, texto.slice(0, 280));
    }
  }
  const send = await findButtonByText(page, ['send', 'enviar', 'send invitation', 'enviar convite', 'send without a note', 'done']);
  if (!send) return { state: 'skipped', note: 'botão Enviar ausente' };
  await cursor.click(send);
  await sleep(rand(1200, 2500));
  return { state: 'sent' };
}

async function message(cursor, texto) {
  const page = cursor.page;
  const msgBtn = await findButtonByText(page, ['message', 'mensagem', 'enviar mensagem']);
  if (!msgBtn) return { state: 'skipped', note: 'botão Mensagem ausente (talvez não conectado)' };
  await cursor.click(msgBtn);
  await sleep(rand(1000, 2000));
  const box = page.locator('div.msg-form__contenteditable[contenteditable="true"], div[role="textbox"][contenteditable="true"]').first();
  if (!(await box.count())) return { state: 'skipped', note: 'caixa de mensagem ausente' };
  await cursor.type(box, (texto || '').slice(0, 1800));
  await sleep(rand(600, 1400));
  const send = await findButtonByText(page, ['send', 'enviar']);
  if (!send) return { state: 'skipped', note: 'botão Enviar ausente' };
  await cursor.click(send);
  await sleep(rand(1000, 2200));
  return { state: 'sent' };
}

async function openRecentActivity(cursor, profileUrl) {
  const base = profileUrl.replace(/\/$/, '');
  await cursor.page.goto(`${base}/recent-activity/all/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(rand(1800, 3500));
}

async function react(cursor, profileUrl) {
  await openRecentActivity(cursor, profileUrl);
  const like = await cursor.page.locator('button[aria-label*="React Like" i], button[aria-label*="Curtir" i], button[aria-label*="Like" i]').first();
  if (!(await like.count())) return { state: 'skipped', note: 'nenhum post recente para reagir' };
  await cursor.click(like);
  await sleep(rand(800, 1800));
  return { state: 'sent' };
}

async function comment(cursor, profileUrl, texto) {
  if (!texto || !texto.trim()) return { state: 'skipped', note: 'comentário vazio' };
  await openRecentActivity(cursor, profileUrl);
  const commentBtn = cursor.page.locator('button[aria-label*="Comment" i], button[aria-label*="Comentar" i]').first();
  if (!(await commentBtn.count())) return { state: 'skipped', note: 'nenhum post recente para comentar' };
  await cursor.click(commentBtn);
  await sleep(rand(800, 1600));
  const box = cursor.page.locator('div.ql-editor[contenteditable="true"], div[role="textbox"][contenteditable="true"]').first();
  if (!(await box.count())) return { state: 'skipped', note: 'caixa de comentário ausente' };
  await cursor.type(box, texto.slice(0, 1200));
  await sleep(rand(500, 1200));
  const post = await findButtonByText(cursor.page, ['post', 'comment', 'publicar', 'comentar']);
  if (post) { await cursor.click(post); await sleep(rand(900, 1800)); }
  return { state: 'sent' };
}

/** Executa a ação pedida e devolve resultado + saúde da conta. Salva o storageState atualizado. */
async function runAction({ tipo, profileUrl, texto, storageState, proxy, onStorage }) {
  const { browser, context, page } = await launchContext(storageState, proxy);
  try {
    await gotoProfile(page, profileUrl);
    const health = await statusFromPage(page);
    if (health) return { state: 'skipped', account: health, note: `conta ${health}` };
    if (!(await isLoggedIn(page))) return { state: 'skipped', account: 'disconnected', note: 'sessão do LinkedIn expirada' };

    const cursor = createCursor(page);
    let result;
    if (tipo === 'invite') result = await invite(cursor, texto);
    else if (tipo === 'message') result = await message(cursor, texto);
    else if (tipo === 'react') result = await react(cursor, profileUrl);
    else if (tipo === 'comment') result = await comment(cursor, profileUrl, texto);
    else result = { state: 'skipped', note: `tipo desconhecido: ${tipo}` };

    const after = await statusFromPage(page);
    if (after) result = { ...result, account: after };

    // Persiste cookies atualizados para a próxima ação.
    try { if (onStorage) await onStorage(await context.storageState()); } catch { /* best-effort */ }
    return result;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

module.exports = { runAction, launchContext, statusFromPage, isLoggedIn, LIMIT_SIGNS };

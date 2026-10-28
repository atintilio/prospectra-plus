// Worker de LinkedIn para a VPS. Recebe POST /dispatch do app (src/lib/linkedin/http-executor.ts),
// executa UMA ação no navegador headless logado por cookie li_at + proxy, e devolve
// {state:'sent'|'unknown', providerId?}. Incerto => 'unknown' (o app NUNCA reenvia).
//
// O espaçamento humano NÃO é feito aqui: viria de minutos de espera e estouraria o timeout de 60s
// do app. Ele vem da fila (delays da cadência + dailyInvites/dailyMessages + frequência do cron).
// Aqui: 1 conta por instância, 1 ação por vez, jitter curto, e parada em checkpoint/CAPTCHA.
import { createServer as createHttpServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const TYPES = new Set(['react', 'comment', 'invite', 'message']);

export function validateItem(x) {
  if (!x || typeof x !== 'object') return null;
  const { id, type, leadLinkedinUrl, leadName, body } = x;
  if (typeof id !== 'string' || !TYPES.has(type) || typeof leadLinkedinUrl !== 'string') return null;
  let url;
  try { url = new URL(leadLinkedinUrl); } catch { return null; }
  if (url.protocol !== 'https:' || !/(^|\.)linkedin\.com$/.test(url.hostname)) return null;
  if ((type === 'invite' || type === 'message' || type === 'comment') && (typeof body !== 'string' || !body.trim())) return null;
  return { id, type, leadLinkedinUrl, leadName: typeof leadName === 'string' ? leadName : '', body: typeof body === 'string' ? body : '' };
}

function authorized(req, key) {
  const got = (req.headers.authorization || '').trim();
  const want = `Bearer ${key}`;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req, limit = 64 * 1024) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('too large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Serializa as ações: 1 por vez por conta (nunca paralelizar a mesma sessão).
function serializer() {
  let tail = Promise.resolve();
  return (fn) => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; };
}

export function createServer({ key, runAction, path = '/dispatch' }) {
  if (!key) throw new Error('LINKEDIN_WORKER_KEY ausente.');
  const queue = serializer();
  return createHttpServer(async (req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true });
      if (req.method !== 'POST' || url.pathname !== path) return send(404, { error: 'not_found' });
      if (!authorized(req, key)) return send(401, { error: 'unauthorized' });
      const item = validateItem(await readJson(req).catch(() => null));
      if (!item) return send(400, { error: 'invalid_item' });
      // Qualquer exceção na ação vira 'unknown': o app deixa pendente para a fila assistida.
      const result = await queue(() => runAction(item)).catch(() => ({ state: 'unknown' }));
      return send(200, result.state === 'sent' ? { state: 'sent', providerId: result.providerId } : { state: 'unknown' });
    } catch { return send(500, { state: 'unknown' }); }
  });
}

// --- Execução real no navegador (Playwright). Carregada só quando o servidor roda, não nos testes. ---
export async function createLinkedinRunner(env = process.env) {
  const { chromium } = await import('playwright');
  const liAt = (env.LI_AT || '').trim();
  if (!liAt) throw new Error('LI_AT (cookie de sessão do LinkedIn) ausente.');
  const proxy = (env.PROXY_URL || '').trim() ? { server: env.PROXY_URL.trim() } : undefined;
  const headless = env.HEADLESS !== 'false';
  const browser = await chromium.launch({ headless, proxy });
  const context = await browser.newContext({ locale: 'pt-BR' });
  await context.addCookies([{ name: 'li_at', value: liAt, domain: '.linkedin.com', path: '/', secure: true, httpOnly: true }]);

  const jitter = () => new Promise((r) => setTimeout(r, 800 + Math.random() * 3200)); // 0.8–4s, dentro do timeout de 60s
  // Sinais de bloqueio/checkpoint: nunca tratar como enviado.
  const blocked = async (page) => /checkpoint|captcha|\/authwall|login/.test(page.url())
    || (await page.locator('text=/verifica|captcha|segurança|unusual activity/i').count()) > 0;

  async function run(item) {
    const page = await context.newPage();
    try {
      await page.goto(item.leadLinkedinUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await jitter();
      if (await blocked(page)) return { state: 'unknown' };
      // shortcut: seletores do LinkedIn mudam sem aviso; só devolve 'sent' com sinal visível de sucesso,
      // senão 'unknown'. Revalidar os seletores contra o LinkedIn vivo antes de ligar em produção.
      switch (item.type) {
        case 'react': {
          const like = page.locator('button[aria-label*="Gostei" i], button[aria-label*="Like" i]').first();
          await like.click({ timeout: 10_000 });
          return { state: 'sent' };
        }
        case 'comment': {
          await page.locator('button[aria-label*="coment" i], button[aria-label*="comment" i]').first().click({ timeout: 10_000 });
          const box = page.locator('div.ql-editor[contenteditable="true"], div[role="textbox"]').first();
          await box.click({ timeout: 10_000 }); await box.type(item.body, { delay: 20 });
          await page.locator('button:has-text("Publicar"), button:has-text("Post")').first().click({ timeout: 10_000 });
          return { state: 'sent' };
        }
        case 'invite': {
          await page.locator('button:has-text("Conectar"), button:has-text("Connect")').first().click({ timeout: 10_000 });
          const addNote = page.locator('button:has-text("Adicionar nota"), button:has-text("Add a note")').first();
          if (await addNote.count()) {
            await addNote.click();
            await page.locator('textarea[name="message"], #custom-message').first().fill(item.body.slice(0, 300));
          }
          await page.locator('button[aria-label*="Enviar" i], button:has-text("Enviar"), button:has-text("Send")').first().click({ timeout: 10_000 });
          return { state: 'sent' };
        }
        case 'message': {
          await page.locator('button[aria-label*="Enviar mensagem" i], button[aria-label*="Message" i]').first().click({ timeout: 10_000 });
          const box = page.locator('div[role="textbox"][contenteditable="true"], div.msg-form__contenteditable').first();
          await box.click({ timeout: 10_000 }); await box.type(item.body, { delay: 20 });
          await page.keyboard.press('Enter');
          return { state: 'sent' };
        }
        default: return { state: 'unknown' };
      }
    } catch {
      return { state: 'unknown' };
    } finally {
      await page.close().catch(() => {});
    }
  }
  run.close = async () => { await context.close().catch(() => {}); await browser.close().catch(() => {}); };
  return run;
}

// Ponto de entrada: só executa quando chamado diretamente (não em import/teste).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT || 8080);
  const runAction = await createLinkedinRunner();
  const server = createServer({ key: (process.env.LINKEDIN_WORKER_KEY || '').trim(), runAction });
  server.listen(port, '127.0.0.1', () => console.log(`linkedin worker on 127.0.0.1:${port}`));
  const bye = async () => { await runAction.close?.(); server.close(() => process.exit(0)); };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
}

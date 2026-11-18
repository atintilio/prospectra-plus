// Captura de sessão do LinkedIn para uma conta, UMA vez.
// Abre um navegador (headful), você faz login manualmente; ao detectar o cookie de
// autenticação (li_at), salva o storageState no armazém da conta. Nenhuma senha é
// guardada — só cookies, e só dentro do Go.
//
// Uso:  node login.js <conta_id> [proxy_server] [proxy_user] [proxy_pass]
// Em VPS sem tela: rodar sob xvfb + um VNC, ou executar numa máquina com tela e
// copiar o arquivo .data/accounts/<conta_id>.json para o servidor.
const { chromium } = require('patchright');
const { saveAccount, loadAccount } = require('./lib/accounts');

async function main() {
  const [contaId, proxyServer, proxyUser, proxyPass] = process.argv.slice(2);
  if (!contaId) { console.error('uso: node login.js <conta_id> [proxy_server] [proxy_user] [proxy_pass]'); process.exit(1); }

  const proxy = proxyServer ? { server: proxyServer, ...(proxyUser ? { username: proxyUser, password: proxyPass || '' } : {}) } : null;
  if (proxy) saveAccount(contaId, { proxy });

  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1280,1024'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1024 }, ...(loadAccount(contaId)?.proxy ? { proxy: { server: loadAccount(contaId).proxy.server, username: loadAccount(contaId).proxy.username, password: loadAccount(contaId).proxy.password } } : {}) });
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
  console.log(`\n[login] Faça login na janela aberta para a conta "${contaId}". Aguardando o cookie li_at...\n`);

  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    const cookies = await context.cookies();
    if (cookies.find((c) => c.name === 'li_at' && c.value)) {
      const storageState = await context.storageState();
      saveAccount(contaId, { storageState });
      console.log(`[login] OK — sessão salva para "${contaId}". Pode fechar.`);
      await browser.close().catch(() => {});
      return;
    }
    await page.waitForTimeout(1000);
  }
  console.error('[login] tempo esgotado sem detectar login.');
  await browser.close().catch(() => {});
  process.exit(2);
}

main().catch((e) => { console.error('[login] erro:', e.message); process.exit(1); });

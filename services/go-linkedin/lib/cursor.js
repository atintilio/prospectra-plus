// Movimento de mouse humano para o Playwright/Patchright.
// Reimplementação própria (inspirada em padrões open-source) usando ghost-cursor
// apenas para gerar a trajetória de Bézier. Nunca usa element.click() via DOM:
// move o ponteiro por pontos reais e clica na coordenada — comportamento humano.
const { path } = require('ghost-cursor');

function rand(min, max) { return min + Math.random() * (max - min); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Cria um cursor com memória da última posição, preso a uma Page. */
function createCursor(page) {
  const last = { x: rand(100, 300), y: rand(100, 300) };

  async function boxOf(target) {
    const loc = typeof target === 'string' ? page.locator(target).first() : target;
    await loc.waitFor({ state: 'visible', timeout: 15000 });
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const box = await loc.boundingBox();
    if (!box) throw new Error('elemento sem bounding box');
    return { loc, box };
  }

  async function moveTo(point) {
    const route = path(last, point, { moveSpeed: rand(40, 70) });
    for (const step of route) {
      await page.mouse.move(step.x, step.y);
      // micro-pausa ocasional, como mão humana
      if (Math.random() < 0.08) await sleep(rand(8, 35));
    }
    last.x = point.x; last.y = point.y;
  }

  return {
    page,
    last,
    async move(target) {
      const { box } = await boxOf(target);
      const point = { x: box.x + box.width * rand(0.3, 0.7), y: box.y + box.height * rand(0.3, 0.7) };
      await moveTo(point);
    },
    async click(target) {
      const { box } = await boxOf(target);
      const point = { x: box.x + box.width * rand(0.3, 0.7), y: box.y + box.height * rand(0.3, 0.7) };
      await moveTo(point);
      await sleep(rand(80, 240));
      await page.mouse.click(point.x, point.y);
      await sleep(rand(250, 700));
    },
    async type(target, text) {
      await this.click(target);
      for (const ch of String(text)) {
        await page.keyboard.type(ch, { delay: 0 });
        await sleep(rand(40, 160)); // cadência de digitação humana
        if (Math.random() < 0.03) await sleep(rand(200, 600)); // pausa de "pensar"
      }
    },
    sleep,
    rand,
  };
}

module.exports = { createCursor, sleep, rand };

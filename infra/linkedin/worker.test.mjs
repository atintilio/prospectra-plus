import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, validateItem } from './worker.mjs';

test('validateItem aceita item válido e rejeita o resto', () => {
  const ok = validateItem({ id: 'a1', type: 'invite', leadLinkedinUrl: 'https://www.linkedin.com/in/ana', leadName: 'Ana', body: 'Oi' });
  assert.equal(ok?.type, 'invite');
  assert.equal(validateItem({ id: 'a1', type: 'foo', leadLinkedinUrl: 'https://www.linkedin.com/in/ana' }), null);
  assert.equal(validateItem({ id: 'a1', type: 'react', leadLinkedinUrl: 'http://evil.com/in/ana' }), null); // não-https/não-linkedin
  assert.equal(validateItem({ id: 'a1', type: 'message', leadLinkedinUrl: 'https://www.linkedin.com/in/ana', body: '  ' }), null); // msg sem corpo
});

async function withServer(runAction, fn) {
  const server = createServer({ key: 'secret', runAction });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); } finally { server.close(); }
}
const post = (base, body, auth = 'Bearer secret') =>
  fetch(`${base}/dispatch`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: JSON.stringify(body) });
const item = { id: 'a1', type: 'invite', leadLinkedinUrl: 'https://www.linkedin.com/in/ana', leadName: 'Ana', body: 'Oi' };

test('401 sem credencial correta', async () => {
  await withServer(async () => ({ state: 'sent' }), async (base) => {
    assert.equal((await post(base, item, 'Bearer nope')).status, 401);
  });
});

test('400 para item inválido', async () => {
  await withServer(async () => ({ state: 'sent' }), async (base) => {
    assert.equal((await post(base, { id: 'x' })).status, 400);
  });
});

test('sucesso devolve sent+providerId; exceção na ação vira unknown', async () => {
  await withServer(async () => ({ state: 'sent', providerId: 'p1' }), async (base) => {
    assert.deepEqual(await (await post(base, item)).json(), { state: 'sent', providerId: 'p1' });
  });
  await withServer(async () => { throw new Error('boom'); }, async (base) => {
    const r = await post(base, item);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { state: 'unknown' });
  });
});

test('ações são serializadas (nunca concorrentes na mesma conta)', async () => {
  let active = 0, maxActive = 0;
  const runAction = async () => { active++; maxActive = Math.max(maxActive, active); await new Promise((r) => setTimeout(r, 30)); active--; return { state: 'sent' }; };
  await withServer(runAction, async (base) => {
    await Promise.all([post(base, item), post(base, item), post(base, item)].map((p) => p.then((r) => r.json())));
    assert.equal(maxActive, 1);
  });
});

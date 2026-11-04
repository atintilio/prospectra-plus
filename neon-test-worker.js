export default {
  async fetch(req, env) {
    const v = new URL(req.url).searchParams.get('v') || 'pooler';
    const eventos = ['v8:' + v];
    const t0 = Date.now();
    const marca = (m) => eventos.push(`${Date.now() - t0}ms ${m}`);
    try {
      const dnsMod = await import('node:dns');
      const dns = dnsMod.default ?? dnsMod;
      dns.lookup = (hostname, options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        marca('dns.lookup ' + hostname);
        cb(null, hostname, 4);
      };
      const { Client, neonConfig } = await import('@neondatabase/serverless');
      neonConfig.webSocketConstructor = WebSocket;
      const url = v === 'direct' ? env.NEON_DIRECT : env.NEON_POOLER;
      marca('antes do new Client');
      const client = new Client(url);
      marca('depois do new Client');
      const con = client.connect();
      marca('connect() chamado');
      con.then(() => marca('connect() resolvido'), (e) => marca('connect() erro: ' + String(e).slice(0, 80)));
      const res = await Promise.race([
        client.query('select 1 as ok, now() as agora'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 20s')), 20000)),
      ]);
      return Response.json({ v, ok: true, ms: Date.now() - t0, rows: res.rows, eventos });
    } catch (e) {
      return Response.json({ v, ok: false, ms: Date.now() - t0, erro: String(e).slice(0, 200), eventos });
    }
  },
};

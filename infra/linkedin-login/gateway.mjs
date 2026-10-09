import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { WebSocket, WebSocketServer } from 'ws';
const exec = promisify(execFile);
const TOKEN = process.env.GATEWAY_TOKEN;
const PUBLIC_BASE = process.env.PUBLIC_BASE;
if (!TOKEN || !PUBLIC_BASE?.startsWith('https://')) throw new Error('Missing gateway configuration');
const IMAGE = 'stickerdaniel/linkedin-mcp-server:4.26.2';
const NETWORK = process.env.DOCKER_NETWORK || 'prospectra_default';
const TTL = 30 * 60 * 1000;
await mkdir('/data', { recursive: true, mode: 0o700 });
let sessions = {};
try { sessions = JSON.parse(await readFile('/data/sessions.json', 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
async function save() { await writeFile('/data/sessions.tmp', JSON.stringify(sessions), { mode: 0o600 }); await rename('/data/sessions.tmp', '/data/sessions.json'); }
async function docker(...args) { return (await exec('docker', args, { timeout: 15000, maxBuffer: 1024 * 1024 })).stdout.trim(); }
function authorized(req) { const a = Buffer.from(req.headers.authorization || ''); const b = Buffer.from(`Bearer ${TOKEN}`); return a.length === b.length && timingSafeEqual(a,b); }
function respond(res, status, body) { res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' }); res.end(JSON.stringify(body)); }
function active(s) { return s && ['starting','awaiting_login'].includes(s.status); }
async function refresh(s) {
  if (!active(s)) return;
  if (s.status === 'starting' && Date.now() > (s.created || s.expires - TTL) + 180000) { await docker('rm','-f',s.name).catch(()=>{}); s.status = 'failed'; return; }
  if (Date.now() > s.expires) { await docker('rm','-f',s.name).catch(()=>{}); s.status = 'expired'; delete s.viewerToken; return; }
  let state;
  try { state = JSON.parse(await docker('inspect','--format','{{json .State}}',s.name)); }
  catch { s.status = 'failed'; return; }
  if (!state.Running) { s.status = state.ExitCode === 0 && !state.OOMKilled ? 'authenticated' : 'failed'; delete s.viewerToken; await docker('rm',s.name).catch(()=>{}); return; }
  const logs = await docker('logs','--tail','150',s.name);
  const match = logs.match(/http:\/\/127\.0\.0\.1:6080\/vnc_lite\.html#\?path=([^\s\u001b]+?)(?:&scale=true)/);
  if (match) {
    const path = decodeURIComponent(match[1]);
    const token = new URL(`http://local/${path}`).searchParams.get('token');
    if (token) { s.viewerToken = token; s.status = 'awaiting_login'; }
  }
}
function publicState(s) {
  if (!s) return { status:'disconnected' };
  const result = { status:s.status, expiresAt:new Date(s.expires).toISOString() };
  if (s.status === 'awaiting_login') {
    const base = new URL(PUBLIC_BASE);
    const wsPath = `${base.pathname.replace(/^\//,'')}/view/${s.capability}/websockify`;
    result.viewerUrl = `${PUBLIC_BASE}/view/${s.capability}/vnc_lite.html#?path=${encodeURIComponent(wsPath)}&scale=true`;
  }
  return result;
}
// Serialise state transitions, including simultaneous start requests from different users.
let queue = Promise.resolve();
function serial(fn) { const result = queue.then(fn); queue = result.catch(()=>{}); return result; }
function viewer(req) {
  const url = new URL(req.url,'http://local');
  const match = url.pathname.match(/^\/view\/([a-f0-9]{64})(\/.*)$/);
  if (!match) return null;
  const session = Object.values(sessions).find(s => s.capability === match[1] && s.status === 'awaiting_login' && s.expires > Date.now());
  if (!session) return null;
  return { session, path: match[2], search:url.search };
}
const server = http.createServer(async (req,res) => {
  const match = new URL(req.url,'http://local').pathname.match(/^\/api\/session\/([a-f0-9]{64})$/);
  if (match) {
    if (!authorized(req)) return respond(res,401,{error:'unauthorized'});
    if (!['GET','POST','DELETE'].includes(req.method)) return respond(res,405,{error:'method_not_allowed'});
    try {
      const result = await serial(async () => {
        const id = match[1];
        for (const s of Object.values(sessions)) await refresh(s);
        let s = sessions[id];
        if (req.method === 'DELETE') {
          if (active(s)) { await docker('rm','-f',s.name).catch(()=>{}); s.status = 'disconnected'; delete s.viewerToken; }
        }
        if (req.method === 'POST' && !active(s)) {
          if (Object.values(sessions).some(active)) { await save(); return {status:'busy'}; }
          const name = `prospectra-li-login-${id.slice(0,24)}`;
          await docker('rm','-f',name).catch(()=>{});
          s = {status:'starting',name,created:Date.now(),capability:randomBytes(32).toString('hex'),expires:Date.now()+TTL};
          sessions[id] = s;
          await save();
          try { await docker('run','-d','--name',name,'--network',NETWORK,'--label','prospectra.linkedin-login=true','--memory','700m','--memory-swap','1400m','--shm-size','128m','-e','PYTHONUNBUFFERED=1','-v',`prospectra_li_${id}:/home/pwuser/.linkedin-mcp`,IMAGE,'--login','--login-viewer'); }
          catch { s.status='failed'; }
        }
        await save(); return publicState(s);
      });
      return respond(res,200,result);
    } catch { return respond(res,503,{status:'unavailable'}); }
  }
  const v = viewer(req);
  if (!v || !['GET','HEAD'].includes(req.method)) return respond(res,404,{error:'not_found'});
  // Only static noVNC resources; remote control is separately token-gated on upgrade.
  const upstream = http.request({hostname:v.session.name,port:6080,path:v.path+v.search,method:req.method}, incoming => {
    res.writeHead(incoming.statusCode || 502,{...incoming.headers,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"frame-ancestors https://prospectra.argusprime.com.br https://prospectra-plus.vercel.app"});
    incoming.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent) respond(res,502,{error:'viewer_not_ready'}); else res.end();});
  upstream.end();
});
const wss = new WebSocketServer({noServer:true, maxPayload:2*1024*1024});
server.on('upgrade',(req,socket,head)=>{
  const v = viewer(req);
  if (!v || v.path !== '/websockify' || !v.session.viewerToken) return socket.destroy();
  const origin = req.headers.origin;
  if (origin && origin !== new URL(PUBLIC_BASE).origin) return socket.destroy();
  wss.handleUpgrade(req,socket,head,client=>{
    const upstream = new WebSocket(`ws://${v.session.name}:6080/websockify?token=${encodeURIComponent(v.session.viewerToken)}`,['binary']);
    const pending=[];
    client.on('message',(data,binary)=>{if(upstream.readyState===WebSocket.OPEN) upstream.send(data,{binary}); else if(pending.length<16) pending.push([data,binary]); else client.close();});
    upstream.on('open',()=>pending.splice(0).forEach(([data,binary])=>upstream.send(data,{binary})));
    upstream.on('message',(data,binary)=>{if(client.readyState===WebSocket.OPEN) client.send(data,{binary});});
    client.on('close',()=>upstream.close()); upstream.on('close',()=>client.close());
    client.on('error',()=>upstream.terminate()); upstream.on('error',()=>client.close());
  });
});
setInterval(()=>serial(async()=>{for(const s of Object.values(sessions)) await refresh(s); await save();}).catch(()=>{}),10000).unref();
server.listen(8082,'0.0.0.0');

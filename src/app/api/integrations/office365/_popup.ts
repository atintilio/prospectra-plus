import { NextResponse } from 'next/server';

export function popup(result: 'connected' | 'cancelled' | 'error', message: string) {
  const encoded = JSON.stringify({ result, message }).replace(/</g, '\\u003c');
  return new NextResponse(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Office 365 · Prospectra</title><body style="font:16px system-ui,sans-serif;margin:3rem"><h1>Office 365</h1><p id="message"></p><a href="/canais">Voltar aos canais</a><script>const data=${encoded};document.getElementById('message').textContent=data.message;if(window.opener){window.opener.postMessage({type:'prospectra-office365',result:data.result},window.location.origin);window.close()}</script></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch, appPath } from '../src/apiFetch';
afterEach(()=>vi.unstubAllGlobals());
it('navegação e chamadas mantêm a sessão da área demo', async()=>{
 vi.stubGlobal('window',{location:{pathname:'/demo/crm'}});
 const request=vi.fn(async()=>new Response('{}'));vi.stubGlobal('fetch',request);
 expect(appPath('/configuracoes')).toBe('/demo/configuracoes');expect(appPath('/')).toBe('/demo');
 await apiFetch('/api/workspace/state',{headers:{'Content-Type':'application/json'}});
 const headers=(request.mock.calls[0] as unknown as [string,RequestInit])[1].headers as Headers;
 expect(headers.get('x-prospectra-session')).toBe('demo');expect(headers.get('Content-Type')).toBe('application/json');
});
it('produção não herda o cookie escolhido pela área demo',async()=>{
 vi.stubGlobal('window',{location:{pathname:'/crm'}});
 const request=vi.fn(async()=>new Response('{}'));vi.stubGlobal('fetch',request);
 expect(appPath('/configuracoes')).toBe('/configuracoes');await apiFetch('/api/auth/me');
 expect(((request.mock.calls[0] as unknown as [string,RequestInit])[1].headers as Headers).get('x-prospectra-session')).toBe('production');
});

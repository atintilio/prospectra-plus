import {expect,test,vi} from 'vitest';
import {AkgGateway,sessionIdFor,assertWhatsAppAccess} from '@/lib/whatsapp/akg';

const scope={orgId:'org-a',userId:'seller-a'};
test('reverse proxy prefix is preserved for session, QR and send requests',async()=>{
 const replies=[{status:true,data:{status:'SCAN_QR',hasInstance:true}},{success:true,base64:'data:image/png;base64,aGVsbG8='},{status:true,data:{status:'CONNECTED',hasInstance:true,me:{id:'5511@s.whatsapp.net'}}},{status:true,data:{key:{id:'msg-prefix'}}}];
 const fetcher=vi.fn(async()=>new Response(JSON.stringify(replies.shift()),{status:200}));
 const api=new AkgGateway({baseUrl:'https://gateway.example.test/prospectra-whatsapp/',apiKey:'secret'},fetcher as typeof fetch);
 expect((await api.status(scope)).state).toBe('qr_ready');
 expect(await api.sendText(scope,'5511999999999','Teste')).toEqual({providerMessageId:'msg-prefix'});
 for(const [url,options] of fetcher.mock.calls as unknown as Array<[string,RequestInit]>){
  expect(url).toMatch(/^https:\/\/gateway\.example\.test\/prospectra-whatsapp\/api\//);
  expect(options.redirect).toBe('error');
 }
});
test('gateway configuration rejects insecure URLs and ambiguous prefixes',()=>{
 for(const baseUrl of ['http://gateway.example.test','https://user:secret@gateway.example.test','https://gateway.example.test/?key=secret','https://gateway.example.test/#fragment','https://gateway.example.test/api','https://gateway.example.test/prefix/api/','https://gateway.example.test/a//b','https://gateway.example.test/a%2fb']){
  expect(()=>new AkgGateway({baseUrl,apiKey:'secret'})).toThrow();
 }
});
function gateway(responses: Array<[number,unknown]>) {
 const fetcher=vi.fn(async()=>{const [status,body]=responses.shift()!;return new Response(JSON.stringify(body),{status});});
 return {api:new AkgGateway({baseUrl:'https://gateway.example.test',apiKey:'secret'},fetcher as typeof fetch),fetcher};
}
test('session identity is stable and isolated by seller and operation',()=>{
 expect(sessionIdFor(scope)).toBe(sessionIdFor(scope));
 expect(sessionIdFor(scope)).not.toBe(sessionIdFor({...scope,userId:'other'}));
 expect(sessionIdFor(scope)).not.toBe(sessionIdFor({...scope,orgId:'other'}));
});
test('a sessao fixa da instalacao (WA_AKG_SESSION_ID) vale para todos os escopos',()=>{
 const anterior=process.env.WA_AKG_SESSION_ID;
 process.env.WA_AKG_SESSION_ID='prospectra-30592258160abd52e895f911450114df631a2bf9';
 try{
  expect(sessionIdFor(scope)).toBe('prospectra-30592258160abd52e895f911450114df631a2bf9');
  expect(sessionIdFor({...scope,userId:'other'})).toBe(sessionIdFor(scope));
  expect(sessionIdFor({...scope,orgId:'other'})).toBe(sessionIdFor(scope));
 }finally{ if(anterior===undefined)delete process.env.WA_AKG_SESSION_ID; else process.env.WA_AKG_SESSION_ID=anterior; }
});
test('inactive accounts, inactive operations and demo never call the real gateway',()=>{
 expect(()=>assertWhatsAppAccess({user:{id:'a',status:'disabled'},org:{id:'b',active:true,isDemo:false}})).toThrow();
 expect(()=>assertWhatsAppAccess({user:{id:'a',status:'active'},org:{id:'b',active:false,isDemo:false}})).toThrow();
 expect(()=>assertWhatsAppAccess({user:{id:'a',status:'active'},org:{id:'b',active:true,isDemo:true}})).toThrow();
});
test('connect creates a scoped session, disables gateway bot, starts and reads QR with its different envelope',async()=>{
 const {api,fetcher}=gateway([[200,{status:true,data:[]}],[200,{status:true,data:{}}],[200,{status:true,data:{enabled:false}}],[200,{status:true}],[200,{status:true,data:{status:'SCAN_QR',hasInstance:true}}],[200,{success:true,base64:'data:image/png;base64,aGVsbG8='}]]);
 expect((await api.connect(scope)).state).toBe('qr_ready');
 expect(fetcher.mock.calls).toHaveLength(6);
 const calls=fetcher.mock.calls as unknown as Array<[string,RequestInit]>;
 expect(calls[1][1].body).toContain(sessionIdFor(scope));
 expect(calls[2][1].body).toContain('"enabled":false');
 expect(calls[0][1].headers).toMatchObject({'x-api-key':'secret'});
});
test('connected status uses live instance rather than a stale database status',async()=>{
 const {api}=gateway([[200,{status:true,data:{status:'CONNECTED',hasInstance:false,me:null}}]]);
 expect((await api.status(scope)).state).toBe('disconnected');
 const connected=gateway([[200,{status:true,data:{status:'CONNECTED',hasInstance:true,me:{id:'5511999999999:2@s.whatsapp.net'}}}]]);
 expect(await connected.api.status(scope)).toMatchObject({state:'connected',phone:'5511999999999'});
});
test('empty QR is pending; gateway auth/HTTP200 failure is not success and secrets are not leaked',async()=>{
 const pending=gateway([[200,{status:true,data:{status:'CONNECTING',hasInstance:true}}],[404,{qr:null}]]);
 expect((await pending.api.status(scope)).state).toBe('connecting');
 const rejected=gateway([[200,{status:false,message:'secret provider details'}]]);
 await expect(rejected.api.status(scope)).rejects.toThrow('Não foi possível consultar o WA-AKG.');
 const denied=gateway([[401,{message:'secret'}]]);
 await expect(denied.api.status(scope)).rejects.toThrow('Credencial do WA-AKG inválida');
});
test('disconnect awaits credential removal and stop instead of claiming logout on an unconfirmed request',async()=>{
 const {api,fetcher}=gateway([[200,{status:true}],[200,{status:true}],[200,{status:true,data:{status:'LOGGED_OUT',hasInstance:false,me:null}}]]);
 expect((await api.disconnect(scope)).state).toBe('disconnected');
 const calls=fetcher.mock.calls as unknown as Array<[string,RequestInit]>;
 expect(calls[0][0]).toContain('/logout');expect(calls[1][0]).toContain('/stop');
});
test('send validates destination, requires a live connection and uses the real AKG message contract',async()=>{
 const {api,fetcher}=gateway([[200,{status:true,data:{status:'CONNECTED',hasInstance:true,me:{id:'5511@s.whatsapp.net'}}}],[200,{status:true,data:{key:{id:'wamessage1'}}}]]);
 expect(await api.sendText(scope,'+5511999999999','Olá')).toEqual({providerMessageId:'wamessage1'});
 const calls=fetcher.mock.calls as unknown as Array<[string,RequestInit]>;
 expect(calls[1][0]).toContain('5511999999999%40s.whatsapp.net');
 expect(calls[1][1].body).toBe(JSON.stringify({message:{text:'Olá'}}));
 await expect(api.sendText(scope,'not-a-number','Olá')).rejects.toThrow();
});
test('ambiguous send timeout or missing message id never becomes a confirmed delivery',async()=>{
 const {api}=gateway([[200,{status:true,data:{status:'CONNECTED',hasInstance:true,me:{id:'5511@s.whatsapp.net'}}}],[200,{status:true,data:{}}]]);
 await expect(api.sendText(scope,'+5511999999999','Olá')).rejects.toThrow('Envio sem confirmação');
});
test('voice messages upload private Opus bytes without a public media URL',async()=>{
 const {api,fetcher}=gateway([[200,{status:true,data:{status:'CONNECTED',hasInstance:true,me:{id:'5511@s.whatsapp.net'}}}],[200,{status:true,data:{key:{id:'voice-1'}}}]]);
 const audio=new Blob(['OggSsampleOpusHead'],{type:'audio/ogg'});
 expect(await api.sendAudio(scope,'5511999999999',audio)).toEqual({providerMessageId:'voice-1'});
 const calls=fetcher.mock.calls as unknown as Array<[string,RequestInit]>;
 expect(calls[1][0]).toContain('/media');
 const form=calls[1][1].body as FormData;
 expect(form.get('type')).toBe('voice');
 expect(form.get('file')).toBeInstanceOf(Blob);
 expect(calls[1][1].headers).not.toHaveProperty('Content-Type');
});
test('invalid or oversized voice data is rejected before any provider request',async()=>{
 const {api,fetcher}=gateway([]);
 await expect(api.sendAudio(scope,'5511999999999',new Blob(['not opus'],{type:'audio/ogg'}))).rejects.toThrow();
 await expect(api.sendAudio(scope,'5511999999999',new Blob(['OggSOpusHead'],{type:'audio/mp4'}))).rejects.toThrow();
 expect(fetcher).not.toHaveBeenCalled();
});

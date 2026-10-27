import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';

export type Scope={orgId:string;userId:string};
export type WhatsAppStatus={state:'not_configured'|'disconnected'|'connecting'|'qr_ready'|'connected'|'error';phone?:string;qrDataUrl?:string;checkedAt:string;message?:string};
type Access={user:{id:string;status:string};org:{id:string;active:boolean;isDemo:boolean}|null};
export function assertWhatsAppAccess(ctx:Access):Scope {
 if(ctx.user.status!=='active'||!ctx.org?.active) throw Error('Conta ou operação sem acesso ativo.');
 if(ctx.org.isDemo) throw Error('WhatsApp real não está disponível no ambiente de demonstração.');
 return {orgId:ctx.org.id,userId:ctx.user.id};
}
export function sessionIdFor(scope:Scope):string {
 return 'prospectra-'+createHash('sha256').update(JSON.stringify([scope.orgId,scope.userId])).digest('hex').slice(0,40);
}
export function akgConfig() {
 const baseUrl=process.env.WA_AKG_BASE_URL,apiKey=process.env.WA_AKG_API_KEY;
 return baseUrl&&apiKey?{baseUrl,apiKey}:null;
}
export class AkgGateway {
 private base:string;
 constructor(private config:{baseUrl:string;apiKey:string},private fetcher:typeof fetch=fetch){
  const url=new URL(config.baseUrl);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  const prefix=url.pathname.replace(/\/$/,'');
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'&&process.env.NODE_ENV!=='production'))||url.username||url.password||url.search||url.hash||(prefix!==''&&!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix))||/\/api$/i.test(prefix)) throw Error('Configure a URL HTTPS do WA-AKG sem /api.');
  this.base=url.origin+prefix;
 }
 private async request(path:string,method='GET',body?:unknown,missing=false):Promise<any>{
  let response:Response;
  const multipart=body instanceof FormData;
  try {response=await this.fetcher(this.base+'/api'+path,{method,headers:multipart?{'x-api-key':this.config.apiKey}:{'x-api-key':this.config.apiKey,'Content-Type':'application/json'},body:multipart?body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});}
  catch {throw Error('WA-AKG indisponível ou sem resposta. Tente consultar o status novamente.');}
  if(missing&&[403,404].includes(response.status))return null;
  if([401,403].includes(response.status))throw Error('Credencial do WA-AKG inválida ou sem permissão.');
  let data:any;try{data=await response.json();}catch{throw Error('Resposta inválida do WA-AKG.');}
  if(!response.ok||data.status===false)throw Error('Não foi possível consultar o WA-AKG.');
  return data;
 }
 private path(scope:Scope){return '/sessions/'+encodeURIComponent(sessionIdFor(scope));}
 async configureWebhook(scope:Scope,callback:string,secret:string):Promise<void>{
  const url=new URL(callback);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/harvey/inbound'||secret.length<32)throw Error('Configuração do recebimento comercial inválida.');
  const path='/webhooks/'+encodeURIComponent(sessionIdFor(scope));
  const list=await this.request(path);
  if(!Array.isArray(list.data))throw Error('Não foi possível verificar o recebimento de mensagens.');
  const existing=list.data.find((h:any)=>h.name==='Prospectra commercial'&&h.session?.sessionId===sessionIdFor(scope));
  const body={name:'Prospectra commercial',url:url.toString(),secret,events:['message.received'],isActive:true};
  await this.request(existing?path+'/'+encodeURIComponent(existing.id):path,existing?'PUT':'POST',body);
 }
 async status(scope:Scope):Promise<WhatsAppStatus>{
  const result=await this.request(this.path(scope),'GET',undefined,true);
  const checkedAt=new Date().toISOString();
  if(!result)return {state:'disconnected',checkedAt};
  const session=result.data;
  if(!session||typeof session.status!=='string')throw Error('Resposta inválida do WA-AKG.');
  if(session.status==='CONNECTED'&&session.hasInstance===true&&typeof session.me?.id==='string')return {state:'connected',phone:session.me.id.split('@')[0].split(':')[0],checkedAt};
  if(!session.hasInstance||['STOPPED','LOGGED_OUT','DISCONNECTED'].includes(session.status))return {state:'disconnected',checkedAt};
  const response=await this.fetcher(this.base+'/api'+this.path(scope)+'/qr',{headers:{'x-api-key':this.config.apiKey},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)}).catch(()=>null);
  if(!response)throw Error('WA-AKG indisponível ou sem resposta. Tente consultar o status novamente.');
  if([400,404].includes(response.status))return {state:'connecting',checkedAt};
  if(!response.ok)throw Error('Não foi possível obter o QR Code do WA-AKG.');
  const qr=await response.json().catch(()=>null);
  if(qr?.success===true&&typeof qr.base64==='string'&&qr.base64.length<2_000_000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr.base64))return {state:'qr_ready',qrDataUrl:qr.base64,checkedAt};
  throw Error('QR Code inválido recebido do WA-AKG.');
 }
 async connect(scope:Scope):Promise<WhatsAppStatus>{
  const sessions=await this.request('/sessions');
  if(!Array.isArray(sessions.data))throw Error('Resposta inválida do WA-AKG.');
  if(!sessions.data.some((s:any)=>s.sessionId===sessionIdFor(scope))){
   try {await this.request('/sessions','POST',{name:'Prospectra',sessionId:sessionIdFor(scope)});}
   catch(error){ // A concurrent connect may have created the exact same session.
    const retry=await this.request('/sessions');
    if(!Array.isArray(retry.data)||!retry.data.some((s:any)=>s.sessionId===sessionIdFor(scope)))throw error;
   }
  }
  const bot=await this.request(this.path(scope)+'/bot-config','POST',{enabled:false,enablePing:false,enableUptime:false,enableSticker:false,enableVideoSticker:false,autoRead:false,alwaysOnline:false});
  if(bot.data?.enabled!==false)throw Error('Atualize o WA-AKG com os ajustes Prospectra antes de conectar: bot interno ainda ativo.');
  await this.request(this.path(scope)+'/start','POST',{});
  return this.status(scope);
 }
 async disconnect(scope:Scope):Promise<WhatsAppStatus>{
  await this.request(this.path(scope)+'/logout','POST',{});
  await this.request(this.path(scope)+'/stop','POST',{});
  const result=await this.status(scope);
  if(result.state!=='disconnected')throw Error('Desvinculação ainda não confirmada pelo WA-AKG.');
  return result;
 }
 async sendText(scope:Scope,recipient:string,text:string):Promise<{providerMessageId:string}>{
  const phone=recipient.replace(/[\s()+-]/g,'');
  z.string().regex(/^[1-9]\d{7,14}$/).parse(phone);
  const body=z.string().trim().min(1).max(4000).parse(text);
  if((await this.status(scope)).state!=='connected')throw Error('Conecte o WhatsApp antes de enviar.');
  let result:any;
  try {result=await this.request('/messages/'+encodeURIComponent(sessionIdFor(scope))+'/'+encodeURIComponent(phone+'@s.whatsapp.net')+'/send','POST',{message:{text:body}});}
  catch {throw Error('Envio sem confirmação. Confira no WhatsApp antes de tentar novamente.');}
  const id=result.data?.key?.id;
  if(typeof id!=='string'||!id)throw Error('Envio sem confirmação. Confira no WhatsApp antes de tentar novamente.');
  return {providerMessageId:id};
 }
 async sendAudio(scope:Scope,recipient:string,audio:Blob):Promise<{providerMessageId:string}>{
  const phone=recipient.replace(/[\s()+-]/g,'');z.string().regex(/^[1-9]\d{7,14}$/).parse(phone);
  if(!audio.size||audio.size>8_000_000||audio.type!=='audio/ogg')throw Error('Use áudio Ogg/Opus de até 8 MB.');
  const header=new TextDecoder().decode(await audio.slice(0,4096).arrayBuffer());
  if(!header.startsWith('OggS')||!header.includes('OpusHead'))throw Error('Áudio Opus inválido.');
  if((await this.status(scope)).state!=='connected')throw Error('Conecte o WhatsApp antes de enviar.');
  const form=new FormData();form.set('file',audio,'voice.ogg');form.set('type','voice');
  let result:any;
  try{result=await this.request('/messages/'+encodeURIComponent(sessionIdFor(scope))+'/'+encodeURIComponent(phone+'@s.whatsapp.net')+'/media','POST',form);}
  catch{throw Error('Envio de áudio sem confirmação. Confira no WhatsApp antes de tentar novamente.');}
  const id=result.data?.key?.id;
  if(typeof id!=='string'||!id)throw Error('Envio de áudio sem confirmação. Confira no WhatsApp antes de tentar novamente.');
  return {providerMessageId:id};
 }
}

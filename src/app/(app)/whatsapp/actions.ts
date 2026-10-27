'use server';
import {requireOrg} from '@/lib/auth';
import {getDb} from '@/db';
import {AkgGateway,akgConfig,assertWhatsAppAccess,type WhatsAppStatus} from '@/lib/whatsapp/akg';
import {sendWhatsAppCommand} from '@/lib/whatsapp/commands';
import {sessionIdFor} from '@/lib/whatsapp/akg';
import {sessionWebhookSecret} from '@/lib/whatsapp/webhook-signing';

async function context(){
 const ctx=await requireOrg();const scope=assertWhatsAppAccess(ctx);const config=akgConfig();
 if(!config)throw Error('O administrador precisa configurar o gateway WA-AKG na VPS e as credenciais do servidor.');
 return {ctx,scope,api:new AkgGateway(config)};
}
export async function whatsappAction(action:'status'|'connect'|'disconnect'):Promise<WhatsAppStatus>{
 try {
  const {scope,api}=await context();
  if(action==='connect'){
   const result=await api.connect(scope);
   const master=process.env.HARVEY_WEBHOOK_SECRET,origin=process.env.PUBLIC_APP_URL;
   if(!master||!origin)return {...result,message:'WhatsApp iniciado. O administrador ainda precisa configurar o recebimento do assistente comercial.'};
   await api.configureWebhook(scope,new URL('/api/harvey/inbound',origin).toString(),sessionWebhookSecret(master,sessionIdFor(scope)));
   return result;
  }
  if(action==='disconnect')return await api.disconnect(scope);
  if(action!=='status')throw Error('Ação inválida.');
  return await api.status(scope);
 }catch(error){return {state:'error',checkedAt:new Date().toISOString(),message:error instanceof Error?error.message:'Não foi possível acessar o WhatsApp.'};}
}
export async function sendWhatsAppAction(input:unknown):Promise<{ok?:string;error?:string;state?:string}>{
 try {
  const {ctx,scope,api}=await context();
  const result=await sendWhatsAppCommand(await getDb(),scope,input,ctx.user.dailyMessages,(s,p,t)=>api.sendText(s,p,t));
  if(result.state==='sent')return {ok:'Mensagem aceita pelo WhatsApp. Isso ainda não confirma leitura ou entrega ao destinatário.',state:'sent'};
  return {error:'Envio sem confirmação. Confira no seu WhatsApp; este comando não será reenviado automaticamente.',state:result.state};
 }catch(error){return {error:error instanceof Error&&error.name!=='ZodError'?error.message:'Confira o telefone com código do país e o texto da mensagem.'};}
}

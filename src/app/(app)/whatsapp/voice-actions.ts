'use server';
import {revalidatePath} from 'next/cache';
import {and,eq} from 'drizzle-orm';
import {requireOrg} from '@/lib/auth';
import {getDb,schema} from '@/db';
import {assertWhatsAppAccess} from '@/lib/whatsapp/akg';
import {VoiceStudioGateway,voiceConfig} from '@/lib/voice/voicestudio';
import {queueVoiceDelivery,saveVoiceProfile,claimVoiceRegistration} from '@/lib/voice/delivery';
type State={message:string};
export async function registerVoiceAction(_:State,form:FormData):Promise<State>{
 const ctx=await requireOrg();
 try{
  const scope=assertWhatsAppAccess(ctx),config=voiceConfig();
  if(!config||!ctx.org.aiEnabled)throw Error('Voz indisponível.');
  const reference=form.get('reference');if(!(reference instanceof File))throw Error('Gravação necessária.');
  await claimVoiceRegistration(await getDb(),scope);
  const result=await new VoiceStudioGateway(config).createProfile({sellerName:ctx.user.name||'Minha voz',reference,transcript:String(form.get('transcript')??''),consent:form.get('voiceConsent')==='on'});
  await saveVoiceProfile(await getDb(),scope,result.profileId,config.engine,true);
  revalidatePath('/whatsapp');return {message:'Sua voz foi cadastrada e vinculada somente à sua conta nesta operação.'};
 }catch{return {message:'Não foi possível cadastrar a voz. Confira a gravação, a transcrição, a autorização e a disponibilidade do serviço.'};}
}
export async function queueVoiceAction(_:State,form:FormData):Promise<State>{
 const ctx=await requireOrg();
 try{
  const scope=assertWhatsAppAccess(ctx);
  if(process.env.VOICE_AUTOMATION_ENABLED!=='true'||!voiceConfig())throw Error('Executor indisponível.');
  const leadId=String(form.get('leadId')??'').trim()||undefined;
  await queueVoiceDelivery(await getDb(),scope,{id:String(form.get('commandId')??''),recipient:String(form.get('recipient')??''),text:String(form.get('text')??''),kind:'audio',leadId});
  revalidatePath('/whatsapp');return {message:'Áudio na fila. O executor gerará a mensagem com sua voz e fará o envio pelo seu WhatsApp.'};
 }catch{return {message:'Não foi possível solicitar o áudio. Verifique sua voz, o telefone, os limites e a disponibilidade do executor.'};}
}
/** Sugere o texto da mensagem de voz a partir do rascunho que a inteligência (Harvey) preparou para o lead. */
export async function suggestVoiceTextAction(leadId:string):Promise<{text?:string;error?:string}>{
 const ctx=await requireOrg();
 try{assertWhatsAppAccess(ctx);}catch{return {error:'Voz indisponível nesta operação.'};}
 if(!/^[0-9a-f-]{36}$/i.test(leadId))return {error:'Selecione um lead.'};
 const db=await getDb();
 const [lead]=await db.select({notes:schema.leads.notes}).from(schema.leads).where(and(eq(schema.leads.id,leadId),eq(schema.leads.orgId,ctx.org.id),eq(schema.leads.ownerId,ctx.user.id)));
 if(!lead)return {error:'Lead não encontrado na sua carteira.'};
 const idx=lead.notes.lastIndexOf('[Assistente comercial');
 if(idx<0)return {error:'Nenhum rascunho preparado pela inteligência para este lead. Gere a preparação em Inteligência comercial primeiro.'};
 const jsonLine=lead.notes.slice(idx).split('\n').find(l=>l.trim().startsWith('{'));
 if(!jsonLine)return {error:'Rascunho não encontrado nas notas.'};
 try{
  const data=JSON.parse(jsonLine) as {draft?:unknown};
  const draft=typeof data.draft==='string'?data.draft.trim():'';
  if(!draft)return {error:'A preparação deste lead não tem texto (ex.: pedido de não contato).'};
  return {text:draft.slice(0,2000)};
 }catch{return {error:'Não foi possível ler o rascunho preparado.'};}
}
export async function revokeVoiceAction():Promise<void>{
 const ctx=await requireOrg();const scope=assertWhatsAppAccess(ctx);
 await (await getDb()).update(schema.voiceProfiles).set({enabled:false}).where(and(eq(schema.voiceProfiles.orgId,scope.orgId),eq(schema.voiceProfiles.userId,scope.userId)));
 revalidatePath('/whatsapp');
}

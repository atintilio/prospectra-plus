'use server';
import {revalidatePath} from 'next/cache';
import {and,eq} from 'drizzle-orm';
import {requireOrg} from '@/lib/auth';
import {getDb,schema} from '@/db';
import {assertWhatsAppAccess, type Scope} from '@/lib/whatsapp/akg';
import {VoiceStudioGateway,voiceConfig} from '@/lib/voice/voicestudio';
import {queueVoiceDelivery,saveVoiceProfile,claimVoiceRegistration} from '@/lib/voice/delivery';
type State={message:string};

/**
 * Escopo do cadastro de voz. A DEMONSTRACAO e liberada aqui de proposito:
 * quem apresenta pode gravar e clonar a propria voz na tela (sem enviar
 * nada para ninguem). O envio continua bloqueado na demo.
 */
function voiceScope(ctx:{user:{id:string;status:string};org:{id:string;active:boolean}}):Scope{
 if(ctx.user.status!=='active'||!ctx.org?.active)throw Error('Conta ou operação sem acesso ativo.');
 return {orgId:ctx.org.id,userId:ctx.user.id};
}
export async function registerVoiceAction(_:State,form:FormData):Promise<State>{
 const ctx=await requireOrg();
 try{
  const scope=voiceScope(ctx),config=voiceConfig();
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
  await queueVoiceDelivery(await getDb(),scope,{id:String(form.get('commandId')??''),recipient:String(form.get('recipient')??''),text:String(form.get('text')??''),kind:'audio'});
  revalidatePath('/whatsapp');return {message:'Áudio na fila. O executor gerará a mensagem com sua voz e fará o envio pelo seu WhatsApp.'};
 }catch{return {message:'Não foi possível solicitar o áudio. Verifique sua voz, o telefone, os limites e a disponibilidade do executor.'};}
}
/**
 * Apaga tudo da minha voz: o perfil clonado e a fila de audio. Usado para
 * deixar a operacao limpa antes de outra pessoa gravar a propria voz.
 */
export async function deleteVoiceProfileAction():Promise<void>{
 const ctx=await requireOrg();const db=await getDb();
 const scope={orgId:ctx.org.id,userId:ctx.user.id};
 await db.transaction(async tx=>{
  await tx.delete(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId,scope.orgId),eq(schema.voiceProfiles.userId,scope.userId)));
  await tx.delete(schema.voiceJobs).where(and(eq(schema.voiceJobs.orgId,scope.orgId),eq(schema.voiceJobs.userId,scope.userId)));
 });
 revalidatePath('/whatsapp');
}
export async function revokeVoiceAction():Promise<void>{
 const ctx=await requireOrg();const scope=assertWhatsAppAccess(ctx);
 await (await getDb()).update(schema.voiceProfiles).set({enabled:false}).where(and(eq(schema.voiceProfiles.orgId,scope.orgId),eq(schema.voiceProfiles.userId,scope.userId)));
 revalidatePath('/whatsapp');
}

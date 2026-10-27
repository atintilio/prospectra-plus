import 'server-only';
import {and,desc,eq,gte,sql} from 'drizzle-orm';
import {z} from 'zod';
import {schema,type DB} from '@/db';
import {sendWhatsAppCommand} from '@/lib/whatsapp/commands';
import type {Scope} from '@/lib/whatsapp/akg';
const inputSchema=z.object({id:z.string().uuid(),recipient:z.string().trim().regex(/^\+?[1-9]\d{7,14}$/),text:z.string().trim().min(1).max(2000),kind:z.enum(['audio','call'])});

async function authorize(db:DB,scope:Scope){
 const [user]=await db.select().from(schema.users).where(eq(schema.users.id,scope.userId));
 const [membership]=await db.select({org:schema.orgs,role:schema.memberships.role}).from(schema.orgs).leftJoin(schema.memberships,and(eq(schema.memberships.orgId,schema.orgs.id),eq(schema.memberships.userId,scope.userId))).where(eq(schema.orgs.id,scope.orgId));
 if(!user||user.status!=='active'||!membership?.org.active||!membership.org.aiEnabled||membership.org.isDemo||(!membership.role&&user.platformRole!=='admin'))throw Error('Voz automática indisponível nesta operação.');
 return user;
}
export async function authorizedVoiceProfile(db:DB,scope:Scope){
 const user=await authorize(db,scope);
 const [profile]=await db.select().from(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId,scope.orgId),eq(schema.voiceProfiles.userId,scope.userId),eq(schema.voiceProfiles.enabled,true)));
 if(!profile)throw Error('Cadastre e autorize a sua voz antes de enviar.');
 return {user,profile};
}
export async function claimVoiceRegistration(db:DB,scope:Scope){
 return db.transaction(async tx=>{
  await tx.select().from(schema.users).where(eq(schema.users.id,scope.userId)).for('update');
  await authorize(tx as unknown as DB,scope);
  const today=new Date();today.setUTCHours(0,0,0,0);
  const [count]=await tx.select({n:sql<number>`count(*)::int`}).from(schema.voiceRegistrations).where(and(eq(schema.voiceRegistrations.userId,scope.userId),gte(schema.voiceRegistrations.createdAt,today)));
  if(count.n>=5)throw Error('Limite diário de cadastro de voz atingido.');
  await tx.insert(schema.voiceRegistrations).values(scope);
 });
}
/** ID externo vem exclusivamente da resposta autenticada do Voice Studio, nunca do formulário. */
export async function saveVoiceProfile(db:DB,scope:Scope,externalId:string,engine:string,consent:boolean){
 if(consent!==true)throw Error('Autorização de voz necessária.');
 z.string().regex(/^[a-f0-9]{8}$/).parse(externalId);z.string().trim().min(1).max(100).parse(engine);
 await authorize(db,scope);
 await db.insert(schema.voiceProfiles).values({...scope,externalId,engine,consentAt:new Date()}).onConflictDoUpdate({target:[schema.voiceProfiles.orgId,schema.voiceProfiles.userId],set:{externalId,engine,enabled:true,consentAt:new Date()}});
}
export async function queueVoiceDelivery(db:DB,scope:Scope,input:unknown){
 const command=inputSchema.parse(input);
 return db.transaction(async tx=>{
  await tx.select().from(schema.users).where(eq(schema.users.id,scope.userId)).for('update');
  const {user,profile}=await authorizedVoiceProfile(tx as unknown as DB,scope);
  const [prior]=await tx.select().from(schema.voiceJobs).where(eq(schema.voiceJobs.id,command.id));
  if(prior){if(prior.orgId!==scope.orgId||prior.userId!==scope.userId||prior.recipient!==command.recipient||prior.text!==command.text||prior.kind!==command.kind)throw Error('Comando de voz inválido.');return prior;}
  const today=new Date();today.setUTCHours(0,0,0,0);
  const [count]=await tx.select({n:sql<number>`count(*)::int`}).from(schema.voiceJobs).where(and(eq(schema.voiceJobs.userId,scope.userId),gte(schema.voiceJobs.createdAt,today)));
  if(count.n>=Math.max(0,Math.min(user.dailyMessages,100)))throw Error('Limite diário de voz atingido.');
  const [job]=await tx.insert(schema.voiceJobs).values({...scope,...command,profileId:profile.externalId,state:command.kind==='call'?'waiting_transport':'queued'}).returning();
  return job;
 });
}

type VoiceGenerator={engineId:string;generate:(input:{profileId:string;text:string})=>Promise<Blob>};
/** Executar em worker persistente. A referência nunca é compartilhada entre vendedores. */
export async function executeVoiceDelivery(db:DB,id:string,scope:Scope,voice:VoiceGenerator,send:(scope:Scope,phone:string,audio:Blob)=>Promise<{providerMessageId:string}>){
 const [job]=await db.select().from(schema.voiceJobs).where(and(eq(schema.voiceJobs.id,id),eq(schema.voiceJobs.orgId,scope.orgId),eq(schema.voiceJobs.userId,scope.userId)));
 if(!job)throw Error('Comando de voz não encontrado.');
 if(job.kind==='call')return 'waiting_transport';
 const {user,profile}=await authorizedVoiceProfile(db,scope);
 if(profile.externalId!==job.profileId||profile.engine!==voice.engineId)throw Error('O perfil de voz foi alterado. Prepare uma nova mensagem.');
 const receipt=await sendWhatsAppCommand(db,scope,{id,recipient:job.recipient,text:`voice:${profile.externalId}:${profile.engine}:${job.text}`},user.dailyMessages,async(s,phone)=>{
  const audio=await voice.generate({profileId:profile.externalId,text:job.text});
  const current=await authorizedVoiceProfile(db,scope);
  if(current.profile.externalId!==profile.externalId||current.profile.engine!==profile.engine)throw Error('Voz alterada durante a geração.');
  return send(s,phone,audio);
 });
 const state=receipt.state==='sent'?'sent':'unknown';
 await db.update(schema.voiceJobs).set({state}).where(eq(schema.voiceJobs.id,id));
 return state;
}
export async function listVoiceJobs(db:DB,scope:Scope){
 await authorize(db,scope);
 return db.select().from(schema.voiceJobs).where(and(eq(schema.voiceJobs.orgId,scope.orgId),eq(schema.voiceJobs.userId,scope.userId))).orderBy(desc(schema.voiceJobs.createdAt)).limit(20);
}

import 'server-only';
import {sessionWebhookSecret} from '@/lib/whatsapp/webhook-signing';
export {sessionWebhookSecret} from '@/lib/whatsapp/webhook-signing';
import {and,eq,lte} from 'drizzle-orm';
import {schema,type DB} from '@/db';
import {sessionIdFor} from '@/lib/whatsapp/akg';
import {receiveHarveyMessage,verifyHarveySignature,handoffCommercialFlow} from '@/lib/harvey-operations';
import {optOut} from '@/lib/harvey';
export async function ingestHarveyWebhook(db:DB,body:string,signature:string|null,master:string|undefined,now=new Date()){
 if(!master||body.length>128000)throw Error('WEBHOOK_UNAUTHORIZED');
 let payload;try{payload=JSON.parse(body);}catch{throw Error('WEBHOOK_INVALID');}
 if(typeof payload?.sessionId!=='string'||payload.sessionId.length>100)throw Error('WEBHOOK_UNAUTHORIZED');
 if(!verifyHarveySignature(body,signature,sessionWebhookSecret(master,payload.sessionId)))throw Error('WEBHOOK_UNAUTHORIZED');
 const at=typeof payload.timestamp==='string'?Date.parse(payload.timestamp):NaN;
 if(!Number.isFinite(at)||Math.abs(now.getTime()-at)>5*60000)throw Error('WEBHOOK_EXPIRED');
 const data=payload.data;
 if(payload.event!=='message.received'||!data||data.key?.fromMe!==false||data.isGroup===true||data.chatType==='group')return {ignored:true};
 if(typeof data.key.id!=='string'||!data.key.id||data.key.id.length>200)throw Error('WEBHOOK_INVALID');
 const jid=data.key.remoteJid;
 if(typeof jid!=='string'||!/^\d{7,20}@(s\.whatsapp\.net|lid)$/.test(jid))return {ignored:true};
 const profiles=await db.select().from(schema.commercialProfiles);
 const profile=profiles.find(p=>sessionIdFor(p)===payload.sessionId);
 if(!profile)throw Error('WEBHOOK_PROFILE_REQUIRED');
 const [account]=await db.select({active:schema.orgs.active,demo:schema.orgs.isDemo,status:schema.users.status}).from(schema.memberships).innerJoin(schema.orgs,eq(schema.orgs.id,schema.memberships.orgId)).innerJoin(schema.users,eq(schema.users.id,schema.memberships.userId)).where(and(eq(schema.memberships.orgId,profile.orgId),eq(schema.memberships.userId,profile.userId)));
 if(!account?.active||account.demo||account.status!=='active')throw Error('WEBHOOK_UNAUTHORIZED');
 const unresolved=jid.endsWith('@lid');const phone=unresolved?jid:jid.split('@')[0];
 const [conversation]=unresolved?[]:await db.select().from(schema.harveyConversations).where(and(eq(schema.harveyConversations.orgId,profile.orgId),eq(schema.harveyConversations.userId,profile.userId),eq(schema.harveyConversations.phone,phone)));
 if(!unresolved&&phone!==profile.sellerPhone&&(!conversation||at<conversation.approvedAt.getTime()-1000))return {ignored:true};
 const text=data.type==='TEXT'&&typeof data.content==='string'?data.content.slice(0,4000):'[Mensagem de mídia recebida; revisão humana necessária]';
 if(!text.trim())return {ignored:true};
 await db.transaction(async tx=>{
  const [inserted]=await tx.insert(schema.harveyInboundJobs).values({orgId:profile.orgId,userId:profile.userId,providerId:data.key.id,phone,text,state:unresolved?'review':'queued',error:unresolved?'Identificador WhatsApp sem telefone confirmado. Confira a conversa antes de associar ao CRM.':null}).onConflictDoNothing().returning();
  if(inserted&&conversation)await tx.update(schema.harveyOutbox).set({state:'cancelled'}).where(and(eq(schema.harveyOutbox.conversationId,conversation.id),eq(schema.harveyOutbox.kind,'lead'),eq(schema.harveyOutbox.state,'pending')));
 });
 // An opt-out never waits for the AI queue or its scheduling interval.
 if(conversation&&optOut.test(text)){
  await receiveHarveyMessage(db,profile,{providerId:data.key.id,phone,text});
  await db.update(schema.harveyInboundJobs).set({state:'completed'}).where(and(eq(schema.harveyInboundJobs.orgId,profile.orgId),eq(schema.harveyInboundJobs.userId,profile.userId),eq(schema.harveyInboundJobs.providerId,data.key.id)));
 }
 return {received:true};
}
// Acknowledge callbacks after persistence, without waiting for an AI request.
export async function processHarveyInbound(db:DB){
 const stale=await db.update(schema.harveyInboundJobs).set({state:'review',error:'Análise interrompida. Conferência humana necessária.'}).where(and(eq(schema.harveyInboundJobs.state,'processing'),lte(schema.harveyInboundJobs.claimedAt,new Date(Date.now()-2*60000)))).returning();
 for(const job of stale){const [lead]=await db.select().from(schema.harveyConversations).where(and(eq(schema.harveyConversations.orgId,job.orgId),eq(schema.harveyConversations.userId,job.userId),eq(schema.harveyConversations.phone,job.phone)));if(lead)await db.transaction(async tx=>{await handoffCommercialFlow(tx as unknown as DB,job,lead.leadId,'unexpected',['atintilio@argusprime.com.br','mloro@argusprime.com.br'],'Processamento interrompido; conferir a mensagem recebida.');});}
 const job=await db.transaction(async tx=>{const [row]=await tx.select().from(schema.harveyInboundJobs).where(eq(schema.harveyInboundJobs.state,'queued')).orderBy(schema.harveyInboundJobs.createdAt).limit(1).for('update',{skipLocked:true});if(!row)return null;await tx.update(schema.harveyInboundJobs).set({state:'processing',claimedAt:new Date()}).where(eq(schema.harveyInboundJobs.id,row.id));return row;});
 if(!job)return {processed:0};
 try{await receiveHarveyMessage(db,job,{providerId:job.providerId,phone:job.phone,text:job.text});await db.update(schema.harveyInboundJobs).set({state:'completed'}).where(eq(schema.harveyInboundJobs.id,job.id));}
 catch{await db.update(schema.harveyInboundJobs).set({state:'review',error:'Não foi possível analisar a resposta; confira o acesso e a conversa.'}).where(eq(schema.harveyInboundJobs.id,job.id));}
 return {processed:1};
}

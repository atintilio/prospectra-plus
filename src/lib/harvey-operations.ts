import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {and,eq,inArray,lte,sql} from 'drizzle-orm';
import {z} from 'zod';
import {schema,type DB} from '@/db';
import {commercialInputSchema,generateCommercial,optOut,routeHandoff} from '@/lib/harvey';
import {sendWhatsAppCommand} from '@/lib/whatsapp/commands';
import {AkgGateway,akgConfig,type Scope} from '@/lib/whatsapp/akg';
import {sendCommercialNotification,mailerConfigured} from '@/lib/mailer';
import {getLeadCommunicationProfile,communicationContext} from '@/lib/communication';
import {commercialMessage,communicationQuestion} from '@/lib/communication-copy';
import {requestMeeting,meetingHandoffNote,meetingSchedulerLink} from '@/lib/scheduling';

const phoneSchema=z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).transform(v=>v.replace(/^\+/,''));
export const commercialProfileSchema=commercialInputSchema.pick({sellerName:true,strategy:true,offers:true}).extend({companyName:z.string().trim().min(1).max(200),sellerPhone:phoneSchema}).strict();
export type CommercialProfile=z.infer<typeof commercialProfileSchema>;
const approvalSchema=z.object({leadId:z.string().uuid(),phone:phoneSchema,qualification:z.string().trim().min(10).max(2000),approved:z.literal(true)}).strict();
const conversationWhere=(scope:Scope)=>and(eq(schema.harveyConversations.orgId,scope.orgId),eq(schema.harveyConversations.userId,scope.userId));
async function access(db:DB,scope:Scope){
 const [row]=await db.select({org:schema.orgs,user:schema.users}).from(schema.memberships).innerJoin(schema.orgs,eq(schema.orgs.id,schema.memberships.orgId)).innerJoin(schema.users,eq(schema.users.id,schema.memberships.userId)).where(and(eq(schema.memberships.orgId,scope.orgId),eq(schema.memberships.userId,scope.userId)));
 if(!row||!row.org.active||row.org.isDemo||row.user.status!=='active')throw Error('Operação sem acesso ativo.');
 return row;
}
export async function saveCommercialProfile(db:DB,scope:Scope,raw:unknown){
 await access(db,scope);const profile=commercialProfileSchema.parse(raw);
 await db.insert(schema.commercialProfiles).values({...scope,...profile}).onConflictDoUpdate({target:[schema.commercialProfiles.orgId,schema.commercialProfiles.userId],set:{...profile,updatedAt:new Date()}});
 return profile;
}
export async function approveConversation(db:DB,scope:Scope,raw:unknown){
 const {org}=await access(db,scope);if(!org.aiEnabled)throw Error('A IA está desligada nesta operação.');
 const input=approvalSchema.parse(raw);
 return db.transaction(async tx=>{
  const [lead]=await tx.select().from(schema.leads).where(and(eq(schema.leads.id,input.leadId),eq(schema.leads.orgId,scope.orgId),eq(schema.leads.ownerId,scope.userId))).for('update');
  if(!lead||['do_not_contact','won','lost'].includes(lead.stage))throw Error('Lead indisponível para esta operação.');
  const [saved]=await tx.select().from(schema.commercialProfiles).where(and(eq(schema.commercialProfiles.orgId,scope.orgId),eq(schema.commercialProfiles.userId,scope.userId)));
  if(!saved)throw Error('Salve primeiro o perfil comercial e as ofertas.');
  const profile=commercialProfileSchema.parse({sellerName:saved.sellerName,companyName:saved.companyName,sellerPhone:saved.sellerPhone,strategy:saved.strategy,offers:saved.offers});
  if(input.phone===profile.sellerPhone)throw Error('O telefone do lead deve ser diferente do telefone interno do vendedor.');
  const [existing]=await tx.select().from(schema.harveyConversations).where(and(eq(schema.harveyConversations.orgId,scope.orgId),eq(schema.harveyConversations.leadId,lead.id)));
  if(existing)throw Error('Este lead já tem um fluxo aprovado; encerre ou acompanhe o fluxo existente.');
  const communication=communicationContext(await getLeadCommunicationProfile(tx as unknown as DB,scope,lead.id));
  const [conversation]=await tx.insert(schema.harveyConversations).values({...scope,leadId:lead.id,phone:input.phone,qualification:input.qualification,profile:{...profile,communication}}).returning();
  await tx.insert(schema.harveyOutbox).values({conversationId:conversation.id,kind:'lead',recipient:input.phone,body:commercialMessage(`Olá, ${lead.fullName}. Sou ${profile.sellerName}, da ${profile.companyName}.`,profile.offers[0].description,communicationQuestion('permission',communication),communication)});
  await tx.update(schema.leads).set({qualification:input.qualification,notes:sql`${schema.leads.notes} || ${'\n[Qualificação comercial aprovada] '+input.qualification}`,lastActivityAt:new Date()}).where(eq(schema.leads.id,lead.id));
  // Approval gives Harvey exclusive automation ownership for this lead.
  await stopCadence(tx as unknown as DB,scope.orgId,lead.id);
  return conversation;
 });
}
async function stopCadence(db:DB,orgId:string,leadId:string){
 await db.update(schema.enrollments).set({state:'stopped'}).where(and(eq(schema.enrollments.orgId,orgId),eq(schema.enrollments.leadId,leadId),inArray(schema.enrollments.state,['running','waiting_accept'])));
 await db.update(schema.actions).set({status:'skipped'}).where(and(eq(schema.actions.orgId,orgId),eq(schema.actions.leadId,leadId),eq(schema.actions.status,'pending')));
}
type Conversation=typeof schema.harveyConversations.$inferSelect;
async function handoff(db:DB,conversation:Conversation,reason:string,topic:'commercial'|'growth'|'unknown',text:string){
 const blocked=reason==='opt_out';const recipients=routeHandoff(topic);
 const summary=`${reason==='interested'?'Interesse declarado':blocked?'Pedido de interrupção':'Revisão comercial necessária'}: ${text.slice(0,2000)}`;
 await db.update(schema.harveyConversations).set({state:blocked?'stopped':'handoff',summary,recipients,nextReminderAt:blocked?null:new Date(Date.now()+2*86400000)}).where(eq(schema.harveyConversations.id,conversation.id));
 await db.update(schema.harveyOutbox).set({state:'cancelled'}).where(and(eq(schema.harveyOutbox.conversationId,conversation.id),eq(schema.harveyOutbox.kind,'lead'),eq(schema.harveyOutbox.state,'pending')));
 await stopCadence(db,conversation.orgId,conversation.leadId);
 await db.update(schema.leads).set({...(blocked?{stage:'do_not_contact' as const}:{stage:'replied' as const}),notes:sql`${schema.leads.notes} || ${'\n[Assistente comercial · passagem humana] '+summary}`,lastActivityAt:new Date()}).where(and(eq(schema.leads.id,conversation.leadId),eq(schema.leads.orgId,conversation.orgId)));
 const [lead]=await db.select().from(schema.leads).where(eq(schema.leads.id,conversation.leadId));
 const body=`${lead?.fullName??'Lead'} · ${lead?.company??''}\n${summary}\nQualificação: ${conversation.qualification}\nEstratégia aprovada: ${conversation.profile.strategy}\nTelefone: ${conversation.phone}\nResponsáveis: ${recipients.join(', ')}\n${blocked?'Nenhum novo contato autorizado.':'Assuma a conversa. O assistente interrompeu as respostas automáticas. Reuniões e condições comerciais dependem da sua confirmação.'}`;
 let emailBody=body;
 if(reason==='interested'){
  // Interesse em reunião: registra o agendamento de forma durável e oferece o caminho de marcação.
  // Complementar: qualquer falha aqui nunca interrompe a passagem humana.
  try{
   await requestMeeting(db,{orgId:conversation.orgId,userId:conversation.userId,leadId:conversation.leadId,conversationId:conversation.id,source:'harvey',note:text});
   emailBody=`${body}\n${meetingHandoffNote(meetingSchedulerLink())}`;
  }catch{/* agendamento é complementar */}
 }
 await db.insert(schema.harveyOutbox).values({conversationId:conversation.id,kind:'email',recipient:recipients.join(','),body:emailBody});
}
export async function handoffCommercialFlow(db:DB,scope:Scope,leadId:string,reason:string,recipients:string[],summary:string){
 const [row]=await db.select().from(schema.harveyConversations).where(and(conversationWhere(scope),eq(schema.harveyConversations.leadId,leadId))).for('update');
 if(row&&!['handoff','stopped'].includes(row.state))await handoff(db,row,reason,recipients.length>1?'unknown':recipients[0]==='mloro@argusprime.com.br'?'growth':'commercial',summary);
}
export async function closeHarveyConversation(db:DB,scope:Scope,id:string){
 await access(db,scope);
 await db.transaction(async tx=>{
  const [row]=await tx.select().from(schema.harveyConversations).where(and(conversationWhere(scope),eq(schema.harveyConversations.id,z.string().uuid().parse(id)))).for('update');
  if(!row)throw Error('Conversa indisponível.');
  await tx.update(schema.harveyConversations).set({state:'stopped',nextReminderAt:null}).where(eq(schema.harveyConversations.id,id));
  await tx.update(schema.harveyOutbox).set({state:'cancelled'}).where(and(eq(schema.harveyOutbox.conversationId,id),eq(schema.harveyOutbox.state,'pending')));
 });
}
export async function receiveHarveyMessage(db:DB,scope:Scope,raw:{providerId:string;phone:string;text:string}){
 const input=z.object({providerId:z.string().min(1).max(200),phone:phoneSchema,text:z.string().min(1).max(4000)}).parse(raw);
 const {org,user}=await access(db,scope);
 if(await receiveSellerUpdate(db,scope,input))return;
 const claim=await db.transaction(async tx=>{
  const [row]=await tx.select().from(schema.harveyConversations).where(and(conversationWhere(scope),eq(schema.harveyConversations.phone,input.phone))).for('update');
  if(!row)return null;
  const [ownedLead]=await tx.select().from(schema.leads).where(and(eq(schema.leads.id,row.leadId),eq(schema.leads.orgId,scope.orgId),eq(schema.leads.ownerId,scope.userId)));
  if(!ownedLead){
   await tx.update(schema.harveyConversations).set({state:'stopped',nextReminderAt:null}).where(eq(schema.harveyConversations.id,row.id));
   await tx.update(schema.harveyOutbox).set({state:'cancelled'}).where(and(eq(schema.harveyOutbox.conversationId,row.id),eq(schema.harveyOutbox.state,'pending')));
   return null;
  }
  const [receipt]=await tx.insert(schema.harveyInbox).values({conversationId:row.id,providerId:input.providerId,text:input.text}).onConflictDoNothing().returning();
  if(!receipt)return null;
  // Opt-out is processed even after human handoff or while AI is disabled.
  if(optOut.test(input.text)){await handoff(tx as unknown as DB,row,'opt_out','unknown',input.text);return null;}
  if(['handoff','stopped'].includes(row.state))return null;
  if(row.state==='processing'){await handoff(tx as unknown as DB,row,'unexpected','unknown',input.text);return null;}
  if(!org.aiEnabled){await handoff(tx as unknown as DB,row,'unexpected','unknown','IA desligada; resposta recebida: '+input.text);return null;}
  await tx.update(schema.harveyOutbox).set({state:'cancelled'}).where(and(eq(schema.harveyOutbox.conversationId,row.id),eq(schema.harveyOutbox.kind,'lead'),eq(schema.harveyOutbox.state,'pending')));
  await tx.update(schema.harveyConversations).set({state:'processing',turns:row.turns+1}).where(eq(schema.harveyConversations.id,row.id));
  await tx.insert(schema.events).values({...scope,leadId:row.leadId,type:'reply_received'});
  return row;
 });
 if(!claim)return;
 const [lead]=await db.select().from(schema.leads).where(and(eq(schema.leads.id,claim.leadId),eq(schema.leads.orgId,scope.orgId),eq(schema.leads.ownerId,scope.userId)));
 let result:{draft:string;handoff:null|{reason:string;recipients:string[]}};
 const interested=/\b(interess|reuni[aã]o|agendar|marcar|proposta|pre[cç]o|contratar|comprar|or[cç]amento|pode[ms]? conversar)/i.test(input.text);
 const technical=input.text.startsWith('[Mensagem de mídia recebida;')||/\b(api|integra[cç][aã]o|seguran[cç]a|lgpd|t[eé]cnic|implementa[cç][aã]o)/i.test(input.text);
 const growth=/marketing|crescimento|dados|growth/i.test(input.text);
 const commercial=/comercial|estrat[eé]gia|negocia[cç][aã]o|administra[cç][aã]o/i.test(input.text);
 const topic=growth&&!commercial?'growth':commercial&&!growth?'commercial':'unknown';
 try{
  if(!lead||['do_not_contact','won','lost'].includes(lead.stage))throw Error('LEAD_UNAVAILABLE');
  if(interested||technical||claim.turns>=2)result={draft:'',handoff:{reason:interested?'interested':technical?'technical':'unexpected',recipients:routeHandoff(technical?'unknown':topic)}};
  else result=await generateCommercial({userId:user.id,status:user.status,orgId:org.id,orgActive:org.active,aiEnabled:org.aiEnabled},{sellerName:claim.profile.sellerName,strategy:claim.profile.strategy,offers:claim.profile.offers,inbound:input.text,lead:{id:lead.id,orgId:lead.orgId,ownerId:lead.ownerId,fullName:lead.fullName,company:lead.company,headline:lead.headline,stage:lead.stage}},claim.profile.communication);
 }catch{result={draft:'',handoff:{reason:'unexpected',recipients:routeHandoff('unknown')}};}
 await db.transaction(async tx=>{
  const [current]=await tx.select().from(schema.harveyConversations).where(eq(schema.harveyConversations.id,claim.id)).for('update');
  if(current?.state!=='processing')return;
  if(result.handoff){const recipients=result.handoff.recipients;await handoff(tx as unknown as DB,current,result.handoff.reason,recipients.length>1?'unknown':recipients[0]==='mloro@argusprime.com.br'?'growth':'commercial',input.text);}
  else{
   await tx.update(schema.harveyConversations).set({state:'active',summary:input.text}).where(eq(schema.harveyConversations.id,claim.id));
   await tx.insert(schema.harveyOutbox).values({conversationId:claim.id,kind:'lead',recipient:claim.phone,body:result.draft});
  }
 });
}
function updateTopic(text:string):'commercial'|'growth'|'unknown'{
 const growth=/marketing|crescimento|dados|growth/i.test(text),commercial=/comercial|estrat[eé]gia|negocia[cç][aã]o|administra[cç][aã]o|proposta|pre[cç]o|contrato/i.test(text);
 return growth&&!commercial?'growth':commercial&&!growth?'commercial':'unknown';
}
async function receiveSellerUpdate(db:DB,scope:Scope,input:{providerId:string;phone:string;text:string}){
 const [profile]=await db.select().from(schema.commercialProfiles).where(and(eq(schema.commercialProfiles.orgId,scope.orgId),eq(schema.commercialProfiles.userId,scope.userId)));
 if(!profile||profile.sellerPhone!==input.phone)return false;
 await db.transaction(async tx=>{
  const rows=await tx.select().from(schema.harveyConversations).where(and(conversationWhere(scope),eq(schema.harveyConversations.state,'handoff'))).for('update');
  const code=input.text.match(/\bC-([a-f0-9]{8})\b/i)?.[1]?.toLowerCase();
  const matches=code?rows.filter(row=>row.id.startsWith(code)):rows.length===1?rows:[];
  const selected=matches.length===1?matches[0]:null;
  const [receipt]=await tx.insert(schema.harveySellerInbox).values({...scope,conversationId:selected?.id??null,providerId:input.providerId,text:input.text}).onConflictDoNothing().returning();
  if(!receipt)return;
  if(!selected){
   if(rows.length){
    // This transport container only provides the seller/session. The reply ledger remains unassociated.
    const carrier=rows[0];
    const options=await Promise.all(rows.slice(0,10).map(async row=>{const [lead]=await tx.select().from(schema.leads).where(eq(schema.leads.id,row.leadId));return `C-${row.id.slice(0,8)}: ${lead?.fullName??'lead'}`;}));
    await tx.insert(schema.harveyOutbox).values({conversationId:carrier.id,kind:'internal',recipient:profile.sellerPhone,body:`Para registrar a evolução na oportunidade certa, responda com o código e sua atualização.\n${options.join('\n')}\nA atualização recebida ainda não foi atribuída a uma oportunidade.`});
   }
   return;
  }
  const [lead]=await tx.select().from(schema.leads).where(and(eq(schema.leads.id,selected.leadId),eq(schema.leads.ownerId,scope.userId),eq(schema.leads.orgId,scope.orgId)));
  if(!lead)return;
  const body=`Atualização do vendedor ${profile.sellerName} · ${lead.fullName} · C-${selected.id.slice(0,8)}\n${input.text}\nContexto anterior: ${selected.summary}\nO contato automático com o lead permanece interrompido.`;
  await tx.update(schema.leads).set({notes:sql`${schema.leads.notes} || ${'\n[Atualização do vendedor] '+input.text}`,lastActivityAt:new Date()}).where(eq(schema.leads.id,lead.id));
  await tx.insert(schema.harveyOutbox).values({conversationId:selected.id,kind:'email',recipient:routeHandoff(updateTopic(input.text)).join(','),body});
 });
 return true;
}
export function verifyHarveySignature(body:string,signature:string|null,secret:string|undefined){
 if(!secret||!signature||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 const expected=createHmac('sha256',secret).update(body).digest();
 return timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex'));
}
export async function runHarveyQueue(db:DB,deps:{send?:(scope:Scope,recipient:string,text:string)=>Promise<{providerMessageId:string}>;email?:(recipients:string[],body:string)=>Promise<void>;now?:Date;maxJobs?:number;conversationId?:string}={}){
 const now=deps.now??new Date();const config=akgConfig();
 await db.update(schema.harveyOutbox).set({state:'unknown',error:'Processamento interrompido; confirme a entrega antes de reenviar.'}).where(and(eq(schema.harveyOutbox.state,'processing'),lte(schema.harveyOutbox.claimedAt,new Date(now.getTime()-20*60000))));
 const gateway=config?new AkgGateway(config):null;
 const send=deps.send??(gateway?gateway.sendText.bind(gateway):null);
 const email=deps.email??sendCommercialNotification;
 const emailReady=Boolean(deps.email)||mailerConfigured();
 const availableKinds:('lead'|'internal'|'email')[]=[...(send?['lead' as const,'internal' as const]:[]),...(emailReady?['email' as const]:[])];
 // One reminder per due handoff, claimed together with advancing its due date.
 await db.transaction(async tx=>{
  const due=await tx.select().from(schema.harveyConversations).where(and(eq(schema.harveyConversations.state,'handoff'),lte(schema.harveyConversations.nextReminderAt,now))).limit(20).for('update',{skipLocked:true});
  for(const row of due){
   const [lead]=await tx.select().from(schema.leads).where(eq(schema.leads.id,row.leadId));
   await tx.insert(schema.harveyOutbox).values({conversationId:row.id,kind:'internal',recipient:row.profile.sellerPhone,body:`${row.profile.sellerName}, como evoluiu a conversa com ${lead?.fullName??'o lead'}? Responda com C-${row.id.slice(0,8)} e a atualização. Precisa de ajuda com a próxima etapa? O contato automático com o lead continua parado.`,dueAt:now});
   await tx.update(schema.harveyConversations).set({nextReminderAt:new Date(now.getTime()+2*86400000)}).where(eq(schema.harveyConversations.id,row.id));
  }
 });
 let processed=0;
 for(let i=0;i<Math.min(deps.maxJobs??10,10)&&availableKinds.length;i++){
  const job=await db.transaction(async tx=>{
   const [row]=await tx.select().from(schema.harveyOutbox).where(and(eq(schema.harveyOutbox.state,'pending'),lte(schema.harveyOutbox.dueAt,now),inArray(schema.harveyOutbox.kind,availableKinds),deps.conversationId?eq(schema.harveyOutbox.conversationId,deps.conversationId):undefined)).orderBy(schema.harveyOutbox.createdAt).limit(1).for('update',{skipLocked:true});
   if(!row)return null;
   const [conversation]=await tx.select().from(schema.harveyConversations).where(eq(schema.harveyConversations.id,row.conversationId));
   if(!conversation)return null;
   const [lead]=await tx.select().from(schema.leads).where(eq(schema.leads.id,conversation.leadId));
   let account;try{account=await access(tx as unknown as DB,{orgId:conversation.orgId,userId:conversation.userId});}catch{}
   const invalid=!account||!lead||lead.ownerId!==conversation.userId||lead.orgId!==conversation.orgId||(row.kind==='lead'&&(!account.org.aiEnabled||conversation.state!=='active'||['do_not_contact','won','lost'].includes(lead.stage)))||(row.kind==='internal'&&conversation.state!=='handoff');
   if(invalid){await tx.update(schema.harveyOutbox).set({state:'cancelled'}).where(eq(schema.harveyOutbox.id,row.id));return {skip:true as const};}
   // Leave pending while external transport is unconfigured; no false delivery receipt.
   if(row.kind!=='email'&&!send)return {skip:true as const};
   await tx.update(schema.harveyOutbox).set({state:'processing',claimedAt:now}).where(eq(schema.harveyOutbox.id,row.id));
   return {skip:false as const,row,conversation,limit:account!.user.dailyMessages};
  });
  if(!job)break;if(job.skip)continue;
  const {row,conversation}=job;let state:'sent'|'unknown'='unknown';let error:string|null=null;
  if(row.kind!=='email'&&!deps.send){
   let connected=false;try{connected=(await gateway!.status({orgId:conversation.orgId,userId:conversation.userId})).state==='connected';}catch{}
   if(!connected){
    await db.update(schema.harveyOutbox).set({state:'pending',claimedAt:null,dueAt:new Date(Date.now()+60000),error:'WhatsApp não conectado; aguardando pareamento.'}).where(eq(schema.harveyOutbox.id,row.id));
    continue;
   }
  }
  try{
   if(row.kind==='email'){await email(row.recipient.split(','),row.body);state='sent';}
   else{
    const result=await sendWhatsAppCommand(db,{orgId:conversation.orgId,userId:conversation.userId},{id:row.id,recipient:row.recipient,text:row.body},job.limit,send!);
    state=result.state==='sent'?'sent':'unknown';
   }
  }catch(e){error=e instanceof Error?e.message.slice(0,300):'Entrega sem confirmação';}
  await db.update(schema.harveyOutbox).set({state,error}).where(eq(schema.harveyOutbox.id,row.id));
  if(state==='sent'&&row.kind==='lead')await db.insert(schema.events).values({orgId:conversation.orgId,userId:conversation.userId,leadId:conversation.leadId,type:'message_sent'});
  processed++;
 }
 return {processed};
}

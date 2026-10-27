import 'server-only';
import {createHash} from 'node:crypto';
import {and,eq,gte,sql} from 'drizzle-orm';
import {z} from 'zod';
import {schema,type DB} from '@/db';
import {type Scope} from './akg';
export const commandSchema=z.object({id:z.string().uuid(),recipient:z.string().trim().regex(/^\+?[1-9]\d{7,14}$/),text:z.string().trim().min(1).max(4000)});
type Result={state:'pending'|'sent'|'unknown';providerMessageId:string|null};
export async function sendWhatsAppCommand(db:DB,scope:Scope,input:unknown,dailyLimit:number,send:(scope:Scope,recipient:string,text:string)=>Promise<{providerMessageId:string}>):Promise<Result>{
 const command=commandSchema.parse(input);
 const hash=createHash('sha256').update(JSON.stringify([command.recipient,command.text])).digest('hex');
 const claim=await db.transaction(async tx=>{
  // Serialize quotas per seller, including concurrent requests from different operations.
  const [user]=await tx.select().from(schema.users).where(eq(schema.users.id,scope.userId)).for('update');
  const [membership]=await tx.select({org:schema.orgs,role:schema.memberships.role}).from(schema.orgs).leftJoin(schema.memberships,and(eq(schema.memberships.orgId,schema.orgs.id),eq(schema.memberships.userId,scope.userId))).where(eq(schema.orgs.id,scope.orgId));
  if(!user||user.status!=='active'||!membership?.org.active||membership.org.isDemo||(!membership.role&&user.platformRole!=='admin'))throw Error('Sem acesso ao WhatsApp desta operação.');
  const [prior]=await tx.select().from(schema.whatsappCommands).where(eq(schema.whatsappCommands.id,command.id));
  if(prior){if(prior.orgId!==scope.orgId||prior.userId!==scope.userId||prior.payloadHash!==hash)throw Error('Comando inválido para esta operação.');return {new:false,row:prior};}
  const today=new Date();today.setUTCHours(0,0,0,0);
  const [count]=await tx.select({n:sql<number>`count(*)::int`}).from(schema.whatsappCommands).where(and(eq(schema.whatsappCommands.userId,scope.userId),gte(schema.whatsappCommands.createdAt,today)));
  if(count.n>=Math.max(0,Math.min(dailyLimit,500)))throw Error('Limite diário de mensagens atingido.');
  const [row]=await tx.insert(schema.whatsappCommands).values({id:command.id,...scope,payloadHash:hash}).returning();
  return {new:true,row};
 });
 if(!claim.new)return {state:claim.row.state,providerMessageId:claim.row.providerMessageId};
 // Receipt is persisted before contacting gateway. Process loss leaves pending for manual reconciliation.
 try {
  const result=await send(scope,command.recipient,command.text);
  await db.update(schema.whatsappCommands).set({state:'sent',providerMessageId:result.providerMessageId}).where(and(eq(schema.whatsappCommands.id,command.id),eq(schema.whatsappCommands.orgId,scope.orgId),eq(schema.whatsappCommands.userId,scope.userId)));
  return {state:'sent',providerMessageId:result.providerMessageId};
 }catch{
  await db.update(schema.whatsappCommands).set({state:'unknown'}).where(eq(schema.whatsappCommands.id,command.id));
  return {state:'unknown',providerMessageId:null};
 }
}

import 'server-only';
import {and,desc,eq,gte,ne,sql} from 'drizzle-orm';
import {z} from 'zod';
import {schema,type DB} from '@/db';

type Scope={orgId:string;userId:string};
const uuid=z.string().uuid();

/** Enfileira análise dos dados existentes; nenhuma chamada externa ou envio ao LinkedIn. */
export async function queueLeadAnalysis(db:DB,scope:Scope,leadId:string,id:string){
 uuid.parse(id);uuid.parse(leadId);
 return db.transaction(async tx=>{
  const [user]=await tx.select().from(schema.users).where(eq(schema.users.id,scope.userId)).for('update');
  const [membership]=await tx.select({org:schema.orgs,role:schema.memberships.role}).from(schema.orgs)
   .leftJoin(schema.memberships,and(eq(schema.memberships.orgId,schema.orgs.id),eq(schema.memberships.userId,scope.userId))).where(eq(schema.orgs.id,scope.orgId));
  if(!user||user.status!=='active'||!membership?.org.active||membership.org.isDemo||(!membership.role&&user.platformRole!=='admin'))throw Error('Sem acesso à análise desta operação.');
  const [lead]=await tx.select().from(schema.leads).where(and(eq(schema.leads.id,leadId),eq(schema.leads.orgId,scope.orgId),eq(schema.leads.ownerId,scope.userId),ne(schema.leads.stage,'do_not_contact')));
  if(!lead)throw Error('Lead indisponível para análise.');
  const [prior]=await tx.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id,id));
  if(prior){if(prior.orgId!==scope.orgId||prior.userId!==scope.userId||prior.leadId!==leadId)throw Error('Solicitação inválida.');return prior;}
  const today=new Date();today.setUTCHours(0,0,0,0);
  const [count]=await tx.select({n:sql<number>`count(*)::int`}).from(schema.intelligenceJobs).where(and(eq(schema.intelligenceJobs.userId,scope.userId),gte(schema.intelligenceJobs.createdAt,today)));
  if(count.n>=100)throw Error('Limite diário de análises atingido.');
  const [row]=await tx.insert(schema.intelligenceJobs).values({...scope,id,leadId}).returning();
  return row;
 });
}

/** O chamador autentica o contexto; a consulta limita operação e vendedor. */
export async function listLeadAnalysis(db:DB,scope:Scope){
 return db.select().from(schema.intelligenceJobs)
  .where(and(eq(schema.intelligenceJobs.orgId,scope.orgId),eq(schema.intelligenceJobs.userId,scope.userId)))
  .orderBy(desc(schema.intelligenceJobs.createdAt)).limit(20);
}

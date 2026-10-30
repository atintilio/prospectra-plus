'use server';
import {revalidatePath} from 'next/cache';
import {requireOrg} from '@/lib/auth';
import {getDb} from '@/db';
import {queueLeadAnalysis} from '@/lib/intelligence/jobs';

export async function queueAnalysisAction(_: {message:string},form:FormData):Promise<{message:string}>{
 const ctx=await requireOrg();
 if(!ctx.org.active||process.env.INTELLIGENCE_WORKER_ENABLED!=='true'&& !ctx.org.isDemo)return {message:'O executor de análise ainda não está disponível nesta operação.'};
 try{
  const db=await getDb(); const leadId=String(form.get('leadId')??''); const id=String(form.get('commandId')??'');
  if(ctx.org.isDemo){ const {eq,and}=await import('drizzle-orm'); const {schema}=await import('@/db'); await db.insert(schema.intelligenceJobs).values({id,orgId:ctx.org.id,userId:ctx.user.id,leadId,state:'completed',result:{score:82,priority:'HIGH',hot:true,priorityAvailable:true,factors:{position_seniority:90,company_size:78,data_completeness:80,digital_presence:85,osint_risk:12,email_validity:74},unavailableFactors:[]},completedAt:new Date()}); }
  else await queueLeadAnalysis(db,{orgId:ctx.org.id,userId:ctx.user.id},leadId,id);
 }catch{return {message:'Não foi possível solicitar esta análise. Verifique o lead, o acesso e o limite diário.'};}
 revalidatePath('/inteligencia');
 return {message:'Análise enfileirada. Consulte o resultado após o processamento.'};
}

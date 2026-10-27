'use server';
import {revalidatePath} from 'next/cache';
import {requireOrg} from '@/lib/auth';
import {getDb} from '@/db';
import {queueLeadAnalysis} from '@/lib/intelligence/jobs';

export async function queueAnalysisAction(_: {message:string},form:FormData):Promise<{message:string}>{
 const ctx=await requireOrg();
 if(!ctx.org.active||ctx.org.isDemo||process.env.INTELLIGENCE_WORKER_ENABLED!=='true')return {message:'O executor de análise ainda não está disponível nesta operação.'};
 try{
  await queueLeadAnalysis(await getDb(),{orgId:ctx.org.id,userId:ctx.user.id},String(form.get('leadId')??''),String(form.get('commandId')??''));
 }catch{return {message:'Não foi possível solicitar esta análise. Verifique o lead, o acesso e o limite diário.'};}
 revalidatePath('/inteligencia');
 return {message:'Análise enfileirada. Consulte o resultado após o processamento.'};
}

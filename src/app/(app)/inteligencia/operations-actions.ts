'use server';
import {revalidatePath} from 'next/cache';
import {after} from 'next/server';
import {getDb} from '@/db';
import {requireOrg} from '@/lib/auth';
import {saveCommercialProfile,approveConversation,closeHarveyConversation,runHarveyQueue} from '@/lib/harvey-operations';
export async function saveProfileAction(raw:unknown){
 try{const ctx=await requireOrg();await saveCommercialProfile(await getDb(),{orgId:ctx.org.id,userId:ctx.user.id},raw);revalidatePath('/inteligencia');return {ok:true};}
 catch(e){return {error:e instanceof Error&&!(e instanceof SyntaxError)?'Não foi possível salvar. Revise os campos e seu acesso.':'Não foi possível salvar.'};}
}
export async function approveHarveyAction(raw:unknown){
 try{const ctx=await requireOrg();const db=await getDb();const conversation=await approveConversation(db,{orgId:ctx.org.id,userId:ctx.user.id},raw);after(async()=>{try{await runHarveyQueue(db,{maxJobs:1,conversationId:conversation.id});}catch{console.error('Approved commercial delivery remains in durable queue.');}});revalidatePath('/inteligencia');revalidatePath('/leads');return {ok:true};}
 catch(e){return {error:e instanceof Error&&!e.message.startsWith('[')&&e.message.length<200?e.message:'Revise o lead, o telefone, a qualificação e a aprovação.'};}
}
export async function stopHarveyAction(id:string){
 try{const ctx=await requireOrg();await closeHarveyConversation(await getDb(),{orgId:ctx.org.id,userId:ctx.user.id},id);revalidatePath('/inteligencia');return {ok:true};}
 catch{return {error:'Não foi possível encerrar esta conversa.'};}
}

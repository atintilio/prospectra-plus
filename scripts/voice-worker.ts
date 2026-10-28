/** Executor persistente: não iniciar em Vercel Functions. Sem áudio/texto/segredos nos logs. */
import {and,asc,eq,lt} from 'drizzle-orm';
import {getDb,schema} from '../src/db';
import {VoiceStudioGateway,voiceConfig} from '../src/lib/voice/voicestudio';
import {AkgGateway,akgConfig} from '../src/lib/whatsapp/akg';
import {executeVoiceDelivery} from '../src/lib/voice/delivery';
import {completeVoiceAction} from '../src/lib/voice/campaign';

async function main(){
 const config=voiceConfig(),gateway=akgConfig();
 if(process.env.VOICE_AUTOMATION_ENABLED!=='true'||!config||!gateway)throw Error('Executor de voz desabilitado ou sem configuração.');
 const db=await getDb(),voice=new VoiceStudioGateway(config),wa=new AkgGateway(gateway);
 let stopped=false;process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
 while(!stopped){
  try{
   // Após perda do processo, jamais repetir um envio potencialmente aceito.
   await db.update(schema.voiceJobs).set({state:'unknown'}).where(and(eq(schema.voiceJobs.state,'running'),lt(schema.voiceJobs.startedAt,new Date(Date.now()-15*60_000))));
   const job=await db.transaction(async tx=>{
    const [row]=await tx.select().from(schema.voiceJobs).where(and(eq(schema.voiceJobs.state,'queued'),eq(schema.voiceJobs.kind,'audio'))).orderBy(asc(schema.voiceJobs.createdAt)).limit(1).for('update',{skipLocked:true});
    if(!row)return null;
    await tx.update(schema.voiceJobs).set({state:'running',startedAt:new Date()}).where(eq(schema.voiceJobs.id,row.id));return row;
   });
   if(job){
    try{
     const state=await executeVoiceDelivery(db,job.id,{orgId:job.orgId,userId:job.userId},voice,(scope,phone,audio)=>wa.sendAudio(scope,phone,audio));
     if(state==='sent')await completeVoiceAction(db,job); // avança a cadência quando o job é de campanha
    }
    catch{await db.update(schema.voiceJobs).set({state:'failed'}).where(eq(schema.voiceJobs.id,job.id));console.error('Trabalho de voz não concluído.');}
   }
  }catch{console.error('Executor de voz temporariamente indisponível.');}
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
}
main().catch(()=>{console.error('Não foi possível iniciar o executor de voz.');process.exitCode=1;});

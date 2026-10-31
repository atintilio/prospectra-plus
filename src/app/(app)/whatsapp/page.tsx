import {requireOrg} from '@/lib/auth';
import {PageHeader} from '@/components/ui';
import {akgConfig} from '@/lib/whatsapp/akg';
import {WhatsAppView} from './view';
import {and,eq} from 'drizzle-orm';
import {getDb,schema} from '@/db';
import {voiceConfig} from '@/lib/voice/voicestudio';
import {listVoiceJobs} from '@/lib/voice/delivery';
import {VoicePanel,VoiceDemoPanel} from './voice-view';
export const metadata={title:'WhatsApp'};
export const maxDuration=60;
export default async function WhatsAppPage(){
 const {org,user}=await requireOrg();
 const enabled=!!akgConfig()&&org.active&&!org.isDemo;
 const voiceAvailable=!!voiceConfig()&&org.active&&org.aiEnabled&&!org.isDemo;
 const db=await getDb();
 const [profile]=await db.select({enabled:schema.voiceProfiles.enabled}).from(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId,org.id),eq(schema.voiceProfiles.userId,user.id)));
 const jobs=org.active&&org.aiEnabled&&!org.isDemo?await listVoiceJobs(db,{orgId:org.id,userId:user.id}):[];
 return <><PageHeader title="WhatsApp" subtitle="Conecte o seu número e envie mensagens pela sua conta no Prospectra."/>
 <WhatsAppView enabled={enabled} seller={user.name||user.email} reason={org.isDemo?'A demonstração não conecta números nem envia mensagens reais.':!org.active?'Esta operação está inativa.':!akgConfig()?'O gateway WA-AKG ainda precisa ser instalado e configurado pelo administrador.':undefined}/>
 {org.isDemo
   ? <VoiceDemoPanel/>
   : <VoicePanel available={voiceAvailable} enabled={voiceAvailable&&enabled&&process.env.VOICE_AUTOMATION_ENABLED==='true'} hasProfile={profile?.enabled===true} commandId={crypto.randomUUID()} jobs={jobs.map(job=>({id:job.id,state:job.state,recipient:job.recipient}))}/>}</>;
}

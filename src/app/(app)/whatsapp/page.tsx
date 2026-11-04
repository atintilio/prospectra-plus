import {requireOrg} from '@/lib/auth';
import {PageHeader} from '@/components/ui';
import {WhatsAppMark} from '@/components/whatsapp-mark';
import {akgConfig} from '@/lib/whatsapp/akg';
import {WhatsAppView} from './view';
import {and,eq} from 'drizzle-orm';
import {getReadDb,schema} from '@/db';
import {voiceConfig} from '@/lib/voice/voicestudio';
import {listVoiceJobs} from '@/lib/voice/delivery';
import {VoicePanel} from './voice-view';
export const metadata={title:'WhatsApp'};
export const maxDuration=60;
export default async function WhatsAppPage(){
 const {org,user}=await requireOrg();
 const enabled=org.active&&(!!akgConfig()||org.isDemo);
 // Cadastro da voz: liberado tambem na DEMONSTRACAO (quem apresenta grava a
 // propria voz). Envio: bloqueado na demo - nada e entregue a ninguem.
 const voiceRecording=!!voiceConfig()&&org.active&&org.aiEnabled;
 const voiceDelivery=voiceRecording&&!org.isDemo;
 const db=await getReadDb();
 const [profile]=await db.select({enabled:schema.voiceProfiles.enabled}).from(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId,org.id),eq(schema.voiceProfiles.userId,user.id)));
 const jobs=org.active&&org.aiEnabled?await listVoiceJobs(db,{orgId:org.id,userId:user.id},{allowDemo:true}):[];
 return <><PageHeader title={<span className="inline-flex items-center gap-2.5"><WhatsAppMark size={28}/>WhatsApp</span>} subtitle="Conecte o seu número e envie mensagens pela sua conta no Prospectra."/>
 <WhatsAppView enabled={enabled} seller={user.name||user.email} reason={org.isDemo?'Demonstração: pareamento, status e envio são simulados; nenhum número real é conectado.':!org.active?'Esta operação está inativa.':!akgConfig()?'O gateway WA-AKG ainda precisa ser instalado e configurado pelo administrador.':undefined}/>
 <VoicePanel available={voiceRecording} deliveryEnabled={voiceDelivery&&enabled&&process.env.VOICE_AUTOMATION_ENABLED==='true'} hasProfile={profile?.enabled===true} commandId={crypto.randomUUID()} demo={org.isDemo} jobs={jobs.map(job=>({id:job.id,state:job.state,recipient:job.recipient}))}/></>;
}

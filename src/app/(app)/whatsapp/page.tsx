import {requireOrg} from '@/lib/auth';
import {PageHeader} from '@/components/ui';
import {akgConfig} from '@/lib/whatsapp/akg';
import {WhatsAppView} from './view';
export const metadata={title:'WhatsApp'};
export const maxDuration=60;
export default async function WhatsAppPage(){
 const {org,user}=await requireOrg();
 const enabled=!!akgConfig()&&org.active&&!org.isDemo;
 return <><PageHeader title="WhatsApp" subtitle="Conecte o seu número e envie mensagens pela sua conta no Prospectra."/>
 <WhatsAppView enabled={enabled} seller={user.name||user.email} reason={org.isDemo?'A demonstração não conecta números nem envia mensagens reais.':!org.active?'Esta operação está inativa.':!akgConfig()?'O gateway WA-AKG ainda precisa ser instalado e configurado pelo administrador.':undefined}/></>;
}

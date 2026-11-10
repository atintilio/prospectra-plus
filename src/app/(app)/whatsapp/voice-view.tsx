'use client';
import {useActionState,useState} from 'react';
import {registerVoiceAction,queueVoiceAction,revokeVoiceAction,deleteVoiceProfileAction} from './voice-actions';
import {WhatsAppMark} from '@/components/whatsapp-mark';
import {VoiceRecorder} from '@/components/voice-recorder';
type Job={id:string;state:string;recipient:string};
const states:Record<string,string>={queued:'Na fila',running:'Gerando e enviando',sent:'Aceito pelo WhatsApp',unknown:'Sem confirmação — confira no WhatsApp',failed:'Não concluído',waiting_transport:'Aguardando transporte de chamadas'};
export function VoicePanel({available,deliveryEnabled,hasProfile,commandId,demo,jobs}:{available:boolean;deliveryEnabled:boolean;hasProfile:boolean;commandId:string;demo:boolean;jobs:Job[]}){
 const [recording,setRecording]=useState<File|null>(null);
 const [registration,register,registering]=useActionState((previous: {message:string},form:FormData)=>{
  if(!recording)return Promise.resolve({message:'Grave sua voz antes de salvar.'});
  form.set('reference',recording);
  return registerVoiceAction(previous,form);
 },{message:''});
 const [delivery,queue,sending]=useActionState(queueVoiceAction,{message:''});
 return <section className="card mt-6 space-y-5 p-6">
  <h2 className="flex items-center gap-2 text-lg font-semibold"><WhatsAppMark size={22}/>Sua voz no WhatsApp</h2>
  <p className="text-sm text-muted">Cadastre uma gravação da sua voz e a transcrição exata. As mensagens serão geradas automaticamente a partir do texto autorizado.</p>
  {demo&&<p className="rounded-lg border border-border bg-surface-2 p-3 text-sm">Demonstração: você pode <strong>gravar e clonar a sua voz aqui mesmo</strong> — a clonagem é feita pelo seu próprio servidor de voz. Nenhuma mensagem é enviada a ninguém.</p>}
  {!available&&<p className="text-sm text-muted">O serviço de voz ainda precisa ser configurado pelo administrador.</p>}
  <form action={register} className="space-y-3">
   <VoiceRecorder onChange={setRecording} disabled={!available||registering}/>
   <label className="label">O que foi dito na gravação<textarea name="transcript" className="input mt-1" maxLength={4000} required disabled={!available||registering}/></label>
   <label className="flex gap-2 text-sm"><input name="voiceConsent" type="checkbox" required disabled={!available||registering}/>Esta gravação é minha ou tenho autorização para usar esta voz nas mensagens desta operação.</label>
   <button className="btn-primary" disabled={!available||registering||!recording}>{registering?'Cadastrando…':hasProfile?'Atualizar minha voz':'Cadastrar minha voz'}</button>
   {registration.message&&<p role="status" className="text-sm">{registration.message}</p>}
  </form>
  {hasProfile&&<div className="flex flex-wrap gap-3">
   <form action={revokeVoiceAction}><button className="btn-outline">Desativar uso da minha voz</button></form>
   <form action={deleteVoiceProfileAction}><button className="btn-outline">Apagar tudo (perfil e fila)</button></form>
  </div>}
  <form action={queue} className="space-y-3 border-t border-border pt-5">
   <input name="commandId" type="hidden" value={commandId}/>
   <label className="label">Telefone com código do país<input className="input mt-1" name="recipient" type="tel" pattern="\+?[1-9][0-9]{7,14}" placeholder="+5511999999999" required disabled={!deliveryEnabled||!hasProfile||sending}/></label>
   <label className="label">Texto autorizado da mensagem<textarea className="input mt-1" name="text" maxLength={2000} required disabled={!deliveryEnabled||!hasProfile||sending}/></label>
   <button className="btn-primary" disabled={!deliveryEnabled||!hasProfile||sending}>{sending?'Solicitando…':'Gerar e enviar com minha voz'}</button>
   {!deliveryEnabled&&<p className="text-sm text-muted">{demo?'Na demonstração o envio está desligado de propósito: você grava a voz, mas nenhuma mensagem sai para um número real.':'O envio automático aguarda a configuração e validação do executor.'}</p>}
   {delivery.message&&<p role="status" className="text-sm">{delivery.message}</p>}
  </form>
  {jobs.length>0&&<ul className="space-y-2 text-sm">{jobs.map(job=><li key={job.id}>{`••••${job.recipient.slice(-4)}`} · {states[job.state]??'Estado indisponível'}</li>)}</ul>}
  <p className="text-xs text-muted">A geração usa voz sintética. Aceitação pelo WhatsApp não confirma entrega ou leitura. Ligações automáticas dependem da integração de transporte da próxima fase.</p>
 </section>;
}

'use client';
import {useActionState} from 'react';
import {registerVoiceAction,queueVoiceAction,revokeVoiceAction} from './voice-actions';
import {demoRegisterVoiceAction,demoRevokeVoiceAction} from './voice-demo-actions';
import type {VoiceDemoState} from './voice-demo-actions';
type Job={id:string;state:string;recipient:string};
const states:Record<string,string>={queued:'Na fila',running:'Gerando e enviando',sent:'Aceito pelo WhatsApp',unknown:'Sem confirmação — confira no WhatsApp',failed:'Não concluído',waiting_transport:'Aguardando transporte de chamadas'};

export function VoiceDemoPanel() {
 const [state,submit,working]=useActionState<VoiceDemoState,FormData>(demoRegisterVoiceAction,undefined);
 const [revokeState,revoke,revokeWorking]=useActionState<VoiceDemoState,FormData>(demoRevokeVoiceAction,undefined);
 return <section className="card mt-6 space-y-4 p-6">
  <h2 className="text-lg font-semibold">Sua voz na demonstração (local)</h2>
  <p className="text-sm text-muted">Grave ou envie um áudio seu. O arquivo fica somente neste servidor de demonstração e é reproduzido aqui — nada é enviado ao Voice Studio nem ao WhatsApp.</p>
  <form action={submit} className="space-y-3">
   <label className="label">Gravação da sua voz, até 3 MB (WAV)<input className="input mt-1" type="file" name="reference" accept="audio/wav,audio/x-wav" required disabled={working}/></label>
   <label className="label">O que foi dito na gravação<textarea name="transcript" className="input mt-1" maxLength={4000} required disabled={working}/></label>
   <label className="flex gap-2 text-sm"><input name="voiceConsent" type="checkbox" required disabled={working}/>Esta gravação é minha ou tenho autorização para usá-la.</label>
   <button className="btn-primary" disabled={working}>{working?'Cadastrando…':'Cadastrar minha voz (demo)'}</button>
   {state?.ok&&<p role="status" className="text-sm text-success">{state.ok}</p>}
   {state?.error&&<p role="status" className="text-sm text-error">{state.error}</p>}
  </form>
  <audio controls preload="none" src="/api/voice-demo/audio" aria-label="Áudio da sua voz cadastrada">
    <track kind="captions"/>
    Seu navegador não suporta áudio.
  </audio>
  <a className="btn-outline" href="/simulador">Abrir o Simulador e ouvir a voz nas interações</a>
  <form action={revoke}><button className="btn-outline" disabled={revokeWorking}>{revokeWorking?'Removendo…':'Remover voz de demonstração'}</button></form>
  {revokeState?.ok&&<p role="status" className="text-sm">{revokeState.ok}</p>}
  {revokeState?.error&&<p role="status" className="text-sm text-error">{revokeState.error}</p>}
  <p className="text-xs text-muted">Modo demo: nenhum áudio é gerado na nuvem e nenhum envio acontece.</p>
 </section>;
}

export function VoicePanel({available,enabled,hasProfile,commandId,jobs}:{available:boolean;enabled:boolean;hasProfile:boolean;commandId:string;jobs:Job[]}){
 const [registration,register,registering]=useActionState(registerVoiceAction,{message:''});
 const [delivery,queue,sending]=useActionState(queueVoiceAction,{message:''});
 return <section className="card mt-6 space-y-5 p-6">
  <h2 className="text-lg font-semibold">Sua voz no WhatsApp</h2>
  <p className="text-sm text-muted">Cadastre uma gravação da sua voz e a transcrição exata. As mensagens serão geradas automaticamente a partir do texto autorizado.</p>
  {!available&&<p className="text-sm text-muted">O serviço de voz ainda precisa ser configurado pelo administrador.</p>}
  <form action={register} className="space-y-3">
   <label className="label">Gravação limpa da sua voz, até 3 MB<input className="input mt-1" type="file" name="reference" accept="audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/mpeg,audio/mp4" required disabled={!available||registering}/></label>
   <label className="label">O que foi dito na gravação<textarea name="transcript" className="input mt-1" maxLength={4000} required disabled={!available||registering}/></label>
   <label className="flex gap-2 text-sm"><input name="voiceConsent" type="checkbox" required disabled={!available||registering}/>Esta gravação é minha ou tenho autorização para usar esta voz nas mensagens desta operação.</label>
   <button className="btn-primary" disabled={!available||registering}>{registering?'Cadastrando…':hasProfile?'Atualizar minha voz':'Cadastrar minha voz'}</button>
   {registration.message&&<p role="status" className="text-sm">{registration.message}</p>}
  </form>
  {hasProfile&&<form action={revokeVoiceAction}><button className="btn-outline">Desativar uso da minha voz</button></form>}
  <form action={queue} className="space-y-3 border-t border-border pt-5">
   <input name="commandId" type="hidden" value={commandId}/>
   <label className="label">Telefone com código do país<input className="input mt-1" name="recipient" type="tel" pattern="\+?[1-9][0-9]{7,14}" placeholder="+5511999999999" required disabled={!enabled||!hasProfile||sending}/></label>
   <label className="label">Texto autorizado da mensagem<textarea className="input mt-1" name="text" maxLength={2000} required disabled={!enabled||!hasProfile||sending}/></label>
   <button className="btn-primary" disabled={!enabled||!hasProfile||sending}>{sending?'Solicitando…':'Gerar e enviar com minha voz'}</button>
   {!enabled&&<p className="text-sm text-muted">O envio automático aguarda a configuração e validação do executor.</p>}
   {delivery.message&&<p role="status" className="text-sm">{delivery.message}</p>}
  </form>
  {jobs.length>0&&<ul className="space-y-2 text-sm">{jobs.map(job=><li key={job.id}>{`••••${job.recipient.slice(-4)}`} · {states[job.state]??'Estado indisponível'}</li>)}</ul>}
  <p className="text-xs text-muted">A geração usa voz sintética. Aceitação pelo WhatsApp não confirma entrega ou leitura. Ligações automáticas dependem da integração de transporte da próxima fase.</p>
 </section>;
}

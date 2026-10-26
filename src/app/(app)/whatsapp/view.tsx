'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {whatsappAction,sendWhatsAppAction} from './actions';
import type {WhatsAppStatus} from '@/lib/whatsapp/akg';
const LABEL:Record<WhatsAppStatus['state'],string>={not_configured:'Aguardando configuração',disconnected:'Desconectado',connecting:'Conectando',qr_ready:'Escaneie o QR Code',connected:'Conectado',error:'Não foi possível conectar'};
export function WhatsAppView({enabled,seller,reason}:{enabled:boolean;seller:string;reason?:string}){
 const [status,setStatus]=useState<WhatsAppStatus>({state:enabled?'disconnected':'not_configured',checkedAt:''});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [recipient,setRecipient]=useState(''),[text,setText]=useState(''),[commandId,setCommandId]=useState(''),[locked,setLocked]=useState(false);
 const deadline=useRef(0),active=useRef(false),generation=useRef(0),inflight=useRef(false);
 const refresh=useCallback(async()=>{
  if(!enabled||inflight.current)return;
  inflight.current=true;const current=generation.current;
  try{const result=await whatsappAction('status');if(active.current&&current===generation.current)setStatus(result);}finally{inflight.current=false;}
 },[enabled]);
 useEffect(()=>{active.current=true;void refresh();return()=>{active.current=false;generation.current++;};},[refresh]);
 useEffect(()=>{
  if(!enabled||!['connecting','qr_ready'].includes(status.state))return;
  const timer=setInterval(()=>{if(Date.now()>deadline.current){setNotice('Atualização automática encerrada. Clique em Atualizar status para continuar.');clearInterval(timer);return;}if(!document.hidden)void refresh();},5000);
  return()=>clearInterval(timer);
 },[enabled,status.state,refresh]);
 async function action(kind:'connect'|'disconnect'){
  generation.current++;setBusy(true);setNotice('');deadline.current=Date.now()+120000;
  try{const result=await whatsappAction(kind);setStatus(result);}finally{setBusy(false);}
 }
 async function send(event:React.FormEvent){
  event.preventDefault();if(locked||busy)return;
  const id=commandId||crypto.randomUUID();setCommandId(id);setBusy(true);setNotice('');
  try{const result=await sendWhatsAppAction({id,recipient,text});setNotice(result.ok||result.error||'Confira o resultado.');if(result.state)setLocked(true);}finally{setBusy(false);}
 }
 return <div className="grid gap-6 lg:grid-cols-2">
  <section className="card p-6"><h2 className="text-lg font-semibold">Seu WhatsApp</h2><p className="mt-1 text-sm text-muted">Responsável: {seller}</p>
   <p className="mt-5 font-medium" role="status">{LABEL[status.state]}{status.phone?` · +${status.phone}`:''}</p>
   {reason&&<p className="mt-3 text-sm text-muted">{reason}</p>}
   {status.message&&<p className="mt-3 text-sm text-danger" role="alert">{status.message}</p>}
   {status.qrDataUrl&&<div className="mt-4"><img src={status.qrDataUrl} alt="QR Code de pareamento do seu WhatsApp" className="h-64 w-64 rounded-lg border border-border"/><p className="mt-3 text-sm text-muted">No celular, abra WhatsApp → Dispositivos conectados → Conectar dispositivo.</p></div>}
   <div className="mt-5 flex flex-wrap gap-3">
    <button className="btn-primary" disabled={!enabled||busy||status.state==='connected'} onClick={()=>void action('connect')}>{busy?'Aguarde…':status.state==='qr_ready'?'Gerar novo QR Code':'Conectar WhatsApp'}</button>
    <button className="btn-outline" disabled={!enabled||busy} onClick={()=>{deadline.current=Date.now()+120000;void refresh();}}>Atualizar status</button>
    {enabled&&status.state!=='not_configured'&&status.state!=='disconnected'&&<button className="btn-outline" disabled={busy} onClick={()=>void action('disconnect')}>Desvincular</button>}
   </div><p className="mt-4 text-xs text-muted">Cada vendedor conecta seu próprio número. A desvinculação permite parear outra conta.</p>
  </section>
  <section className="card p-6"><h2 className="text-lg font-semibold">Enviar mensagem</h2><p className="mt-1 text-sm text-muted">Envio individual pelo número conectado. Nenhuma campanha será disparada ao conectar.</p>
   <form onSubmit={send} className="mt-5 space-y-4"><label className="block text-sm">Telefone com código do país<input className="input mt-2" type="tel" placeholder="+5511999999999" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={locked||busy} required pattern="\+?[1-9][0-9]{7,14}"/></label>
    <label className="block text-sm">Mensagem<textarea className="input mt-2 min-h-32" value={text} onChange={e=>setText(e.target.value)} maxLength={4000} disabled={locked||busy} required/></label>
    <button className="btn-primary" disabled={!enabled||status.state!=='connected'||busy||locked}>{busy?'Aguarde…':'Enviar mensagem'}</button>
    {locked&&<button type="button" className="btn-outline ml-3" onClick={()=>{setCommandId('');setText('');setLocked(false);setNotice('');}}>Nova mensagem</button>}
   </form><p className="mt-4 text-xs text-muted">Envios sem confirmação ficam registrados para evitar duplicação. Confira no WhatsApp antes de preparar uma nova tentativa.</p>
  </section>
  {notice&&<p className="rounded-lg border border-border p-4 text-sm lg:col-span-2" role="status">{notice}</p>}
 </div>;
}

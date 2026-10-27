'use client';
import {useActionState} from 'react';
import {queueAnalysisAction} from './analysis-actions';

export function AnalysisForm({leads,enabled,commandId}:{leads:Array<{id:string;fullName:string}>;enabled:boolean;commandId:string}){
 const [state,action,pending]=useActionState(queueAnalysisAction,{message:''});
 return <form action={action} className="space-y-3">
  <input type="hidden" name="commandId" value={commandId}/>
  <label className="block">Lead para analisar
   <select name="leadId" required disabled={!enabled||pending} className="input mt-1">
    {leads.map(lead=><option key={lead.id} value={lead.id}>{lead.fullName}</option>)}
   </select>
  </label>
  <button type="submit" disabled={!enabled||pending||!leads.length} className="btn btn-primary">{pending?'Solicitando…':'Analisar dados do lead'}</button>
  <p role="status" className="text-sm">{state.message||(!enabled?'Executor indisponível. Nenhuma análise ou busca externa será simulada.':'Análise dos dados já cadastrados, sem consumo de IA ou envio de mensagens.')}</p>
 </form>;
}

'use client';
import {useActionState} from 'react';
import Link from 'next/link';
import {queueAnalysisAction} from './analysis-actions';

export function AnalysisForm({leads,enabled,commandId}:{leads:Array<{id:string;fullName:string}>;enabled:boolean;commandId:string}){
 const [state,action,pending]=useActionState(queueAnalysisAction,{message:''});
 const semLead=!leads.length;
 return <form action={action} className="space-y-3">
  <input type="hidden" name="commandId" value={commandId}/>
  <label className="block">Lead para analisar
   <select name="leadId" required disabled={!enabled||pending||semLead} className="input mt-1">
    {leads.map(lead=><option key={lead.id} value={lead.id}>{lead.fullName}</option>)}
   </select>
  </label>
  <button type="submit" disabled={!enabled||pending||semLead} className="btn btn-primary">{pending?'Solicitando…':semLead?'Sem lead para analisar':'Analisar dados do lead'}</button>
  {state.message
   ? <p role="status" className="text-sm">{state.message}</p>
   : semLead
    ? <p role="status" className="text-sm text-muted">Esta operação ainda não tem lead na sua carteira. <Link className="text-accent underline" href="/leads">Cadastrar ou importar leads</Link> para liberar a análise. O executor já está pronto: assim que houver lead, a análise entra na fila e o resultado sai em poucos minutos.</p>
    : !enabled
     ? <p role="status" className="text-sm text-muted">Executor desativado nesta operação. <Link className="text-accent underline" href="/admin">Ative a análise</Link> para pedir a leitura dos dados do lead.</p>
     : <p role="status" className="text-sm">Análise dos dados que você já tem no CRM, com a IA como cérebro quando ela está disponível. O resultado sai em ciclos de poucos minutos, em uma fila que aparece logo abaixo.</p>}
 </form>;
}

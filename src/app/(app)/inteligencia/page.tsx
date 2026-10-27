import { and, desc, eq, ne } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { aiConfigured } from '@/lib/ai';
import { PageHeader } from '@/components/ui';
import { IntelligenceView } from './view';
import {listLeadAnalysis} from '@/lib/intelligence/jobs';
import {AnalysisForm} from './analysis-view';

export const metadata = { title: 'Inteligência comercial' };
export const maxDuration = 60;
const factorNames:Record<string,string>={position_seniority:'Senioridade do cargo',company_size:'Porte da empresa',data_completeness:'Completude dos dados',digital_presence:'Presença digital',osint_risk:'Risco nas fontes',email_validity:'Validação de e-mail'};
const priorityNames:Record<string,string>={CRITICAL:'Crítica',HIGH:'Alta',MEDIUM:'Média',LOW:'Baixa'};
export default async function IntelligencePage() {
  const ctx = await requireOrg();
  if (!ctx.org.active) return <p className="text-danger">Esta operação está inativa.</p>;
  const db = await getDb();
  const leads = await db.select({ id: schema.leads.id, fullName: schema.leads.fullName, company: schema.leads.company }).from(schema.leads)
    .where(and(eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.ownerId, ctx.user.id), ne(schema.leads.stage, 'do_not_contact')))
    .orderBy(desc(schema.leads.createdAt)).limit(200);
  const analyses=await listLeadAnalysis(db,{orgId:ctx.org.id,userId:ctx.user.id});
  return <>
    <PageHeader title="Inteligência comercial" subtitle="Prepare conversas com a sua estratégia, ofertas e identidade de vendedor." />
    <IntelligenceView leads={leads} sellerName={ctx.user.name} enabled={ctx.org.aiEnabled && aiConfigured()} demo={ctx.org.isDemo}
      status={!ctx.org.aiEnabled ? 'A IA está desligada nesta operação.' : !aiConfigured() ? 'O provedor de IA ainda não está configurado.' : 'IA disponível para gerar rascunhos sob revisão.'} />
    <section className="card mt-6 space-y-4 p-5" aria-labelledby="analysis-title">
      <h2 id="analysis-title" className="text-lg font-semibold">Qualidade dos dados e prioridade</h2>
      <p className="text-sm">Pontuação heurística explicável de 0 a 100. Não representa probabilidade de compra nem confirma e-mail ou telefone.</p>
      <AnalysisForm leads={leads} enabled={!ctx.org.isDemo&&process.env.INTELLIGENCE_WORKER_ENABLED==='true'} commandId={crypto.randomUUID()}/>
      {analyses.length>0&&<ul className="space-y-2">{analyses.map(job=><li key={job.id} className="rounded-lg border p-3 text-sm">
        <strong>{leads.find(lead=>lead.id===job.leadId)?.fullName??'Lead indisponível'}</strong>{' — '}
        {job.state==='completed'&&job.result?`Pontuação ${job.result.score}/100 · Prioridade ${priorityNames[job.result.priority]??job.result.priority}`:({queued:'Na fila',running:'Processando',failed:'Não concluído',cancelled:'Cancelado',completed:'Resultado indisponível'}[job.state])}
        {job.result&&<details><summary>Fatores da pontuação</summary><ul>{Object.entries(job.result.factors).map(([factor,value])=><li key={factor}>{factorNames[factor]??factor}: {value}</li>)}</ul></details>}
      </li>)}</ul>}
    </section>
  </>;
}

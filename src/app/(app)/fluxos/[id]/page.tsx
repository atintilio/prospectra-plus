import { and, asc, eq } from 'drizzle-orm';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { campaignFeatures } from '@/lib/campaign-features';
import { availableFlowStepTypes, flowBlockedTypes } from '@/lib/flows/gate';
import { FLOW_STEP_TYPES } from '@/lib/flows/types';
import { PageHeader } from '@/components/ui';
import { deleteFlowAction } from '../actions';
import { FlowBuilder, type EditableFlowStep } from './builder';

export const metadata = { title: 'Construtor de fluxo' };

export default async function FluxoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [flow] = await db.select().from(schema.flows)
    .where(and(eq(schema.flows.id, id), eq(schema.flows.orgId, ctx.org.id)));
  if (!flow) notFound();
  const rows = await db.select().from(schema.flowSteps)
    .where(and(eq(schema.flowSteps.flowId, flow.id), eq(schema.flowSteps.orgId, ctx.org.id)))
    .orderBy(asc(schema.flowSteps.position));

  const steps: EditableFlowStep[] = rows.map((step) => ({
    id: step.id,
    position: step.position,
    type: step.type,
    name: step.name,
    delayDays: step.delayDays,
    condition: step.condition,
    template: step.template,
    useAi: step.useAi,
    subject: step.subject,
    mediaUrl: step.mediaUrl,
  }));

  const features = campaignFeatures(ctx.org);
  // Na demonstração nada é enviado de verdade: todos os blocos ficam livres
  // para a apresentação mostrar a sequência completa.
  const demo = ctx.org.isDemo;
  const available = demo ? [...FLOW_STEP_TYPES] : availableFlowStepTypes(features);
  const blocked = demo ? [] : flowBlockedTypes(features).map((type) => ({ type, reason: '' }));

  return (
    <>
      <PageHeader
        title={flow.name}
        subtitle="Monte a sequência: arraste os blocos para reorder, clique num bloco para configurar."
      >
        <Link href="/fluxos" className="btn-outline"><ArrowLeft className="h-4 w-4" /> Fluxos</Link>
        <form action={deleteFlowAction}>
          <input type="hidden" name="flowId" value={flow.id} />
          <button className="btn-danger"><Trash2 className="h-4 w-4" /> Excluir</button>
        </form>
      </PageHeader>

      <FlowBuilder
        flowId={flow.id}
        initialName={flow.name}
        initialStatus={flow.status === 'active' || flow.status === 'paused' ? flow.status : 'draft'}
        initialSteps={steps}
        available={available}
        blocked={blocked}
      />
    </>
  );
}

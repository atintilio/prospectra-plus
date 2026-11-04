import { GitBranch, Plus } from 'lucide-react';
import Link from 'next/link';
import { getReadDb } from '@/db';
import { requireOrg } from '@/lib/auth';
import { Empty, PageHeader } from '@/components/ui';
import { createFlowAction } from './actions';
import { listFlows } from './flows';

export const metadata = { title: 'Fluxos' };

const STATUS: Record<string, [string, string]> = {
  draft: ['Rascunho', 'bg-surface text-muted'],
  active: ['Ativo', 'bg-success-soft text-success'],
  paused: ['Pausado', 'bg-warning-soft text-warning'],
};

export default async function FluxosPage() {
  const ctx = await requireOrg();
  const db = await getReadDb();
  const rows = await listFlows(db, ctx.org.id);

  return (
    <>
      <PageHeader
        title="Fluxos"
        subtitle="Modelos de cadência: monte a sequência uma vez e use em quantas campanhas quiser."
      >
        <form action={createFlowAction}>
          <input type="hidden" name="name" value="Novo fluxo" />
          <button className="btn-primary"><Plus className="h-4 w-4" /> Novo fluxo</button>
        </form>
      </PageHeader>

      {rows.length === 0 ? (
        <Empty
          icon={GitBranch}
          title="Nenhum fluxo ainda"
          text="Um fluxo é a sua sequência de blocos: reagir, comentar, convidar, mensagem, e-mail, WhatsApp, voz, imagem e ligação. Depois é só escolher o fluxo na campanha."
        >
          <form action={createFlowAction}>
            <input type="hidden" name="name" value="Meu primeiro fluxo" />
            <button className="btn-primary">Criar o primeiro fluxo</button>
          </form>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((f) => {
            const [label, cls] = STATUS[f.status] ?? STATUS.draft;
            return (
              <Link key={f.id} href={`/fluxos/${f.id}`} className="card group p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold group-hover:text-accent">{f.name}</h2>
                  <span className={`pill ${cls}`}>{label}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {f.steps} {f.steps === 1 ? 'bloco' : 'blocos'} · {f.campaigns} {f.campaigns === 1 ? 'campanha usa' : 'campanhas usam'}
                </p>
                {f.description ? <p className="mt-3 line-clamp-2 text-sm text-muted">{f.description}</p> : null}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

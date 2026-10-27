import { and, desc, eq, sql } from 'drizzle-orm';
import { Megaphone, Plus } from 'lucide-react';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { Empty, PageHeader } from '@/components/ui';

export const metadata = { title: 'Campanhas' };

const STATUS: Record<string, [string, string]> = {
  draft: ['Rascunho', 'bg-surface text-muted'], active: ['Ativa', 'bg-success-soft text-success'],
  paused: ['Pausada', 'bg-warning-soft text-warning'], finished: ['Encerrada', 'bg-surface text-muted'],
};

export default async function CampanhasPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const rows = await db.select({
    c: schema.campaigns,
    enrolled: sql<number>`(select count(*) from ${schema.enrollments} e where e.campaign_id = ${schema.campaigns.id})`.mapWith(Number),
    active: sql<number>`(select count(*) from ${schema.enrollments} e where e.campaign_id = ${schema.campaigns.id} and e.state in ('running','waiting_accept'))`.mapWith(Number),
    replies: sql<number>`(select count(*) from ${schema.events} ev where ev.campaign_id = ${schema.campaigns.id} and ev.type = 'reply_received')`.mapWith(Number),
    accepted: sql<number>`(select count(*) from ${schema.events} ev where ev.campaign_id = ${schema.campaigns.id} and ev.type = 'invite_accepted')`.mapWith(Number),
    invites: sql<number>`(select count(*) from ${schema.events} ev where ev.campaign_id = ${schema.campaigns.id} and ev.type = 'invite_sent')`.mapWith(Number),
    assignee: schema.users.name,
  }).from(schema.campaigns)
    .leftJoin(schema.users, eq(schema.users.id, sql`coalesce(${schema.campaigns.assignedTo}, ${schema.campaigns.ownerId})`))
    .where(and(eq(schema.campaigns.orgId, ctx.org.id)))
    .orderBy(desc(schema.campaigns.createdAt));

  return (
    <>
      <PageHeader title="Campanhas" subtitle="Cadências de LinkedIn com mensagens personalizadas pela IA.">
        <Link href="/campanhas/nova" className="btn-primary"><Plus className="h-4 w-4" /> Nova campanha</Link>
      </PageHeader>
      {rows.length === 0 ? (
        <Empty icon={Megaphone} title="Nenhuma campanha ainda" text="Monte uma sequência (reagir, convite, mensagens), inscreva uma lista de leads e o Prospectra prepara cada ação na sua Fila do dia.">
          <Link href="/campanhas/nova" className="btn-primary">Criar a primeira</Link>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ c, enrolled, active, replies, accepted, invites, assignee }) => {
            const [label, cls] = STATUS[c.status];
            return (
              <Link key={c.id} href={`/campanhas/${c.id}`} className="card group p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold group-hover:text-accent">{c.name}</h2>
                  <span className={`pill ${cls}`}>{label}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{c.steps.length} passos · {assignee || 'sem responsável'}</p>
                <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
                  <div><dt className="text-xs text-muted">Leads</dt><dd className="mt-1 text-lg font-semibold">{enrolled}</dd><dd className="text-[11px] text-muted">{active} em curso</dd></div>
                  <div><dt className="text-xs text-muted">Aceite</dt><dd className="mt-1 text-lg font-semibold">{invites ? Math.round((accepted / invites) * 100) : 0}%</dd><dd className="text-[11px] text-muted">{accepted}/{invites}</dd></div>
                  <div><dt className="text-xs text-muted">Respostas</dt><dd className="mt-1 text-lg font-semibold">{replies}</dd></div>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

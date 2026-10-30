import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { CalendarCheck, Handshake, ListChecks, MessageSquareReply, Send, TrendingUp, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { aiGenerator } from '@/lib/ai';
import { dayString, runScheduler } from '@/lib/cadence';
import { Avatar, Card, KpiCard, LineChart, PageHeader, StagePill } from '@/components/ui';
import { agendaStatus } from '@/lib/agenda';
import { AgendaSetupCard } from '../agenda-card';

export const metadata = { title: 'Painel' };

const RANGES = { '7': 7, '30': 30, '90': 90 } as const;

export default async function Painel({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const ctx = await requireOrg();
  const db = await getDb();
  await runScheduler(db, { orgId: ctx.org.id, generate: aiGenerator });
  const days = RANGES[((await searchParams).dias ?? '30') as keyof typeof RANGES] ?? 30;
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400_000);
  const prevFrom = new Date(from.getTime() - days * 86400_000);
  const manager = ctx.role === 'owner' || ctx.role === 'manager';
  const scope = (t: typeof schema.events) => manager ? eq(t.orgId, ctx.org.id) : and(eq(t.orgId, ctx.org.id), eq(t.userId, ctx.user.id));

  const counts = async (start: Date, end: Date) => {
    const rows = await db.select({ type: schema.events.type, n: count() }).from(schema.events)
      .where(and(scope(schema.events), gte(schema.events.at, start), lt(schema.events.at, end))).groupBy(schema.events.type);
    return Object.fromEntries(rows.map((r) => [r.type, r.n])) as Record<string, number>;
  };
  const [cur, prev, agenda] = await Promise.all([counts(from, now), counts(prevFrom, from), agendaStatus()]);
  const delta = (k: string) => (prev[k] ? Math.round((((cur[k] ?? 0) - prev[k]) / prev[k]) * 100) : null);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const invites = cur.invite_sent ?? 0, accepted = cur.invite_accepted ?? 0, replies = cur.reply_received ?? 0, msgs = cur.message_sent ?? 0;

  // série diária
  const tz = 'America/Sao_Paulo';
  const daily = await db.select({ d: sql<string>`to_char(${schema.events.at} at time zone ${tz}, 'YYYY-MM-DD')`, type: schema.events.type, n: count() })
    .from(schema.events).where(and(scope(schema.events), gte(schema.events.at, from), sql`${schema.events.type} in ('invite_sent','message_sent')`))
    .groupBy(sql`1`, schema.events.type);
  const labels: string[] = [], keys: string[] = [];
  for (let i = Math.min(days, 30) - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    keys.push(dayString(d)); labels.push(dayString(d).slice(8, 10) + '/' + dayString(d).slice(5, 7));
  }
  const val = (k: string, t: string) => daily.find((r) => r.d === k && r.type === t)?.n ?? 0;

  // funil
  const stageRows = await db.select({ stage: schema.leads.stage, n: count() }).from(schema.leads)
    .where(manager ? eq(schema.leads.orgId, ctx.org.id) : and(eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.ownerId, ctx.user.id)))
    .groupBy(schema.leads.stage);
  const st = Object.fromEntries(stageRows.map((r) => [r.stage, r.n])) as Record<string, number>;
  const totalLeads = stageRows.reduce((a, r) => a + r.n, 0);
  const funnel = ['new', 'invited', 'connected', 'replied', 'meeting', 'won'] as const;
  const reached = (i: number) => funnel.slice(i).reduce((a, s) => a + (st[s] ?? 0), 0);

  const [{ pending }] = await db.select({ pending: count() }).from(schema.actions)
    .where(and(eq(schema.actions.orgId, ctx.org.id), eq(schema.actions.userId, ctx.user.id), eq(schema.actions.status, 'pending')));

  const recent = await db.select({ e: schema.events, lead: schema.leads }).from(schema.events)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.events.leadId))
    .where(and(scope(schema.events), sql`${schema.events.type} in ('invite_accepted','reply_received','meeting_booked','deal_won')`))
    .orderBy(desc(schema.events.at)).limit(6);

  const team = manager ? await db.select({
    name: schema.users.name, email: schema.users.email,
    invites: sql<number>`count(*) filter (where ${schema.events.type} = 'invite_sent')`.mapWith(Number),
    replies: sql<number>`count(*) filter (where ${schema.events.type} = 'reply_received')`.mapWith(Number),
    meetings: sql<number>`count(*) filter (where ${schema.events.type} = 'meeting_booked')`.mapWith(Number),
  }).from(schema.events).innerJoin(schema.users, eq(schema.users.id, schema.events.userId))
    .where(and(eq(schema.events.orgId, ctx.org.id), gte(schema.events.at, from)))
    .groupBy(schema.users.id).orderBy(desc(sql`4`)).limit(8) : [];

  const first = (ctx.user.name || '').split(' ')[0];
  const EVENT_TEXT: Record<string, string> = { invite_accepted: 'aceitou seu convite', reply_received: 'respondeu', meeting_booked: 'marcou reunião', deal_won: 'virou venda' };

  return (
    <>
      <PageHeader eyebrow={`Olá${first ? `, ${first}` : ''} 👋`} title="Sua prospecção, em tempo real" subtitle={`${ctx.org.name} · ${manager ? 'visão da equipe' : 'seus resultados'}`}>
        <div className="flex rounded-lg border border-border bg-white p-1 text-sm">
          {Object.keys(RANGES).map((k) => (
            <Link key={k} href={`/painel?dias=${k}`} className={`rounded-md px-3 py-1.5 ${String(days) === k ? 'bg-surface-accent font-medium text-accent' : 'text-muted hover:text-text'}`}>{k} dias</Link>
          ))}
        </div>
      </PageHeader>
      <AgendaSetupCard awaitingAdmin={agenda.awaitingAdmin} unreachable={agenda.unreachable} message={agenda.message} />

      {pending > 0 && (
        <Link href="/fila" className="mb-6 flex items-center justify-between rounded-2xl bg-gradient-to-r from-accent to-violet px-5 py-4 text-white shadow-sm">
          <span className="flex items-center gap-3"><ListChecks className="h-5 w-5" /><span><strong>{pending} ações</strong> esperando você na Fila do dia</span></span>
          <span className="text-sm font-medium">Abrir fila →</span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Send} label="Convites enviados" value={invites} delta={delta('invite_sent')} hint={`vs. ${days} dias anteriores`} />
        <KpiCard icon={UserPlus} label="Convites aceitos" value={accepted} hint={`${pct(accepted, invites)}% de aceite`} delta={delta('invite_accepted')} />
        <KpiCard icon={MessageSquareReply} label="Respostas" value={replies} hint={`${pct(replies, msgs + accepted)}% de resposta`} delta={delta('reply_received')} tone="violet" />
        <KpiCard icon={CalendarCheck} label="Reuniões" value={cur.meeting_booked ?? 0} hint={`${cur.deal_won ?? 0} venda(s)`} delta={delta('meeting_booked')} tone="violet" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Convites e mensagens por dia" icon={TrendingUp}>
          <LineChart labels={labels} series={[
            { name: 'Convites', values: keys.map((k) => val(k, 'invite_sent')), color: '#155dfc', area: true },
            { name: 'Mensagens', values: keys.map((k) => val(k, 'message_sent')), color: '#7c3aed' },
          ]} />
        </Card>
        <Card title="Funil de leads" icon={Handshake} action={<span className="text-xs text-muted">{totalLeads} leads</span>}>
          <ul className="space-y-3">
            {funnel.map((s, i) => {
              const n = reached(i);
              return (
                <li key={s}>
                  <div className="mb-1 flex justify-between text-sm"><StagePill stage={s} /><span className="font-medium">{n} <span className="text-xs font-normal text-muted">({pct(n, totalLeads)}%)</span></span></div>
                  <div className="h-2 rounded-full bg-surface"><div className="h-2 rounded-full bg-gradient-to-r from-accent to-violet" style={{ width: `${pct(n, totalLeads)}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className={`mt-4 grid gap-4 ${manager ? 'xl:grid-cols-2' : ''}`}>
        <Card title="Últimos sinais" icon={MessageSquareReply} action={<Link href="/leads" className="text-xs font-medium text-accent">Ver leads →</Link>}>
          {recent.length === 0 ? <p className="text-sm text-muted">Quando alguém aceitar, responder ou marcar reunião, aparece aqui.</p> : (
            <ul className="divide-y divide-border">
              {recent.map(({ e, lead }) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={lead.fullName} />
                  <p className="min-w-0 flex-1 truncate text-sm"><strong className="font-medium">{lead.fullName}</strong> <span className="text-muted">{EVENT_TEXT[e.type]}</span></p>
                  <span className="text-xs text-muted">{e.at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: tz })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {manager && (
          <Card title="Equipe no período" icon={Users}>
            {team.length === 0 ? <p className="text-sm text-muted">Sem atividade registrada no período.</p> : (
              <table className="w-full">
                <thead><tr><th className="th pl-0">Pessoa</th><th className="th text-right">Convites</th><th className="th text-right">Respostas</th><th className="th pr-0 text-right">Reuniões</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {team.map((t) => (
                    <tr key={t.email}><td className="td pl-0"><span className="flex items-center gap-2"><Avatar name={t.name || t.email} size={26} />{t.name || t.email}</span></td>
                      <td className="td text-right">{t.invites}</td><td className="td text-right">{t.replies}</td><td className="td pr-0 text-right font-medium">{t.meetings}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

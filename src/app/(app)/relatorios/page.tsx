import { MessagesSquare, Timer, CheckCircle2, Star, Users, Tags } from 'lucide-react';
import { requireOrg } from '@/lib/auth';
import { supportReport } from '@/lib/support-reports';
import { PageHeader, KpiCard, Card, Empty } from '@/components/ui';

export const metadata = { title: 'Relatórios' };

function msToText(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function pct(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireOrg();

  const from = sp.from ? new Date(`${sp.from}T00:00:00`) : null;
  const to = sp.to ? new Date(`${sp.to}T23:59:59`) : null;
  const report = await supportReport(ctx.org.id, { from, to });

  const csatAvg = report.csat.average !== null ? report.csat.average.toFixed(1).replace('.', ',') : '—';

  return (
    <>
      <PageHeader
        eyebrow="Helpin"
        title="Relatórios de atendimento"
        subtitle={`Período de ${report.from} até ${report.to}. Gerado em ${new Date(report.generatedAt).toLocaleString('pt-BR')}.`}
      >
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            <span className="mb-1 block">De</span>
            <input className="input" type="date" name="from" defaultValue={report.from} />
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Até</span>
            <input className="input" type="date" name="to" defaultValue={report.to} />
          </label>
          <button className="btn-primary">Filtrar</button>
        </form>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={MessagesSquare} label="Conversas no período" value={report.volume.total}
          hint={`${report.volume.open} abertas · ${report.volume.closed} fechadas`} />
        <KpiCard icon={Timer} label="Primeira resposta" value={msToText(report.firstResponse.averageMs)}
          hint={`${report.firstResponse.conversations} conversas · mediana ${msToText(report.firstResponse.medianMs)}`} tone="violet" />
        <KpiCard icon={CheckCircle2} label="SLA cumprido" value={pct(report.sla.withinRate)}
          hint={`${report.sla.within} de ${report.sla.evaluated} dentro do prazo`} />
        <KpiCard icon={Star} label="Satisfação (CSAT)" value={csatAvg}
          hint={`${report.csat.responses} respostas · ${pct(report.csat.promoterRate)} satisfeitos`} tone="violet" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Volume por dia" icon={MessagesSquare}>
          {report.volume.byDay.length === 0 ? (
            <Empty icon={MessagesSquare} title="Sem conversas no período" text="Ajuste o filtro de datas para ver o movimento." />
          ) : (
            <ul className="space-y-2">
              {report.volume.byDay.slice(-14).map((d) => {
                const max = Math.max(...report.volume.byDay.map((x) => x.total), 1);
                return (
                  <li key={d.date} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted">{d.date.slice(5)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                      <span className="block h-2 rounded-full bg-accent" style={{ width: `${(d.total / max) * 100}%` }} />
                    </span>
                    <span className="w-8 shrink-0 text-right font-medium">{d.total}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Canais eResolution" icon={Tags}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted">Web</p>
              <p className="mt-1 text-xl font-semibold">{report.volume.byChannel.web}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted">WhatsApp</p>
              <p className="mt-1 text-xl font-semibold">{report.volume.byChannel.whatsapp}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted">Interno</p>
              <p className="mt-1 text-xl font-semibold">{report.volume.byChannel.internal}</p>
            </div>
          </div>
          <div className="mt-4 space-y-1 text-sm text-muted">
            <p>Tempo médio de resolução: <span className="font-medium text-ink">{msToText(report.resolution.averageMs)}</span></p>
            <p>Mediana de resolução: <span className="font-medium text-ink">{msToText(report.resolution.medianMs)}</span></p>
            <p>SLA estourado: <span className="font-medium text-danger">{report.sla.breached}</span></p>
          </div>
        </Card>

        <Card title="Satisfação (CSAT)" icon={Star}>
          {report.csat.responses === 0 ? (
            <Empty icon={Star} title="Sem respostas de CSAT" text="As respostas aparecem depois que o cliente avalia o atendimento." />
          ) : (
            <>
              <div className="grid grid-cols-5 gap-2 text-center">
                {(['1', '2', '3', '4', '5'] as const).map((n) => (
                  <div key={n} className="rounded-lg border border-border p-2">
                    <p className="text-xs text-muted">{n}★</p>
                    <p className="mt-1 font-semibold">{report.csat.distribution[n]}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted">
                {report.csat.promoters} satisfeitos · {report.csat.detractors} insatisfeitos
              </p>
            </>
          )}
        </Card>

        <Card title="Desempenho da equipe" icon={Users}>
          {report.topAgents.length === 0 && report.topTeams.length === 0 ? (
            <Empty icon={Users} title="Sem movimento atribuído" text="Assim que os agentes responderem, o ranking aparece aqui." />
          ) : (
            <div className="space-y-4">
              {report.topAgents.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {report.topAgents.map((a) => (
                    <li key={a.userId} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-xs text-muted">{a.conversations} conversas · {a.replies} respostas</span>
                      <span className="ml-auto text-xs text-muted">1ª resposta {msToText(a.averageFirstResponseMs)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {report.topTeams.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {report.topTeams.map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <span className="ml-auto text-xs text-muted">{t.conversations} conversas</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

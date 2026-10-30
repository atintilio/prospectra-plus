import { Clock, ShieldCheck, Webhook, ScrollText } from 'lucide-react';
import { requireOrg, canManage } from '@/lib/auth';
import { getDb } from '@/db';
import { getSlaPolicy } from '@/lib/support-sla';
import { getSchedule } from '@/lib/support-schedule';
import { listWebhooks, WEBHOOK_EVENTS } from '@/lib/webhooks';
import { listAudit } from '@/lib/audit';
import { PageHeader, Card } from '@/components/ui';
import { SlaForm, ScheduleForm, WebhookForm, WebhookList, AuditList } from './forms';

export const metadata = { title: 'Atendimento' };

export default async function AtendimentoPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const [policy, schedule] = await Promise.all([getSlaPolicy(ctx.org.id), getSchedule(ctx.org.id)]);
  const hooks = await listWebhooks(db, ctx.org.id);
  const audit = await listAudit(ctx.org.id, { limit: 25 });
  const canEdit = canManage(ctx.role);

  return (
    <>
      <PageHeader
        eyebrow="Helpin"
        title="Regras de atendimento"
        subtitle="Prazo de resposta, horário de funcionamento, auto-resposta e integrações do atendimento."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Prazo de resposta (SLA)" icon={ShieldCheck}>
          <SlaForm
            canEdit={canEdit}
            policy={{
              firstResponseMinutes: policy.firstResponseMinutes,
              resolutionMinutes: policy.resolutionMinutes,
              businessHoursOnly: policy.businessHoursOnly,
            }}
          />
        </Card>

        <Card title="Horário de atendimento" icon={Clock}>
          <ScheduleForm
            canEdit={canEdit}
            schedule={{
              timezone: schedule.timezone,
              weekdays: schedule.weekdays,
              openMinute: schedule.openMinute,
              closeMinute: schedule.closeMinute,
              autoReplyEnabled: schedule.autoReplyEnabled,
              autoReplyMessage: schedule.autoReplyMessage,
            }}
          />
        </Card>

        <Card title="Webhooks de saída" icon={Webhook}>
          <WebhookForm events={[...WEBHOOK_EVENTS]} canEdit={canEdit} />
          <div className="mt-5 border-t border-border pt-4">
            <WebhookList
              canEdit={canEdit}
              webhooks={hooks.map((w) => ({
                id: w.id,
                url: w.url,
                events: w.events as string[],
                active: w.active,
                secretPreview: `${w.secret.slice(0, 6)}…${w.secret.slice(-4)}`,
              }))}
            />
          </div>
        </Card>

        <Card title="Trilha de auditoria" icon={ScrollText}>
          <p className="mb-3 text-sm text-muted">
            Últimas ações sensíveis da operação: mudanças de SLA, horário, campos e webhooks.
          </p>
          <AuditList
            entries={audit.map((a) => ({
              id: a.id,
              action: a.action,
              entity: a.entity,
              createdAt: a.createdAt.toISOString(),
            }))}
          />
        </Card>
      </div>
    </>
  );
}

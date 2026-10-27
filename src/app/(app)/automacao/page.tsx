import { desc, eq } from 'drizzle-orm';
import { Bot, CalendarCheck, CheckCheck, MessageSquareReply, MessagesSquare, Newspaper, Play, Send, UserCheck } from 'lucide-react';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { seedFeed } from '@/lib/demo-sim';
import { Avatar, Card, Empty, KpiCard, PageHeader } from '@/components/ui';
import { simulateCycleAction } from '../actions';

export const metadata = { title: 'Piloto automático' };

const ago = (d: Date) => {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60000));
  return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`;
};
const LABEL: Record<string, string> = { invite: 'Convite enviado', message: 'Mensagem enviada', accept: 'Convite aceito', reply: 'Lead respondeu', auto_reply: 'Resposta automática', handoff: 'Passou para o closer', post: 'Nova publicação', comment: 'Comentário do agente' };

export default async function Automacao() {
  const ctx = await requireOrg();
  if (!ctx.org.isDemo) {
    return (
      <>
        <PageHeader title="Piloto automático" subtitle="Envio automático de convites, respostas e comentários." />
        <Empty icon={Bot} title="Disponível na demonstração" text="O piloto automático ainda é uma simulação. Troque para o ambiente de demonstração para ver como vai funcionar." />
      </>
    );
  }
  const db = await getDb();
  let rows = await db.select({ f: schema.simFeed, lead: schema.leads }).from(schema.simFeed).leftJoin(schema.leads, eq(schema.leads.id, schema.simFeed.leadId))
    .where(eq(schema.simFeed.orgId, ctx.org.id)).orderBy(desc(schema.simFeed.at)).limit(120);
  if (!rows.length) {
    await seedFeed(db, ctx.org.id);
    rows = await db.select({ f: schema.simFeed, lead: schema.leads }).from(schema.simFeed).leftJoin(schema.leads, eq(schema.leads.id, schema.simFeed.leadId))
      .where(eq(schema.simFeed.orgId, ctx.org.id)).orderBy(desc(schema.simFeed.at)).limit(120);
  }
  const n = (k: string) => rows.filter((r) => r.f.kind === k).length;
  const conversations = rows.filter((r) => r.f.kind === 'auto_reply').slice(0, 5).map((r) => ({
    auto: r, reply: rows.find((x) => x.f.kind === 'reply' && x.f.leadId === r.f.leadId && x.f.at <= r.f.at),
    handoff: rows.find((x) => x.f.kind === 'handoff' && x.f.leadId === r.f.leadId),
  }));
  const posts = rows.filter((r) => r.f.kind === 'post').slice(0, 4).map((r) => ({
    post: r, comment: rows.find((x) => x.f.kind === 'comment' && x.f.leadId === r.f.leadId && x.f.at >= r.f.at),
  }));

  return (
    <>
      <PageHeader eyebrow="Simulação" title="Piloto automático" subtitle="Como o Prospectra vai trabalhar sozinho: convites, mensagens, respostas e comentários, sempre com limites diários.">
        <form action={simulateCycleAction}><button className="btn-primary"><Play className="h-4 w-4" /> Simular próximo ciclo</button></form>
      </PageHeader>

      <p className="mb-5 rounded-xl border border-border bg-violet-soft px-4 py-3 text-sm text-violet">
        Tudo nesta tela é simulado com dados fictícios: nada é enviado ao LinkedIn. Cada clique em "Simular próximo ciclo" faz o agente enviar o que está na fila, aceitar convites, responder leads e comentar publicações, e o painel e os leads se atualizam junto.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Send} label="Convites e mensagens" value={n('invite') + n('message')} hint="enviados pelo agente" />
        <KpiCard icon={UserCheck} label="Convites aceitos" value={n('accept')} hint="novas conexões" tone="violet" />
        <KpiCard icon={MessageSquareReply} label="Respostas automáticas" value={n('auto_reply')} hint={`${n('handoff')} passaram ao closer`} />
        <KpiCard icon={MessagesSquare} label="Comentários" value={n('comment')} hint="em publicações de conexões" tone="violet" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Caixa de respostas automáticas" icon={MessageSquareReply}>
          {conversations.length === 0 && <p className="p-5 text-sm text-muted">Nenhuma conversa ainda. Rode um ciclo.</p>}
          <ul className="divide-y divide-border">
            {conversations.map(({ auto, reply, handoff }) => (
              <li key={auto.f.id} className="p-5">
                <div className="flex items-center gap-2"><Avatar name={auto.lead?.fullName ?? '?'} /><div><p className="text-sm font-medium">{auto.lead?.fullName}</p><p className="text-xs text-muted">{auto.lead?.headline} · {auto.lead?.company}</p></div><span className="ml-auto text-xs text-muted">{ago(auto.f.at)}</span></div>
                {reply && <p className="mt-3 max-w-[85%] rounded-2xl rounded-tl-sm bg-surface px-3.5 py-2.5 text-sm">{reply.f.body}</p>}
                <p className="ml-auto mt-2 max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2.5 text-sm text-white">{auto.f.body}</p>
                <p className="mt-1.5 flex items-center justify-end gap-1 text-[11px] text-muted"><Bot className="h-3 w-3" /> respondido pelo agente{handoff && <span className="pill ml-2 bg-warning-soft text-warning"><CalendarCheck className="h-3 w-3" />reunião sugerida, passou ao closer</span>}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Publicações de conexões recentes" icon={Newspaper}>
          {posts.length === 0 && <p className="p-5 text-sm text-muted">Nenhuma publicação detectada ainda.</p>}
          <ul className="divide-y divide-border">
            {posts.map(({ post, comment }) => (
              <li key={post.f.id} className="p-5">
                <div className="flex items-center gap-2"><Avatar name={post.lead?.fullName ?? '?'} /><div><p className="text-sm font-medium">{post.lead?.fullName}</p><p className="text-xs text-muted">{post.lead?.company} · {post.f.detail || ago(post.f.at)}</p></div></div>
                <p className="mt-3 rounded-xl border border-border px-3.5 py-2.5 text-sm text-text">{post.f.body}</p>
                {comment && <div className="mt-2 rounded-xl bg-surface-accent px-3.5 py-2.5 text-sm"><p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-accent"><CheckCheck className="h-3 w-3" /> Comentário do agente, com referência ao post</p>{comment.f.body}</div>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Linha do tempo" icon={Bot}>
          <ul className="divide-y divide-border">
            {rows.slice(0, 20).map(({ f, lead }) => (
              <li key={f.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <Avatar name={lead?.fullName ?? '?'} size={28} />
                <div className="min-w-0 flex-1"><p><span className="font-medium">{LABEL[f.kind]}</span>{lead && <span className="text-muted"> · {lead.fullName}</span>}</p><p className="truncate text-xs text-muted">{f.body}</p></div>
                <span className="shrink-0 text-xs text-muted">{ago(f.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

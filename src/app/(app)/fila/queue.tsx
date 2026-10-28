'use client';

import { CalendarClock, Check, Clipboard, ExternalLink, Heart, Image, Mail, MessageCircle, MessageSquare, Mic, PartyPopper, Phone, RefreshCw, Send, SkipForward, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { cancelMeetingAction, completeActionAction, confirmMeetingAction, refreshQueueAction, updateLeadStageAction } from '../actions';
import { Avatar, Empty } from '@/components/ui';

type Lead = { id: string; fullName: string; headline: string; company: string; linkedinUrl: string; phone?: string };
type Item = { id: string; type: 'react' | 'comment' | 'invite' | 'message' | 'email' | 'whatsapp' | 'voice' | 'image' | 'call'; body: string; campaign: string; overdue: boolean; lead: Lead };
type Meeting = { id: string; leadName: string; status: 'requested' | 'confirmed'; schedulerUrl: string | null; scheduledAt: string | null };

const TYPE = {
  invite: { label: 'Convite de conexão', icon: UserPlus, how: 'Abra o perfil → Conectar → Adicionar nota → cole o texto.' },
  message: { label: 'Mensagem', icon: Send, how: 'Abra o perfil → Mensagem → cole o texto.' },
  comment: { label: 'Comentário em post', icon: MessageCircle, how: 'Abra a atividade recente → escolha um post → cole o comentário.' },
  react: { label: 'Reagir a um post', icon: Heart, how: 'Abra a atividade recente e reaja a um post recente.' },
  email: { label: 'E-mail', icon: Mail, how: 'Canal automático não configurado: copie e envie este e-mail ao lead.' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, how: 'Canal automático não configurado: copie e envie esta mensagem no WhatsApp do lead.' },
  voice: { label: 'WhatsApp · voz', icon: Mic, how: 'Voz automática indisponível: grave o áudio deste roteiro e envie no WhatsApp do lead.' },
  image: { label: 'WhatsApp · imagem/informativo', icon: Image, how: 'Envio automático indisponível: envie a imagem/informativo no WhatsApp do lead, com esta legenda.' },
  call: { label: 'WhatsApp · ligação', icon: Phone, how: 'Abra o WhatsApp do lead e ligue, seguindo este roteiro. Marque como feito depois da ligação.' },
} as const;

function openUrl(item: Item) {
  // Passos de WhatsApp (mensagem/voz/imagem/ligação) abrem a conversa do lead; os de LinkedIn, o perfil.
  const phone = (item.lead.phone ?? '').replace(/\D/g, '');
  if ((item.type === 'whatsapp' || item.type === 'voice' || item.type === 'image' || item.type === 'call') && phone) return `https://wa.me/${phone}`;
  return item.type === 'react' || item.type === 'comment' ? `${item.lead.linkedinUrl}/recent-activity/all/` : item.lead.linkedinUrl;
}

export function Queue({ items, waiting, connected, meetings, suggestedMeetingSlots, limits }: { items: Item[]; waiting: Lead[]; connected: Lead[]; meetings: Meeting[]; suggestedMeetingSlots: string[]; limits: { invitesLeft: number; messagesLeft: number } }) {
  const [list, removeItem] = useOptimistic(items, (state, id: string) => state.filter((i) => i.id !== id));
  const [pending, start] = useTransition();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const current = list[0];

  const act = (id: string, outcome: 'done' | 'skipped') => start(async () => {
    removeItem(id);
    await completeActionAction(id, outcome, edits[id]);
  });

  const openAndCopy = async (item: Item) => {
    const text = edits[item.id] ?? item.body;
    if (text) { try { await navigator.clipboard.writeText(text); setCopied(item.id); } catch { /* sem permissão de cópia */ } }
    window.open(openUrl(item), '_blank', 'noopener');
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div>
        {!current ? (
          <Empty icon={PartyPopper} title="Fila zerada por hoje" text="Novas ações aparecem conforme as cadências avançam. Que tal inscrever mais leads numa campanha?">
            <Link href="/campanhas" className="btn-primary">Ver campanhas</Link>
            <button className="btn-outline" onClick={() => start(() => refreshQueueAction())} disabled={pending}><RefreshCw className="h-4 w-4" /> Atualizar</button>
          </Empty>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">{list.length} {list.length === 1 ? 'ação pendente' : 'ações pendentes'}</span>
              <span className="text-muted">{limits.invitesLeft} convites · {limits.messagesLeft} mensagens disponíveis hoje</span>
            </div>
            {(() => {
              const t = TYPE[current.type];
              const overLimit = (current.type === 'invite' && limits.invitesLeft <= 0) || (current.type === 'message' && limits.messagesLeft <= 0);
              return (
                <article className="card overflow-hidden">
                  <header className="flex items-center gap-3 border-b border-border bg-gradient-to-r from-surface-accent to-violet-soft px-5 py-3 text-sm">
                    <t.icon className="h-4 w-4 text-accent" /><span className="font-semibold">{t.label}</span>
                    <span className="text-muted">· {current.campaign}</span>
                    {current.overdue && <span className="pill ml-auto bg-warning-soft text-warning">Atrasada</span>}
                  </header>
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={current.lead.fullName} size={44} />
                      <div className="min-w-0">
                        <p className="font-semibold">{current.lead.fullName}</p>
                        <p className="truncate text-sm text-muted">{[current.lead.headline, current.lead.company].filter(Boolean).join(' · ') || 'Sem cargo informado'}</p>
                      </div>
                    </div>
                    {current.type !== 'react' && (
                      <div className="mt-5">
                        <label className="label" htmlFor="body">Texto pronto <span className="font-normal text-muted">(pode editar)</span></label>
                        <textarea id="body" rows={current.type === 'invite' ? 4 : 6} maxLength={current.type === 'invite' ? 300 : 2000}
                          className="input resize-y leading-relaxed" value={edits[current.id] ?? current.body}
                          onChange={(e) => setEdits({ ...edits, [current.id]: e.target.value })} />
                        {current.type === 'invite' && <p className="mt-1 text-right text-xs text-muted">{(edits[current.id] ?? current.body).length}/300</p>}
                      </div>
                    )}
                    <p className="mt-4 rounded-lg bg-surface px-3 py-2 text-xs text-muted">{t.how}</p>
                    {overLimit && <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">Você atingiu o limite diário deste tipo de ação. Para proteger sua conta, deixe para amanhã.</p>}
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button className="btn-primary" onClick={() => openAndCopy(current)}>
                        {copied === current.id ? <Clipboard className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                        {current.type === 'react' ? 'Abrir no LinkedIn' : copied === current.id ? 'Texto copiado · abrir de novo' : 'Copiar e abrir no LinkedIn'}
                      </button>
                      <button className="btn-outline" onClick={() => act(current.id, 'done')} disabled={pending}><Check className="h-4 w-4" /> Feito</button>
                      <button className="btn-ghost" onClick={() => act(current.id, 'skipped')} disabled={pending}><SkipForward className="h-4 w-4" /> Pular</button>
                    </div>
                  </div>
                </article>
              );
            })()}
            {list.length > 1 && (
              <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-white">
                {list.slice(1, 8).map((i) => {
                  const Icon = TYPE[i.type].icon;
                  return (
                    <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <Icon className="h-4 w-4 text-muted" /><span className="font-medium">{i.lead.fullName}</span>
                      <span className="truncate text-muted">{TYPE[i.type].label}</span>
                    </li>
                  );
                })}
                {list.length > 8 && <li className="px-4 py-3 text-xs text-muted">e mais {list.length - 8}…</li>}
              </ul>
            )}
          </>
        )}
      </div>

      <aside className="space-y-6">
        <MeetingList meetings={meetings} suggestedSlots={suggestedMeetingSlots} />
        <LeadList title="Aguardando aceite" hint="Marque quando a pessoa aceitar seu convite: a cadência continua sozinha." leads={waiting}
          buttons={[{ label: 'Aceitou', outcome: 'accepted' as const }]} />
        <LeadList title="Conectados" hint="Respondeu? Marque aqui para encerrar a cadência e contar no painel." leads={connected}
          buttons={[{ label: 'Respondeu', outcome: 'replied' as const }, { label: 'Reunião', outcome: 'meeting' as const }]} />
      </aside>
    </div>
  );
}

function LeadList({ title, hint, leads, buttons }: { title: string; hint: string; leads: Lead[]; buttons: { label: string; outcome: 'accepted' | 'replied' | 'meeting' }[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [, start] = useTransition();
  const visible = leads.filter((l) => !hidden.includes(l.id));
  return (
    <section className="card">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">{title} <span className="text-sm font-normal text-muted">({visible.length})</span></h2>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </header>
      {visible.length === 0 ? <p className="px-5 py-4 text-sm text-muted">Ninguém aqui agora.</p> : (
        <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
          {visible.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
              <Avatar name={l.fullName} size={28} />
              <a href={l.linkedinUrl} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">{l.fullName}</a>
              {buttons.map((b) => (
                <button key={b.outcome} className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent"
                  onClick={() => { setHidden((h) => [...h, l.id]); start(() => updateLeadStageAction(l.id, b.outcome)); }}>{b.label}</button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MeetingList({ meetings, suggestedSlots }: { meetings: Meeting[]; suggestedSlots: string[] }) {
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState<string[]>([]);
  const [when, setWhen] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const visible = meetings.filter((m) => !hidden.includes(m.id));
  if (visible.length === 0) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const localInput = (iso: string) => {
    const date = new Date(iso);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  return (
    <section className="card">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">Reuniões <span className="text-sm font-normal text-muted">({visible.length})</span></h2>
        <p className="mt-0.5 text-xs text-muted">Interesse em reunião registrado pelo Harvey. Combine o horário com o lead e confirme aqui.</p>
        {notice && <p className="mt-2 text-sm" role="status">{notice}</p>}
      </header>
      <ul className="divide-y divide-border">
        {visible.map((m) => (
          <li key={m.id} className="px-5 py-3">
            <div className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-accent" />
              <span className="min-w-0 flex-1 truncate font-medium">{m.leadName}</span>
              {m.status === 'confirmed' && m.scheduledAt && <span className="pill bg-surface-accent text-accent">{fmt(m.scheduledAt)}</span>}
            </div>
            {m.schedulerUrl && (
              <a href={m.schedulerUrl} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                <ExternalLink className="h-3 w-3" /> Link de marcação
              </a>
            )}
            {m.status === 'requested' && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex w-full flex-wrap items-center gap-2 text-xs text-muted">
                  <span>Horários sugeridos:</span>
                  {suggestedSlots.map((slot) => <button key={slot} className="rounded-md border border-border px-2 py-1 hover:border-accent hover:text-accent"
                    onClick={() => setWhen({ ...when, [m.id]: localInput(slot) })}>{fmt(slot)}</button>)}
                </div>
                <input type="datetime-local" className="input h-9 py-1 text-sm" value={when[m.id] ?? ''} onChange={(e) => setWhen({ ...when, [m.id]: e.target.value })} />
                <button className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-50"
                  disabled={!when[m.id] || pending}
                  onClick={() => { const iso = new Date(when[m.id]).toISOString(); start(async () => {
                    try { const result = await confirmMeetingAction(m.id, iso); setNotice(result?.ok ?? result?.error ?? 'Confira o resultado da reunião.'); }
                    catch { setNotice('Não foi possível confirmar a reunião. Tente novamente.'); }
                  }); }}>
                  <Check className="mr-1 inline h-3 w-3" />Confirmar
                </button>
                <button className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted hover:border-accent hover:text-accent"
                  onClick={() => { setHidden((h) => [...h, m.id]); start(() => cancelMeetingAction(m.id)); }}>
                  <X className="mr-1 inline h-3 w-3" />Cancelar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

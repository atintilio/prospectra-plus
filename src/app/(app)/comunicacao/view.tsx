'use client';

import { MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { useActionState, useState } from 'react';
import { FormMessage, Submit } from '@/components/form';
import { DISC_TYPES, getCommunicationGuidance, type CommunicationPreferences } from '@/lib/communication-guidance';
import type { LeadCommunicationProfile } from '@/lib/communication';
import { saveDeclaredProfileAction, saveObservedProfileAction } from './actions';

type Lead = {
  id: string;
  fullName: string;
  company: string;
  profile: (Omit<LeadCommunicationProfile, 'assessedAt'> & { assessedAt: string }) | null;
};

const TYPE_LABELS: Record<string, string> = {
  D: 'D · Capitão', Di: 'Di · Condutor', DI: 'DI · Iniciador', Dc: 'Dc · Arquiteto',
  I: 'I · Motivador', Id: 'Id · Influenciador', Is: 'Is · Incentivador', IS: 'IS · Harmonizador',
  S: 'S · Apoiador', Si: 'Si · Colaborador', Sc: 'Sc · Planejador', SC: 'SC · Estabilizador',
  C: 'C · Analista', Cs: 'Cs · Revisor', Cd: 'Cd · Questionador', CD: 'CD · Cético',
};

const QUESTIONS = [
  { name: 'q1', title: 'Nas conversas, qual padrão você observou com mais frequência?', options: [
    ['D', 'Vai direto ao objetivo e à decisão'], ['I', 'Traz energia e conversa espontânea'], ['S', 'Escuta com paciência e constrói confiança'], ['C', 'Faz perguntas específicas e busca dados'],
  ] },
  { name: 'q2', title: 'Como costuma avaliar uma proposta?', options: [
    ['D', 'Decide rapidamente quando vê o resultado'], ['I', 'Conversa sobre possibilidades e envolve outras pessoas'], ['S', 'Considera o impacto para as pessoas e a continuidade'], ['C', 'Compara informações, critérios e detalhes'],
  ] },
  { name: 'q3', title: 'Em uma reunião, o que tende a fazer?', options: [
    ['D', 'Puxa a conversa para decisões e próximos passos'], ['I', 'Compartilha ideias e anima a discussão'], ['S', 'Ajuda o grupo a ouvir todos e manter alinhamento'], ['C', 'Aponta lacunas e pede precisão'],
  ] },
  { name: 'q4', title: 'Que situação parece gerar mais desconforto?', options: [
    ['D', 'Demora e falta de definição'], ['I', 'Rotina rígida e conversa sem troca'], ['S', 'Pressão, conflito ou mudança sem aviso'], ['C', 'Informação vaga ou trabalho impreciso'],
  ] },
] as const;

function Preferences({ value }: { value?: CommunicationPreferences }) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="text-sm">Canal preferido informado
      <select name="preferredChannel" className="input mt-1" defaultValue={value?.preferredChannel ?? 'unknown'}>
        <option value="unknown">Ainda não informado</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="linkedin">LinkedIn</option><option value="call">Ligação</option>
      </select>
    </label>
    <label className="text-sm">Formato preferido informado
      <select name="preferredFormat" className="input mt-1" defaultValue={value?.preferredFormat ?? 'unknown'}>
        <option value="unknown">Ainda não informado</option><option value="text">Texto</option><option value="bullets">Tópicos curtos</option><option value="meeting">Reunião</option><option value="audio">Áudio</option>
      </select>
    </label>
    <label className="text-sm sm:col-span-2">Observação de preferência (opcional)
      <textarea name="notes" className="input mt-1 min-h-20" maxLength={500} defaultValue={value?.notes ?? ''} placeholder="Registre apenas preferências comunicadas ou observadas em conversa." />
    </label>
  </div>;
}

export function CommunicationView({ leads }: { leads: Lead[] }) {
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');
  const [manualState, manualAction] = useActionState(saveDeclaredProfileAction, undefined);
  const [quizState, quizAction] = useActionState(saveObservedProfileAction, undefined);
  const lead = leads.find((item) => item.id === leadId);
  const profile = lead?.profile;
  const guidance = profile?.guidance ?? getCommunicationGuidance(profile?.profileType ?? null);

  if (!leads.length) return <section className="card p-5">
    <h2 className="font-semibold">Nenhum contato na sua carteira</h2>
    <p className="mt-2 text-sm text-muted">Adicione ou atribua contatos à sua carteira para registrar preferências e observações de comunicação.</p>
  </section>;

  return <div className="space-y-5">
    <section className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-accent text-accent"><MessageCircle className="h-5 w-5" /></span>
        <div><h2 className="font-semibold">Contato da sua carteira</h2><p className="text-sm text-muted">Somente o responsável atual pelo lead pode consultar e atualizar este perfil.</p></div>
      </div>
      <label className="block text-sm">Contato
        <select className="input mt-1" value={leadId} onChange={(event) => setLeadId(event.target.value)}>
          {leads.map((item) => <option key={item.id} value={item.id}>{item.fullName}{item.company ? ` · ${item.company}` : ''}</option>)}
        </select>
      </label>
      {!profile ? <p className="rounded-lg bg-surface-accent p-3 text-sm text-muted">Tipo indisponível: ainda não há informação registrada. Você pode salvar preferências sem classificar o contato.</p> : (
        <div className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{profile.profileType ? TYPE_LABELS[profile.profileType] : 'Tipo indisponível'}</strong>
            <span className={`pill ${profile.evidenceLabel === 'estimate' ? 'bg-warning-soft text-warning' : 'bg-surface-accent text-accent'}`}>
              {profile.evidenceLabel === 'estimate' ? 'Estimativa do questionário' : profile.evidenceLabel === 'declared' ? 'Informado manualmente' : 'Sem evidência suficiente'}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">Atualizado em {new Date(profile.assessedAt).toLocaleDateString('pt-BR')} · {profile.source === 'observational_quiz' ? 'respostas de observação' : 'informação registrada pelo vendedor'}</p>
          {profile.evidenceLabel === 'estimate' && <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm">Esta é uma estimativa baseada em respostas sobre comportamentos observados. Não é um fato sobre a personalidade. Revise com respeito e prefira perguntar diretamente sobre as preferências.</p>}
          {profile.preferences.preferredChannel !== 'unknown' || profile.preferences.preferredFormat !== 'unknown' || profile.preferences.notes ? <p className="mt-3 text-sm text-muted">Preferências informadas: {[profile.preferences.preferredChannel !== 'unknown' ? profile.preferences.preferredChannel : '', profile.preferences.preferredFormat !== 'unknown' ? profile.preferences.preferredFormat : '', profile.preferences.notes].filter(Boolean).join(' · ')}</p> : null}
          {guidance ? <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
            <div><p className="text-sm font-medium">Tom e formato sugeridos</p><p className="mt-1 text-sm text-muted">{guidance.tone} {guidance.format}</p><p className="mt-2 text-sm text-muted">{guidance.channel}</p><blockquote className="mt-3 rounded-lg bg-surface p-3 text-sm">“{guidance.opening}”</blockquote></div>
            <div><p className="text-sm font-medium">O que ajuda</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{guidance.helpful.map((item) => <li key={item}>{item}</li>)}</ul><p className="mt-3 text-sm font-medium">Evite</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{guidance.avoid.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div> : <p className="mt-3 text-sm text-muted">Sem classificação, não há recomendação automática. Pergunte ao contato como prefere receber informações.</p>}
        </div>
      )}
    </section>

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="card space-y-4 p-5">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-accent" /><div><h2 className="font-semibold">Registrar informação declarada</h2><p className="text-sm text-muted">Use um tipo apenas quando o contato ou vendedor o informar. Preferências podem ser salvas sem tipo.</p></div></div>
        <form action={manualAction} className="space-y-4">
          <input type="hidden" name="leadId" value={leadId} />
          <label className="block text-sm">Tipo informado pelo contato ou vendedor
            <select name="profileType" className="input mt-1" defaultValue={profile?.source === 'manual' ? profile.profileType ?? '' : ''}>
              <option value="">Sem tipo declarado</option>{DISC_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm text-muted"><input type="checkbox" name="clearType" className="mt-1" /> Remover a classificação atual. Sem marcar, salvar preferências mantém a avaliação existente.</label>
          <Preferences value={profile?.preferences} />
          <FormMessage state={manualState} />
          <Submit pendingText="Salvando…"><ShieldCheck className="h-4 w-4" /> Salvar informação declarada</Submit>
        </form>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-violet" /><div><h2 className="font-semibold">Questionário breve de observação</h2><p className="text-sm text-muted">Responda com exemplos observados em conversas. O resultado será marcado como estimativa; respostas equilibradas não geram classificação.</p></div></div>
        <form action={quizAction} className="space-y-4">
          <input type="hidden" name="leadId" value={leadId} />
          {QUESTIONS.map((question) => <fieldset className="space-y-2" key={question.name}>
            <legend className="text-sm font-medium">{question.title}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map(([type, label]) => <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 text-sm" key={type}>
                <input type="radio" name={question.name} value={type} required className="mt-0.5" defaultChecked={profile?.source === 'observational_quiz' && profile.answers[question.name] === type} />{label}
              </label>)}
            </div>
          </fieldset>)}
          <Preferences value={profile?.preferences} />
          <FormMessage state={quizState} />
          <Submit pendingText="Salvando…"><Sparkles className="h-4 w-4" /> Salvar respostas e atualizar estimativa</Submit>
        </form>
      </section>
    </div>
  </div>;
}

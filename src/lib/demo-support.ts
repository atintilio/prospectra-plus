/**
 * Seed de demonstração — módulo de suporte (Helpin).
 *
 * Preenche a org de demonstração com o suporte inteiro funcionando:
 * times de atendimento, conversas (web, WhatsApp e interno) com etiquetas e SLA,
 * mensagens (perguntas do cliente, respostas do agente e notas internas), política
 * de SLA, horário de atendimento, formulário pré-chat, central de ajuda, documentos
 * internos e tarefas de follow-up.
 *
 * Regras:
 * - Nada de rede: só INSERTs em dados fictícios já coerentes com a demo
 *   (Atlas Consultoria: contadores e indústria, crédito tributário e reforma tributária).
 * - Sem `server-only`: o módulo é chamado no login (servidor), mas não vira
 *   dependência de código de cliente.
 * - Idempotente: cada linha recebe um id determinístico (uuid estável por chave),
 *   então rodar o seed de novo não duplica nada.
 * - O formato dos INSERTs segue o schema real (`src/db/schema.ts`): `labels` é
 *   `text[]`, `status` é 'open' | 'closed', `channel` é 'web' | 'whatsapp' | 'internal'
 *   e as mensagens usam `author` ('visitor' | 'agent' | 'system').
 */
import { count, eq, inArray } from 'drizzle-orm';
import { schema, type DB } from '@/db';

/** Contexto compartilhado do seed de demonstração (contrato da demo). */
export type DemoCtx = {
  orgId: string;
  userId: string;
  userIds: string[];
  leads: Array<{
    id: string;
    fullName: string;
    company: string;
    headline: string;
    stage: string;
    ownerId: string;
  }>;
  now: Date;
  rand: () => number;
};

/** Resumo do que o seed criou (o dono usa para log e testes). */
export type SupportSeedSummary = {
  teams: number;
  teamMembers: number;
  conversations: number;
  messages: number;
  slaPolicies: number;
  schedules: number;
  prechatForms: number;
  helpArticles: number;
  docs: number;
  tasks: number;
};

const TEAM_COMERCIAL = 'Atendimento comercial';
const TEAM_TECNICO = 'Suporte técnico';

const MIN = 60_000;

/** UUID estável (v4-like) derivado de um texto: mesmo texto, mesmo id. */
function stableUuid(seed: string): string {
  const offsets = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const parts = offsets.map((offset) => {
    let h = offset >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  });
  const s = parts.join('');
  const variant = (parseInt(s.slice(16, 17), 16) % 4).toString(16); // 8, 9, a ou b
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${variant}${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

/** Telefone fictício no padrão `+55 51 9XXXX-XXXX` (nunca um número real). */
function fakePhone(seed: string): string {
  const digits = stableUuid(seed)
    .replace(/-/g, '')
    .split('')
    .map((c) => String(parseInt(c, 16) % 10))
    .join('');
  return `+55 51 9${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
}

/** E-mail fictício do visitante (`@demo.invalid`). */
function fakeEmail(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
  return `${slug || 'visitante'}@demo.invalid`;
}

/** Substitui {chaves} no texto do seed pelos dados do lead (coerência da demo). */
function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

type SeedMessage = {
  author: 'visitor' | 'agent' | 'system';
  authorUserId?: string | null;
  body: string;
  private?: boolean;
  mentions?: string[];
  providerId?: string | null;
  at: Date;
};

type SeedConversation = {
  key: string;
  channel: 'web' | 'whatsapp' | 'internal';
  audience: 'customer' | 'product';
  subject: string;
  /** Nome do lead da demo que originou a conversa (quando houver). */
  leadName?: string;
  /** Nome do visitante quando o lead não existe na demo (fallback). */
  visitorName?: string;
  visitorCompany?: string;
  visitorRole?: string;
  labels: string[];
  teamName?: string;
  assignedTo?: string | null;
  createdAt: Date;
  lastMessageAt: Date;
  slaDueAt?: Date | null;
  resolvedAt?: Date | null;
  csatRating?: number | null;
  csatComment?: string | null;
  csatSentAt?: Date | null;
  autoReplied?: boolean;
  messages: SeedMessage[];
};

/**
 * Cria (uma vez) o módulo de suporte da demonstração: times, conversas, mensagens,
 * SLA, horário, pré-chat, central de ajuda, documentos e tarefas.
 */
export async function seedSupport(db: DB, ctx: DemoCtx): Promise<SupportSeedSummary> {
  const { orgId, now } = ctx;
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MIN);
  const ahead = (minutes: number) => new Date(now.getTime() + minutes * MIN);
  // pequena variação determinística nos horários (usa o rand do contrato)
  const jitter = () => Math.floor(ctx.rand() * 3);

  // ── Equipe fictícia (nomes/e-mails dos usuários da org) ──────────────────
  const memberIds = [ctx.userId, ...ctx.userIds].filter((id) => typeof id === 'string' && id.length > 0);
  const members = memberIds.length
    ? await db
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(inArray(schema.users.id, memberIds))
    : [];
  const memberById = new Map(members.map((m) => [m.id, m]));
  const bruna = ctx.userIds[0] ?? null;
  const caio = ctx.userIds[1] ?? null;
  const isadora = ctx.userIds[2] ?? null;

  // ── Leads da demo ────────────────────────────────────────────────────────
  const leadByName = (name: string) => ctx.leads.find((l) => l.fullName === name) ?? null;

  // ── Times de atendimento ─────────────────────────────────────────────────
  const teamNames = [TEAM_COMERCIAL, TEAM_TECNICO];
  await db
    .insert(schema.supportTeams)
    .values(teamNames.map((name) => ({ orgId, name })))
    .onConflictDoNothing();
  const teams = await db.select().from(schema.supportTeams).where(eq(schema.supportTeams.orgId, orgId));
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));

  const teamMembers: Array<{ teamId: string; userId: string }> = [];
  const comercial = teamIdByName.get(TEAM_COMERCIAL);
  const tecnico = teamIdByName.get(TEAM_TECNICO);
  if (comercial) {
    teamMembers.push({ teamId: comercial, userId: ctx.userId });
    if (bruna) teamMembers.push({ teamId: comercial, userId: bruna });
    if (caio) teamMembers.push({ teamId: comercial, userId: caio });
  }
  if (tecnico) {
    teamMembers.push({ teamId: tecnico, userId: ctx.userId });
    if (isadora) teamMembers.push({ teamId: tecnico, userId: isadora });
  }
  if (teamMembers.length) {
    await db.insert(schema.supportTeamMembers).values(teamMembers).onConflictDoNothing();
  }

  // ── Conversas ────────────────────────────────────────────────────────────
  const convSpecs: SeedConversation[] = [
    {
      key: 'risco-sla',
      channel: 'web',
      audience: 'customer',
      subject: 'Crédito de ICMS não aparece no relatório de apuração',
      leadName: 'Mariana Duarte',
      visitorName: 'Mariana Duarte',
      visitorCompany: 'Metalúrgica Vale do Sul',
      visitorRole: 'CFO',
      labels: ['urgente', 'credito-tributario'],
      teamName: TEAM_COMERCIAL,
      assignedTo: ctx.userId,
      createdAt: ago(220 + jitter()),
      lastMessageAt: ago(55 + jitter()),
      slaDueAt: ahead(20 + jitter()),
      messages: [
        {
          author: 'visitor',
          body: 'Bom dia! Estou tentando gerar o relatório de crédito de ICMS da {empresa} e a coluna de compensação aparece zerada. Já conferi o saldo do período e o XML da EFD.',
          at: ago(220 + jitter()),
        },
        {
          author: 'visitor',
          body: 'Alguém consegue olhar hoje? Preciso fechar a apuração até amanhã e a pessoa responsável ({cargo}) ainda não respondeu do time.',
          at: ago(60 + jitter()),
        },
        {
          author: 'agent',
          authorUserId: ctx.userId,
          private: true,
          mentions: [ctx.userId],
          body: 'Cliente veio do time comercial e pediu retorno ainda hoje. Hipótese: o saldo está como "crédito a compensar" e falta o Upload do EFD ICMS. Vou pedir o XML do período antes de responder.',
          at: ago(55 + jitter()),
        },
      ],
    },
    {
      key: 'parceria-whatsapp',
      channel: 'whatsapp',
      audience: 'customer',
      subject: 'Dúvida sobre indicação de cliente de escritório contábil',
      leadName: 'André Souza',
      visitorName: 'André Souza',
      visitorCompany: 'Souza & Rocha Contadores',
      visitorRole: 'Sócio',
      labels: ['parceria', 'contadores'],
      teamName: TEAM_COMERCIAL,
      assignedTo: ctx.userId,
      createdAt: ago(120 + jitter()),
      lastMessageAt: ago(35 + jitter()),
      slaDueAt: ahead(120 + jitter()),
      autoReplied: true,
      messages: [
        {
          author: 'visitor',
          body: 'Olá! Somos o {empresa}. Vi o material de crédito tributário e quero entender como funciona a parceria para escritórios: o cliente recebe o diagnóstico por nós?',
          at: ago(120 + jitter()),
          providerId: 'demo-wa-parceria-1',
        },
        {
          author: 'system',
          body: 'Recebemos sua mensagem! Nosso atendimento funciona de segunda a sexta, das 9h às 18h (horário de Brasília). Respondemos ainda hoje.',
          at: ago(119 + jitter()),
        },
        {
          author: 'agent',
          authorUserId: caio ?? ctx.userId,
          body: 'Olá, {nome}! No modelo de parceria o escritório indica o cliente, nós levantamos os documentos fiscais e entregamos o laudo de crédito — com suporte na formalização da recuperação. Posso te enviar o regulamento e a tabela de valores?',
          at: ago(80 + jitter()),
        },
        {
          author: 'visitor',
          body: 'Perfeito, pode enviar. E vocês atendem escritórios do interior de SC?',
          at: ago(35 + jitter()),
          providerId: 'demo-wa-parceria-2',
        },
      ],
    },
    {
      key: 'resolvida-csat-5',
      channel: 'web',
      audience: 'customer',
      subject: 'Nota fiscal de serviço não emite no ambiente de homologação',
      leadName: 'Patrícia Lemos',
      visitorName: 'Patrícia Lemos',
      visitorCompany: 'Rede Farmaviva',
      visitorRole: 'Gerente Tributária',
      labels: ['nota-fiscal', 'homologacao'],
      teamName: TEAM_TECNICO,
      assignedTo: ctx.userId,
      createdAt: ago(4320 + jitter()),
      lastMessageAt: ago(4020 + jitter()),
      slaDueAt: ago(4080 + jitter()),
      resolvedAt: ago(4020 + jitter()),
      csatRating: 5,
      csatComment: 'Resposta muito rápida e o passo a passo funcionou de primeira. Salvou o fechamento do mês.',
      csatSentAt: ago(3900 + jitter()),
      messages: [
        {
          author: 'visitor',
          body: 'A emissão da NFS-e está travando com erro de certificado no ambiente de homologação. Já conferi a cadeia do certificado.',
          at: ago(4320 + jitter()),
        },
        {
          author: 'agent',
          authorUserId: ctx.userId,
          body: 'Oi, {nome}! O erro acontece quando o certificado tem a chave com CNPJ divergente do emitente. Reenvie o certificado com o CNPJ da {empresa} e, enquanto isso, deixo o emissor em contingência.',
          at: ago(4200 + jitter()),
        },
        {
          author: 'visitor',
          body: 'Funcionou! Emitimos as três notas que faltavam. Muito obrigada pela ajuda.',
          at: ago(4020 + jitter()),
        },
      ],
    },
    {
      key: 'resolvida-csat-3',
      channel: 'whatsapp',
      audience: 'customer',
      subject: 'Prazo de entrega do diagnóstico tributário',
      leadName: 'Camila Ferraz',
      visitorName: 'Camila Ferraz',
      visitorCompany: 'Transportes Rota Sul',
      visitorRole: 'Head de Controladoria',
      labels: ['prazo-entrega', 'credito-tributario'],
      teamName: TEAM_COMERCIAL,
      assignedTo: ctx.userId,
      createdAt: ago(2880 + jitter()),
      lastMessageAt: ago(2520 + jitter()),
      slaDueAt: ago(2640 + jitter()),
      resolvedAt: ago(2520 + jitter()),
      csatRating: 3,
      csatComment: 'A resposta veio, mas demorou e faltou um exemplo prático do laudo. Precisávamos de um prazo claro para levar à diretoria.',
      csatSentAt: ago(2220 + jitter()),
      messages: [
        {
          author: 'visitor',
          body: 'Oi! Contratamos o diagnóstico de crédito tributário. Qual o prazo de entrega do laudo? Precisamos apresentar para a diretoria até o fim do mês.',
          at: ago(2880 + jitter()),
          providerId: 'demo-wa-prazo-1',
        },
        {
          author: 'agent',
          authorUserId: ctx.userId,
          body: 'Oi, {nome}! O prazo padrão é de 10 dias úteis após o recebimento dos arquivos. Para a {empresa}, com o volume de notas que vocês têm, consigo antecipar para 7 dias.',
          at: ago(2700 + jitter()),
        },
        {
          author: 'visitor',
          body: 'Perfeito, 7 dias atendem. Vou pedir ao nosso contador para compilar os arquivos e envio por aqui.',
          at: ago(2520 + jitter()),
          providerId: 'demo-wa-prazo-2',
        },
      ],
    },
    {
      key: 'interno-importacao',
      channel: 'internal',
      audience: 'product',
      subject: 'Importação de escrituração contábil trava na planilha de diagnóstico',
      labels: ['importacao', 'bug'],
      teamName: TEAM_TECNICO,
      assignedTo: ctx.userId,
      createdAt: ago(300 + jitter()),
      lastMessageAt: ago(25 + jitter()),
      slaDueAt: null,
      messages: [
        {
          author: 'visitor',
          authorUserId: bruna,
          body: 'Estou tentando importar a escrituração contábil de um cliente do modelo de diagnóstico e o processo trava em 80%. O arquivo tem 60 mil linhas.',
          at: ago(300 + jitter()),
        },
        {
          author: 'agent',
          authorUserId: ctx.userId,
          body: 'Oi, {visitante}! Vi o log: a importação para quando o arquivo passa de 50 mil linhas e o job estoura o tempo de espera. Vou pedir para o time aumentar o limite e te aviso assim que subir.',
          at: ago(120 + jitter()),
        },
        {
          author: 'agent',
          authorUserId: ctx.userId,
          private: true,
          mentions: [ctx.userId],
          body: 'Regra para o produto: acima de 50 mil linhas o job de importação deve ser enfileirado, não processado na requisição. Chamado interno aberto com o time.',
          at: ago(25 + jitter()),
        },
      ],
    },
    {
      key: 'sla-violado',
      channel: 'web',
      audience: 'customer',
      subject: 'Diagnóstico de crédito para pessoa jurídica do agronegócio',
      leadName: 'Eduardo Matsuda',
      visitorName: 'Eduardo Matsuda',
      visitorCompany: 'AgroNorte Insumos',
      visitorRole: 'CEO',
      labels: ['diagnostico', 'agronegocio'],
      teamName: TEAM_COMERCIAL,
      assignedTo: ctx.userId,
      createdAt: ago(300 + jitter()),
      lastMessageAt: ago(30 + jitter()),
      slaDueAt: ago(60 + jitter()),
      messages: [
        {
          author: 'visitor',
          body: 'Olá! Somos da {empresa}. Quero entender como o diagnóstico de crédito funciona para uma pessoa jurídica do agronegócio — o que preciso enviar?',
          at: ago(300 + jitter()),
        },
        {
          author: 'agent',
          authorUserId: isadora ?? ctx.userId,
          body: 'Oi, {nome}! Para o agro precisamos da ECF, do EFD ICMS/IPI e dos balancetes dos últimos três anos. Com isso montamos o diagnóstico de crédito e a simulação do impacto no caixa.',
          at: ago(30 + jitter()),
        },
        {
          author: 'visitor',
          body: 'Ótimo. Vou pedir ao nosso contador para compilar os arquivos e retorno na semana que vem.',
          at: ago(20 + jitter()),
        },
      ],
    },
  ];

  const conversationIds: string[] = [];
  for (const spec of convSpecs) {
    const lead = spec.leadName ? leadByName(spec.leadName) : null;
    // conversa interna: quem abriu o chamado é o primeiro membro da equipe fictícia
    const internalMember = spec.channel === 'internal' ? memberById.get(ctx.userIds[0] ?? '') ?? null : null;
    const visitorName = lead?.fullName ?? internalMember?.name ?? spec.visitorName ?? 'Visitante da demo';
    const visitorCompany = lead?.company ?? spec.visitorCompany ?? '';
    const visitorRole = lead?.headline ?? spec.visitorRole ?? '';
    const vars = {
      nome: (lead?.fullName ?? visitorName).split(' ')[0],
      empresa: visitorCompany || 'a empresa',
      cargo: visitorRole || 'a diretoria',
      visitante: visitorName.split(' ')[0],
    };
    const id = stableUuid(`${orgId}:demo:support:conversation:${spec.key}`);
    conversationIds.push(id);
    await db
      .insert(schema.supportConversations)
      .values({
        id,
        orgId,
        leadId: lead?.id ?? null,
        assignedTo: spec.assignedTo ?? null,
        teamId: spec.teamName ? teamIdByName.get(spec.teamName) ?? null : null,
        audience: spec.audience,
        channel: spec.channel,
        status: spec.resolvedAt ? 'closed' : 'open',
        subject: spec.subject,
        visitorName,
        visitorEmail: lead ? fakeEmail(lead.fullName) : internalMember?.email ?? fakeEmail(visitorName),
        visitorPhone: spec.channel === 'internal' ? '' : fakePhone(`${orgId}:${spec.key}`),
        labels: spec.labels,
        lastMessageAt: spec.lastMessageAt,
        slaDueAt: spec.slaDueAt ?? null,
        resolvedAt: spec.resolvedAt ?? null,
        autoReplied: spec.autoReplied ?? false,
        csatRating: spec.csatRating ?? null,
        csatComment: spec.csatComment ?? null,
        csatSentAt: spec.csatSentAt ?? null,
        createdAt: spec.createdAt,
      })
      .onConflictDoNothing({ target: schema.supportConversations.id });

    const messageRows = spec.messages.map((msg, index) => ({
      id: stableUuid(`${orgId}:demo:support:message:${spec.key}:${index}`),
      conversationId: id,
      author: msg.author,
      authorUserId: msg.authorUserId ?? null,
      body: fill(msg.body, vars),
      private: msg.private ?? false,
      mentions: msg.mentions ?? [],
      providerId: msg.providerId ? `${orgId}:${msg.providerId}` : null,
      createdAt: msg.at,
    }));
    if (messageRows.length) {
      await db.insert(schema.supportMessages).values(messageRows).onConflictDoNothing();
    }
  }

  // ── Política de SLA (uma por operação) ───────────────────────────────────
  await db
    .insert(schema.supportSlaPolicies)
    .values({
      orgId,
      firstResponseMinutes: 240, // 4h para a primeira resposta
      resolutionMinutes: 2880, // 48h para resolver
      businessHoursOnly: true,
    })
    .onConflictDoUpdate({
      target: schema.supportSlaPolicies.orgId,
      set: { firstResponseMinutes: 240, resolutionMinutes: 2880, businessHoursOnly: true },
    });

  // ── Horário de atendimento + auto-resposta ───────────────────────────────
  await db
    .insert(schema.supportSchedules)
    .values({
      orgId,
      timezone: 'America/Sao_Paulo',
      weekdays: [1, 2, 3, 4, 5],
      openMinute: 9 * 60,
      closeMinute: 18 * 60,
      autoReplyEnabled: true,
      autoReplyMessage:
        'Recebemos sua mensagem! Nosso atendimento funciona de segunda a sexta, das 9h às 18h (horário de Brasília). Respondemos ainda hoje.',
    })
    .onConflictDoUpdate({
      target: schema.supportSchedules.orgId,
      set: {
        timezone: 'America/Sao_Paulo',
        weekdays: [1, 2, 3, 4, 5],
        openMinute: 9 * 60,
        closeMinute: 18 * 60,
        autoReplyEnabled: true,
        autoReplyMessage:
          'Recebemos sua mensagem! Nosso atendimento funciona de segunda a sexta, das 9h às 18h (horário de Brasília). Respondemos ainda hoje.',
      },
    });

  // ── Formulário pré-chat ──────────────────────────────────────────────────
  const prechatId = stableUuid(`${orgId}:demo:support:prechatform`);
  await db
    .insert(schema.supportPrechatForms)
    .values({
      id: prechatId,
      orgId,
      name: 'Pré-chat — dúvidas sobre crédito tributário',
      fields: [
        { id: 'nome', label: 'Nome', type: 'text', required: true },
        { id: 'empresa', label: 'Empresa', type: 'text', required: true },
        {
          id: 'assunto',
          label: 'Assunto',
          type: 'select',
          required: true,
          options: ['Crédito tributário', 'Reforma tributária', 'Nota fiscal', 'Dúvida sobre a plataforma'],
        },
        { id: 'mensagem', label: 'Mensagem', type: 'textarea', required: true },
      ],
      active: true,
    })
    .onConflictDoNothing({ target: schema.supportPrechatForms.id });

  // ── Central de ajuda ─────────────────────────────────────────────────────
  const articles: Array<{ slug: string; title: string; body: string; updatedAt: Date }> = [
    {
      slug: 'como-funciona-o-diagnostico-de-credito-tributario',
      title: 'Como funciona o diagnóstico de crédito tributário',
      body: [
        'O diagnóstico cruza os arquivos fiscais da empresa (ECF, EFD ICMS/IPI, balancetes e o ECD dos últimos três anos) e estima o crédito de ICMS, IPI e IRRF disponível.',
        '',
        '**O que o cliente recebe:**',
        '- Laudo com o valor estimado do crédito e o prazo de compensação;',
        '- Memória de cálculo aberta (por período, por filial e por grupo de CFOP);',
        '- Plano de regularização com o caminho mais curto entre homologação e compensação.',
        '',
        'O laudo sai em até 10 dias úteis após o recebimento completo dos arquivos. Para escritórios contábeis, o modelo de parceria entrega o documento pronto para o cliente final.',
      ].join('\n'),
      updatedAt: ago(60 * 24 * 12),
    },
    {
      slug: 'credito-acumulado-de-icms-e-ipire-como-usar',
      title: 'Crédito acumulado de ICMS e IPI: como usar na prática',
      body: [
        'Crédito acumulado não é desconto: é saldo do estado (ICMS) e da União (IPI/IPRF) que só volta à empresa em uma hipótese de uso aprovada.',
        '',
        '**Formas mais comuns de uso:**',
        '- compensação com o próprio ICMS/IPI devido;',
        '- restituição via TEC (Transferência de Créditos do ICMS);',
        '- regimes específicos, como o art. 33 da Lei 12.973/2014 para investimento.',
        '',
        'Antes de qualquer operação, o crédito precisa estar regular: EFD ICMS e EFD Contribuições Federais conferidos, sem pendência de ECF ou IOF.',
      ].join('\n'),
      updatedAt: ago(60 * 24 * 9),
    },
    {
      slug: 'reforma-tributaria-o-que-muda-para-a-contabilidade',
      title: 'Reforma tributária: o que muda para a contabilidade do cliente',
      body: [
        'A reforma tributária (EC 132/2023 e LC 214/2025) muda a forma de tributar o consumo e cria o IBS, a CBS e o imposto seletivo.',
        '',
        '**O que o contador precisa revisar agora:**',
        '- CBS e IBS no cálculo do preço de venda e nas margens;',
        '- split payment do imposto e o fluxo de caixa do negócio;',
        '- escrituração dos novos tributos e o saneamento dos cadastros de itens (NCM e CEST).',
        '',
        'A Atlas publica mensalmente um roteiro de adequação por setor — peça a versão de indústria ou serviços ao time de atendimento.',
      ].join('\n'),
      updatedAt: ago(60 * 24 * 5),
    },
    {
      slug: 'nota-fiscal-eletronica-contingencia-e-erros-comuns',
      title: 'Nota fiscal eletrônica: contingência e erros mais comuns',
      body: [
        'Quando o SEFAZ está indisponível, a NFS-e pode ser emitida em contingência e depois retransmitida quando o serviço volta.',
        '',
        '**Erros que mais chegam no atendimento:**',
        '- certificado com o CNPJ divergente do emitente (a cadeia precisa ter o CNPJ do emitente);',
        '- incompatibilidade de versão do layout (é preciso acompanhar a versão publicada pelo SEFAZ);',
        '- RPS já integrado ao cliente sendo emitido em duplicidade.',
        '',
        'Se a sua emissão travou, chame o suporte com o código do erro e a faixa do certificado que você usa.',
      ].join('\n'),
      updatedAt: ago(60 * 24 * 2),
    },
  ];
  for (const article of articles) {
    await db
      .insert(schema.helpArticles)
      .values({
        orgId,
        slug: article.slug,
        title: article.title,
        body: article.body,
        status: 'published',
        updatedAt: article.updatedAt,
      })
      .onConflictDoNothing();
  }

  // ── Documentos internos do time ───────────────────────────────────────────
  const docs: Array<{ key: string; title: string; body: string; updatedAt: Date }> = [
    {
      key: 'roteiro-diagnostico',
      title: 'Roteiro de diagnóstico — linha de crédito tributário',
      body: [
        '1. Qualificar: porte, regime (Lucro Real/Presumido/Simples), estados com origem e destino.',
        '2. Pedir documentos: ECF, EFD ICMS/IPI, ECD, balancetes de 3 anos e memória dos lançamentos do período.',
        '3. Checar pendências: ECF/ECD retificadora, IOF e divergência de estoque.',
        '4. Entregar laudo com dois cenários: compensação pura e compensação com regularização.',
        '5. Follow-up em 30 dias: o cliente já consumiu o crédito? Em caso negativo, revisitar a hipótese.',
      ].join('\n'),
      updatedAt: ago(60 * 24 * 3),
    },
    {
      key: 'checklist-reforma-tributaria',
      title: 'Checklist de implantação da reforma tributária na contabilidade do cliente',
      body: [
        '**Cadastros:** NCM/CEST revisados, status de item elegível e cadastro de operações não elegíveis por filial.',
        '**Processos:** segregação de CBS no preço, split payment no caixa e trilha de auditoria por venda.',
        '**Relatórios:** EBITDA da IBS/CBS, carga tributária efetiva e comparativo trimestral.',
        '**Treinamento:** reunião de 1h com o time do cliente e material de apoio da Atlas.',
      ].join('\n'),
      updatedAt: ago(60 * 24 * 8),
    },
    {
      key: 'regra-sla-atendimento',
      title: 'Regra de SLA do time de atendimento comercial',
      body: [
        'Prazo de primeira resposta: 4 horas úteis (das 9h às 18h, seg a sex).',
        'Prazo de resolução: 48 horas.',
        '**Escalonamento:** SLA a menos de 30 min do vencimento → nota interna na conversa com menção ao responsável.',
        'Conversas com risco de SLA entram na fila do time no mesmo dia; cliente de contrato tem precedência sobre demanda avulsa.',
      ].join('\n'),
      updatedAt: ago(60 * 24 * 1),
    },
  ];
  for (const doc of docs) {
    await db
      .insert(schema.docs)
      .values({
        id: stableUuid(`${orgId}:demo:support:doc:${doc.key}`),
        orgId,
        authorId: ctx.userId,
        title: doc.title,
        body: doc.body,
        updatedAt: doc.updatedAt,
      })
      .onConflictDoNothing({ target: schema.docs.id });
  }

  // ── Tarefas de follow-up ─────────────────────────────────────────────────
  const tasks: Array<{ key: string; title: string; status: 'todo' | 'doing' | 'done'; assignedTo: string | null; leadName?: string }> = [
    {
      key: 'followup-metalurgica',
      title: 'Enviar proposta de compensação de ICMS — Metalúrgica Vale do Sul',
      status: 'doing',
      assignedTo: ctx.userId,
      leadName: 'Mariana Duarte',
    },
    {
      key: 'followup-escritorio',
      title: 'Agendar reunião de fechamento — Souza & Rocha Contadores',
      status: 'todo',
      assignedTo: caio ?? ctx.userId,
      leadName: 'André Souza',
    },
    {
      key: 'followup-farmaviva',
      title: 'Revisar laudo de crédito tributário — Rede Farmaviva',
      status: 'done',
      assignedTo: ctx.userId,
      leadName: 'Patrícia Lemos',
    },
  ];
  for (const task of tasks) {
    await db
      .insert(schema.tasks)
      .values({
        id: stableUuid(`${orgId}:demo:support:task:${task.key}`),
        orgId,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedTo,
        leadId: task.leadName ? leadByName(task.leadName)?.id ?? null : null,
        updatedAt: ago(30 + jitter()),
      })
      .onConflictDoNothing({ target: schema.tasks.id });
  }

  // ── Resumo ───────────────────────────────────────────────────────────────
  const demoIds = conversationIds;
  const [conversationCount] = await db
    .select({ n: count() })
    .from(schema.supportConversations)
    .where(inArray(schema.supportConversations.id, demoIds));
  const [messageCount] = await db
    .select({ n: count() })
    .from(schema.supportMessages)
    .where(inArray(schema.supportMessages.conversationId, demoIds));
  const [teamCount] = await db.select({ n: count() }).from(schema.supportTeams).where(eq(schema.supportTeams.orgId, orgId));
  const [teamMemberCount] = await db
    .select({ n: count() })
    .from(schema.supportTeamMembers)
    .where(inArray(schema.supportTeamMembers.teamId, teams.map((t) => t.id)));
  const [slaCount] = await db.select({ n: count() }).from(schema.supportSlaPolicies).where(eq(schema.supportSlaPolicies.orgId, orgId));
  const [scheduleCount] = await db.select({ n: count() }).from(schema.supportSchedules).where(eq(schema.supportSchedules.orgId, orgId));
  const [prechatCount] = await db.select({ n: count() }).from(schema.supportPrechatForms).where(eq(schema.supportPrechatForms.orgId, orgId));
  const [articleCount] = await db.select({ n: count() }).from(schema.helpArticles).where(eq(schema.helpArticles.orgId, orgId));
  const [docCount] = await db.select({ n: count() }).from(schema.docs).where(eq(schema.docs.orgId, orgId));
  const [taskCount] = await db.select({ n: count() }).from(schema.tasks).where(eq(schema.tasks.orgId, orgId));

  return {
    teams: teamCount?.n ?? 0,
    teamMembers: teamMemberCount?.n ?? 0,
    conversations: conversationCount?.n ?? 0,
    messages: messageCount?.n ?? 0,
    slaPolicies: slaCount?.n ?? 0,
    schedules: scheduleCount?.n ?? 0,
    prechatForms: prechatCount?.n ?? 0,
    helpArticles: articleCount?.n ?? 0,
    docs: docCount?.n ?? 0,
    tasks: taskCount?.n ?? 0,
  };
}

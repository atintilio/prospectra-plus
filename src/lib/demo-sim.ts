import { and, desc, eq } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import type { ParsedLead } from '@/lib/leads-import';
import { completeAction, markOutcome, runScheduler } from '@/lib/cadence';

// Tudo aqui é SIMULAÇÃO: nenhuma chamada ao LinkedIn, nenhum envio real.

type Pool = ParsedLead & { sector: string };
const P = (fullName: string, headline: string, company: string, location: string, sector: string): Pool => ({
  fullName, headline, company, location, sector,
  linkedinUrl: `https://www.linkedin.com/in/${fullName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '-')}-sim`,
});

/** Base fictícia que a "busca de leads reais" devolve na demonstração. */
export const SEARCH_POOL: Pool[] = [
  P('Rafael Moura', 'CFO', 'Indústrias Moura Metais', 'Joinville, SC', 'industria metalurgia'),
  P('Daniela Krieger', 'Diretora Financeira', 'Krieger Plásticos', 'Blumenau, SC', 'industria plastico'),
  P('Marcos Vinícius Aguiar', 'CEO', 'Aguiar Alimentos', 'Chapecó, SC', 'industria alimentos'),
  P('Letícia Hoffmann', 'Controller', 'Hoffmann Têxtil', 'Brusque, SC', 'industria textil'),
  P('Sérgio Padilha', 'Diretor Financeiro', 'Padilha Embalagens', 'Itajaí, SC', 'industria embalagens'),
  P('Tatiana Schmitt', 'CFO', 'Schmitt Autopeças', 'Caxias do Sul, RS', 'industria autopecas'),
  P('Alexandre Bonfim', 'Gerente de Controladoria', 'Bonfim Logística', 'Curitiba, PR', 'logistica transporte'),
  P('Priscila Andrade', 'Head de Finanças', 'Andrade Saúde Hospitalar', 'Florianópolis, SC', 'saude hospital'),
  P('Vinícius Teles', 'CEO', 'Teles Agroindustrial', 'Rio Verde, GO', 'agro agroindustria'),
  P('Carolina Bastos', 'Diretora Tributária', 'Bastos Varejo', 'São Paulo, SP', 'varejo comercio'),
  P('Everton Pasqualotto', 'Sócio-diretor', 'Pasqualotto Construções', 'Passo Fundo, RS', 'construcao'),
  P('Mônica Ferreira', 'CFO', 'Ferreira Farma', 'Campinas, SP', 'farmaceutica saude'),
  P('Diego Lacerda', 'Gerente Financeiro', 'Lacerda Transportes', 'Londrina, PR', 'logistica transporte'),
  P('Helena Castelo', 'Diretora Financeira', 'Castelo Energia Solar', 'Belo Horizonte, MG', 'energia'),
  P('Jorge Cordeiro', 'CEO', 'Cordeiro Móveis', 'São Bento do Sul, SC', 'industria moveis'),
  P('Natália Rezende', 'Controller', 'Rezende Distribuidora', 'Goiânia, GO', 'distribuicao varejo'),
  P('Bruno Tavares', 'CFO', 'Tavares Siderurgia', 'Vitória, ES', 'industria siderurgia'),
  P('Gabriela Linhares', 'Head de Controladoria', 'Linhares Educação', 'Recife, PE', 'educacao servicos'),
  P('Fernando Zanetti', 'Diretor Financeiro', 'Zanetti Cerâmica', 'Criciúma, SC', 'industria ceramica'),
  P('Adriana Collares', 'Sócia', 'Collares Contadores Associados', 'Porto Alegre, RS', 'contabilidade contadores'),
  P('Rogério Salvador', 'Sócio-diretor', 'Salvador Assessoria Fiscal', 'Salvador, BA', 'contabilidade contadores'),
  P('Isabela Prates', 'CFO', 'Prates Hotéis e Resorts', 'Gramado, RS', 'turismo hotelaria'),
  P('Leonardo Giacomelli', 'Diretor', 'Giacomelli Máquinas Agrícolas', 'Cascavel, PR', 'agro industria'),
  P('Renata Vasques', 'Gerente Tributária', 'Vasques Atacado', 'Fortaleza, CE', 'distribuicao varejo'),
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Busca simulada: pontua por palavras da frase e devolve até 8 leads fictícios. */
export function searchDemoLeads(prompt: string): Pool[] {
  const words = norm(prompt).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const score = (p: Pool) => words.reduce((a, w) => a + (norm(`${p.fullName} ${p.headline} ${p.company} ${p.location} ${p.sector}`).includes(w) ? 1 : 0), 0);
  const ranked = [...SEARCH_POOL].map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s);
  return ranked.slice(0, 8).map((r) => r.p);
}

const first = (n: string) => n.split(' ')[0];
const REPLIES = [
  ['Oi! Interessante. Já ouvimos falar de crédito tributário, mas ainda não vimos uma proposta clara. Pode detalhar?', 'Claro, {nome}! Funciona assim: identificamos crédito homologado, cedemos à empresa e ela compensa o passivo tributário sem desembolso. Posso te mandar um diagnóstico gratuito da {empresa}? Leva 2 minutos para você validar.', 'info'],
  ['Boa tarde. Hoje nosso passivo federal é relevante. Faz sentido conversarmos.', 'Ótimo, {nome}! Vamos agendar 20 minutos. Tenho quinta às 10h ou sexta às 15h. Qual fica melhor? Já deixei um resumo do que analisaremos na {empresa}.', 'meeting'],
  ['Obrigado pelo contato, mas já temos um parceiro para isso.', 'Entendido, {nome}, obrigado por responder! Se em algum momento quiser uma segunda opinião sobre o passivo da {empresa}, fico à disposição. Sucesso por aí!', 'decline'],
  ['Pode me enviar um material por e-mail?', 'Com prazer, {nome}! Me passa o melhor e-mail e envio hoje um resumo de uma página com cases do setor da {empresa}.', 'info'],
] as const;
const POSTS = [
  ['Compartilhando como a Reforma Tributária vai mudar o fluxo de caixa das indústrias catarinenses nos próximos 2 anos.', 'Ponto muito relevante, {nome}. O acúmulo de crédito no período de transição é o que mais pesa no caixa. Vale monitorar de perto a compensação.'],
  ['Orgulho de anunciar a abertura da nossa terceira unidade. Obrigado ao time!', 'Parabéns pela expansão, {nome}! Crescimento assim pede atenção ao planejamento tributário. Sucesso na nova unidade!'],
  ['O que aprendi em 15 anos de gestão financeira: caixa é rei, mas previsibilidade é a coroa.', 'Concordo, {nome}. Previsibilidade tributária faz parte da equação, e muita empresa ainda subestima isso. Ótima reflexão.'],
  ['Estivemos no evento de CFOs em Florianópolis. Excelentes conversas sobre eficiência fiscal.', 'Que bom ver esse tema ganhando espaço, {nome}. A conversa sobre eficiência fiscal ficou muito mais madura nos últimos anos.'],
] as const;
const fill = (t: string, name: string, company: string) => t.replaceAll('{nome}', first(name)).replaceAll('{empresa}', company);

async function feed(db: DB, orgId: string, leadId: string | null, kind: import('@/db/schema').SimKind, body: string, detail = '', at = new Date()) {
  await db.insert(schema.simFeed).values({ orgId, leadId, kind, body, detail, at });
}

/** Preenche a linha do tempo inicial da demonstração (histórico coerente com os leads). */
export async function seedFeed(db: DB, orgId: string) {
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.orgId, orgId));
  const by = (stage: string) => leads.filter((l) => l.stage === stage);
  const t = (mins: number) => new Date(Date.now() - mins * 60_000);
  let n = 0;
  for (const l of by('meeting').slice(0, 2)) {
    await feed(db, orgId, l.id, 'reply', REPLIES[1][0], '', t(300 + n * 40));
    await feed(db, orgId, l.id, 'auto_reply', fill(REPLIES[1][1], l.fullName, l.company), 'meeting', t(298 + n * 40));
    await feed(db, orgId, l.id, 'handoff', 'Reunião sugerida: transferido para o closer com resumo da conversa.', '', t(290 + n * 40));
    n++;
  }
  for (const [i, l] of by('replied').slice(0, 3).entries()) {
    const r = REPLIES[[0, 3, 2][i % 3]];
    await feed(db, orgId, l.id, 'reply', r[0], '', t(200 - i * 30));
    await feed(db, orgId, l.id, 'auto_reply', fill(r[1], l.fullName, l.company), r[2], t(198 - i * 30));
  }
  for (const [i, l] of by('connected').slice(0, 3).entries()) {
    await feed(db, orgId, l.id, 'accept', `${l.fullName} aceitou seu convite.`, '', t(120 - i * 15));
    const p = POSTS[i % POSTS.length];
    await feed(db, orgId, l.id, 'post', p[0], 'há 2 h', t(90 - i * 10));
    await feed(db, orgId, l.id, 'comment', fill(p[1], l.fullName, l.company), 'comentário publicado pelo agente', t(85 - i * 10));
  }
  for (const [i, l] of by('invited').slice(0, 4).entries()) {
    await feed(db, orgId, l.id, 'invite', fill('Olá, {nome}! Acompanho o trabalho da {empresa} e gostaria de conectar.', l.fullName, l.company), '', t(60 - i * 8));
  }
}

/** Um ciclo do piloto automático (simulado): envia, aceita, responde, comenta publicações. */
export async function simulateCycle(db: DB, orgId: string): Promise<{ sent: number; accepted: number; replies: number; comments: number }> {
  const out = { sent: 0, accepted: 0, replies: 0, comments: 0 };
  // 1) envia o que está na fila (convites, mensagens, curtidas e comentários)
  const pending = await db.select({ a: schema.actions, lead: schema.leads }).from(schema.actions)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.actions.leadId))
    .where(and(eq(schema.actions.orgId, orgId), eq(schema.actions.status, 'pending'))).limit(12);
  for (const { a, lead } of pending) {
    await completeAction(db, orgId, a.userId, a.id, 'done');
    out.sent++;
    if (a.type === 'invite' || a.type === 'message') await feed(db, orgId, lead.id, a.type, a.body || `${a.type === 'invite' ? 'Convite' : 'Mensagem'} enviado a ${lead.fullName}.`);
    else if (a.type === 'comment') { await feed(db, orgId, lead.id, 'comment', a.body, 'comentário publicado pelo agente'); out.comments++; }
  }
  // 2) convites aceitos
  const invited = await db.select().from(schema.leads).where(and(eq(schema.leads.orgId, orgId), eq(schema.leads.stage, 'invited'))).limit(6);
  for (const l of invited.filter((_, i) => i % 2 === 0)) {
    await markOutcome(db, orgId, l.ownerId ?? '', l.id, 'accepted');
    await feed(db, orgId, l.id, 'accept', `${l.fullName} aceitou seu convite.`);
    out.accepted++;
  }
  // 3) respostas de leads conectados + resposta automática do agente
  const connected = await db.select().from(schema.leads).where(and(eq(schema.leads.orgId, orgId), eq(schema.leads.stage, 'connected'))).orderBy(desc(schema.leads.lastActivityAt)).limit(5);
  for (const [i, l] of connected.slice(0, 2).entries()) {
    const r = REPLIES[(Date.now() + i) % REPLIES.length];
    await markOutcome(db, orgId, l.ownerId ?? '', l.id, 'replied');
    await feed(db, orgId, l.id, 'reply', r[0]);
    await feed(db, orgId, l.id, 'auto_reply', fill(r[1], l.fullName, l.company), r[2]);
    if (r[2] === 'meeting') await feed(db, orgId, l.id, 'handoff', 'Reunião sugerida: transferido para o closer com resumo da conversa.');
    out.replies++;
  }
  // 4) publicações de conexões recentes → comentário com referência
  const recent = connected.slice(2, 4);
  for (const [i, l] of recent.entries()) {
    const p = POSTS[(Date.now() + i) % POSTS.length];
    await feed(db, orgId, l.id, 'post', p[0], 'há instantes');
    await feed(db, orgId, l.id, 'comment', fill(p[1], l.fullName, l.company), 'comentário publicado pelo agente');
    await db.insert(schema.events).values({ orgId, userId: l.ownerId, leadId: l.id, type: 'comment_sent' });
    out.comments++;
  }
  await runScheduler(db, { orgId }); // gera as próximas ações das cadências
  return out;
}

export async function addSearchResults(db: DB, orgId: string, ownerId: string, urls: string[], tag: string): Promise<number> {
  const picked = SEARCH_POOL.filter((p) => urls.includes(p.linkedinUrl));
  if (!picked.length) return 0;
  const res = await db.insert(schema.leads).values(picked.map((p) => ({ orgId, ownerId, linkedinUrl: p.linkedinUrl, fullName: p.fullName, headline: p.headline, company: p.company, location: p.location, tag, source: 'search' as const })))
    .onConflictDoNothing().returning({ id: schema.leads.id });
  return res.length;
}

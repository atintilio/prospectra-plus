import type { Account, Diagnosis, Opportunity, ProspectraState, Team, TeamMember } from './types';

function makeDemoAccount(input: {
  id: string;
  name: string;
  domain: string;
  sector: string;
  employees: string;
  tier: Account['tier'];
  journey: Account['journey'];
  relationship: Account['relationship'];
  owner: string;
  score: number;
  scoreReason: string;
  stage: string;
  contactName: string;
  contactRole: string;
  signal: string;
  paused?: boolean;
  suppressed?: boolean;
}): Account {
  return {
    id: input.id,
    name: input.name,
    domain: input.domain,
    sector: input.sector,
    employees: input.employees,
    tier: input.tier,
    journey: input.journey,
    relationship: input.relationship,
    owner: input.owner,
    score: input.score,
    scoreReason: input.scoreReason,
    stage: input.stage,
    paused: input.paused ?? false,
    suppressed: input.suppressed ?? false,
    contacts: [{ id: `${input.id}-p1`, name: input.contactName, role: input.contactRole, email: `${input.id}@${input.domain}`, linkedin: `linkedin.com/in/${input.id}`, reviewedAt: 'Hoje', status: 'Revisado' }],
    evidence: [{ id: `${input.id}-e1`, title: `${input.signal} · contexto público`, url: `https://${input.domain}/noticias`, excerpt: `Registro demonstrativo: ${input.signal.toLowerCase()}.`, source: 'Web pública', collectedAt: 'Hoje, 08:30', verified: true }],
    activities: [{ id: `${input.id}-at1`, kind: input.suppressed ? 'Resposta' : 'Evidência', text: input.suppressed ? 'Oposição persistente registrada; nenhuma ação automática permanece habilitada.' : `${input.signal} associado à conta e aguardando próxima decisão humana.`, createdAt: 'Hoje, 08:30', actor: input.suppressed ? 'Inbox assistido' : 'Pesquisa' }],
  };
}

const additionalAccounts: Account[] = [
  makeDemoAccount({ id: 'a7', name: 'Metrópole Mobilidade', domain: 'metropole-mobilidade.example', sector: 'Mobilidade urbana', employees: '1.500–3.000', tier: 'Tier 1', journey: 'Aquisição', relationship: 'Prospect', owner: 'Camila Rocha', score: 82, scoreReason: 'Licitação nova + operação distribuída + decisor revisado', stage: 'Qualificação', contactName: 'Renata Azevedo', contactRole: 'Diretora de Operações', signal: 'Nova licitação de mobilidade'  }),
  makeDemoAccount({ id: 'a8', name: 'CampoClaro Agro', domain: 'campoclaroagro.example', sector: 'Agronegócio', employees: '800–1.500', tier: 'Tier 2', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'André Tintilio', score: 76, scoreReason: 'Cliente ativo + novas regiões + hipótese de expansão', stage: 'Mapa de conta', contactName: 'Gustavo Neri', contactRole: 'Head de Compras', signal: 'Expansão para novas regiões'  }),
  makeDemoAccount({ id: 'a9', name: 'PontoNorte Educação', domain: 'pontonorte.example', sector: 'Educação corporativa', employees: '300–700', tier: 'Tier 2', journey: 'Reativação', relationship: 'Ex-cliente', owner: 'Marina Costa', score: 68, scoreReason: 'Nova liderança + relacionamento anterior + timing revisado', stage: 'Reativação', contactName: 'Isabela Freire', contactRole: 'Diretora de Pessoas', signal: 'Nova liderança de RH'  }),
  makeDemoAccount({ id: 'a10', name: 'Vértice Fintech', domain: 'verticefintech.example', sector: 'Serviços financeiros', employees: '500–1.000', tier: 'Tier 1', journey: 'Aquisição', relationship: 'Prospect', owner: 'Camila Rocha', score: 74, scoreReason: 'Rodada anunciada + contratação de receita + fit alto', stage: 'Pesquisa validada', contactName: 'Diego Sampaio', contactRole: 'Chief Revenue Officer', signal: 'Rodada de crescimento anunciada'  }),
  makeDemoAccount({ id: 'a11', name: 'Prisma Construção', domain: 'prismaconstrucao.example', sector: 'Construção civil', employees: '2.000–5.000', tier: 'Tier 1', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'André Tintilio', score: 79, scoreReason: 'Carteira ativa + obras simultâneas + comitê mapeado', stage: 'Comitê de expansão', contactName: 'Marcelo Tavares', contactRole: 'Diretor de Suprimentos', signal: 'Obras simultâneas em novos estados'  }),
  makeDemoAccount({ id: 'a12', name: 'Lumina Telecom', domain: 'luminatelecom.example', sector: 'Telecomunicações', employees: '3.000–7.000', tier: 'Tier 1', journey: 'Aquisição', relationship: 'Prospect', owner: 'Marina Costa', score: 72, scoreReason: 'Programa de transformação + decisora revisada', stage: 'Descoberta', contactName: 'Priscila Moura', contactRole: 'VP de Transformação', signal: 'Programa de transformação operacional'  }),
  makeDemoAccount({ id: 'a13', name: 'NovaMares Turismo', domain: 'novamares.example', sector: 'Turismo e hospitalidade', employees: '500–1.000', tier: 'Tier 2', journey: 'Reativação', relationship: 'Dormente', owner: 'Camila Rocha', score: 56, scoreReason: 'Conta dormente + temporada favorável + evidência inicial', stage: 'Nutrição', contactName: 'Tânia Ribeiro', contactRole: 'Diretora Comercial', signal: 'Nova temporada de expansão', paused: false  }),
  makeDemoAccount({ id: 'a14', name: 'Axis Pharma', domain: 'axispharma.example', sector: 'Indústria farmacêutica', employees: '1.000–2.000', tier: 'Tier 1', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'André Tintilio', score: 81, scoreReason: 'Novo centro de distribuição + conta estratégica', stage: 'Expansão aprovada', contactName: 'Helena Castro', contactRole: 'Diretora de Supply Chain', signal: 'Novo centro de distribuição'  }),
  makeDemoAccount({ id: 'a15', name: 'Cobalto Segurança', domain: 'cobaltoseguranca.example', sector: 'Segurança patrimonial', employees: '700–1.200', tier: 'Tier 2', journey: 'Aquisição', relationship: 'Prospect', owner: 'Marina Costa', score: 69, scoreReason: 'Contratos regionais + fit de operação + contato a revisar', stage: 'A revisar', contactName: 'Sérgio Paiva', contactRole: 'Diretor de Operações', signal: 'Novos contratos regionais'  }),
  makeDemoAccount({ id: 'a16', name: 'Estação Mídia', domain: 'estacaomidia.example', sector: 'Mídia e entretenimento', employees: '200–500', tier: 'Tier 3', journey: 'Reativação', relationship: 'Ex-cliente', owner: 'Camila Rocha', score: 61, scoreReason: 'Sinal de reposicionamento + histórico de relacionamento', stage: 'Revisão de contexto', contactName: 'Amanda Luz', contactRole: 'Head de Parcerias', signal: 'Reposicionamento comercial publicado'  }),
  makeDemoAccount({ id: 'a17', name: 'RotaSul Distribuição', domain: 'rotasul.example', sector: 'Distribuição', employees: '1.000–2.000', tier: 'Tier 1', journey: 'Aquisição', relationship: 'Prospect', owner: 'André Tintilio', score: 77, scoreReason: 'Novo hub logístico + ICP aderente + contato validado', stage: 'Qualificação', contactName: 'Fábio Mendes', contactRole: 'Diretor de Logística', signal: 'Novo hub logístico anunciado'  }),
  makeDemoAccount({ id: 'a18', name: 'ArcoNuvem', domain: 'arconuvem.example', sector: 'Tecnologia B2B', employees: '300–700', tier: 'Tier 2', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'Marina Costa', score: 73, scoreReason: 'Uso crescente + nova unidade de negócios + whitespace', stage: 'Hipótese de expansão', contactName: 'Nina Duarte', contactRole: 'VP de Customer Success', signal: 'Nova unidade de negócios'  }),
  makeDemoAccount({ id: 'a19', name: 'CasaViva', domain: 'casaviva.example', sector: 'Varejo e decoração', employees: '500–1.000', tier: 'Tier 2', journey: 'Reativação', relationship: 'Dormente', owner: 'Camila Rocha', score: 59, scoreReason: 'Sazonalidade próxima + contato histórico a revisar', stage: 'Nutrição', contactName: 'Paula Reis', contactRole: 'Gerente de E-commerce', signal: 'Calendário comercial renovado'  }),
  makeDemoAccount({ id: 'a20', name: 'Solis Água', domain: 'solisagua.example', sector: 'Saneamento', employees: '1.500–3.000', tier: 'Tier 1', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'André Tintilio', score: 75, scoreReason: 'Contrato em renovação + novas concessões mapeadas', stage: 'Comitê de expansão', contactName: 'Otávio Barros', contactRole: 'Diretor de Planejamento', signal: 'Novas concessões em consulta pública'  }),
  makeDemoAccount({ id: 'a21', name: 'Futura RH', domain: 'futurarh.example', sector: 'Serviços corporativos', employees: '200–500', tier: 'Tier 3', journey: 'Aquisição', relationship: 'Prospect', owner: 'Marina Costa', score: 66, scoreReason: 'Crescimento de carteira + contratação de vendas', stage: 'Descoberta', contactName: 'Michele Ramos', contactRole: 'CEO', signal: 'Contratação de liderança comercial'  }),
  makeDemoAccount({ id: 'a22', name: 'Brava Mineração', domain: 'bravamin.example', sector: 'Mineração', employees: '2.000–5.000', tier: 'Tier 1', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'Camila Rocha', score: 83, scoreReason: 'Capex anunciado + operação crítica + decisores mapeados', stage: 'Expansão aprovada', contactName: 'Ricardo Lobo', contactRole: 'Diretor de Operações', signal: 'Plano de investimento aprovado'  }),
  makeDemoAccount({ id: 'a23', name: 'OndaSat', domain: 'ondasat.example', sector: 'Conectividade', employees: '500–1.000', tier: 'Tier 2', journey: 'Aquisição', relationship: 'Prospect', owner: 'André Tintilio', score: 64, scoreReason: 'Nova cobertura regional + evidência ainda parcial', stage: 'A revisar', contactName: 'Aline Gomes', contactRole: 'Head de Produto', signal: 'Nova cobertura regional'  }),
  makeDemoAccount({ id: 'a24', name: 'Aliança Clínicas', domain: 'aliancaclinicas.example', sector: 'Saúde', employees: '1.000–2.000', tier: 'Tier 1', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'Marina Costa', score: 70, scoreReason: 'Aquisições recentes + comitê financeiro revisado', stage: 'Mapa de conta', contactName: 'Juliana Pires', contactRole: 'Diretora Financeira', signal: 'Aquisições de novas clínicas'  }),
  makeDemoAccount({ id: 'a25', name: 'Base Um Industrial', domain: 'baseum.example', sector: 'Indústria', employees: '500–1.000', tier: 'Tier 2', journey: 'Reativação', relationship: 'Perdido', owner: 'Camila Rocha', score: 38, scoreReason: 'Oposição persistente; nenhuma ação pode ser reativada', stage: 'Supressão', contactName: 'Eduardo Paes', contactRole: 'Diretor Administrativo', signal: 'Pedido de encerramento de contato', paused: true, suppressed: true  }),
  makeDemoAccount({ id: 'a26', name: 'ValeMais Seguros', domain: 'valemais.example', sector: 'Seguros', employees: '800–1.500', tier: 'Tier 2', journey: 'Aquisição', relationship: 'Prospect', owner: 'André Tintilio', score: 67, scoreReason: 'Novo produto + janela de distribuição + fit moderado', stage: 'Pesquisa validada', contactName: 'Lívia Campos', contactRole: 'Diretora de Distribuição', signal: 'Novo produto para empresas'  }),
];

const members: TeamMember[] = [
  { id: 'm0', name: 'André Tintilio', email: 'atintilio@argusprime.com.br', role: 'Administrador' },
  { id: 'm1', name: 'Marina Costa', email: 'marina.costa@argusprime.com.br', role: 'Líder', teamId: 'team-receita' },
  { id: 'm2', name: 'João Pedro Martins', email: 'joao.martins@argusprime.com.br', role: 'Liderado', teamId: 'team-receita' },
  { id: 'm3', name: 'Camila Rocha', email: 'camila.rocha@argusprime.com.br', role: 'Líder', teamId: 'team-expansao' },
  { id: 'm4', name: 'Felipe Moura', email: 'felipe.moura@argusprime.com.br', role: 'Liderado', teamId: 'team-expansao' },
  { id: 'm5', name: 'André Vasconcelos', email: 'andre.vasconcelos@argusprime.com.br', role: 'Líder', teamId: 'team-reativacao' },
  { id: 'm6', name: 'Rafael Lima', email: 'rafael.lima@argusprime.com.br', role: 'Liderado', teamId: 'team-reativacao' },
];

const teams: Team[] = [
  { id: 'team-receita', name: 'Receita Enterprise', leaderId: 'm1', memberIds: ['m1', 'm2'], color: 'purple' },
  { id: 'team-expansao', name: 'Expansão e ABM', leaderId: 'm3', memberIds: ['m3', 'm4'], color: 'emerald' },
  { id: 'team-reativacao', name: 'Reativação', leaderId: 'm5', memberIds: ['m5', 'm6'], color: 'lilac' },
];

const opportunities: Opportunity[] = [
  { id: 'opp1', teamId: 'team-receita', ownerId: 'm1', accountId: 'a1', thesis: 'Recuperação de créditos PIS/Cofins', stage: 'Diagnóstico em revisão', potential: 1800000, confidence: 82, updatedAt: 'Hoje, 10:42' },
  { id: 'opp2', teamId: 'team-receita', ownerId: 'm2', accountId: 'a4', thesis: 'Revisão de cadeia de insumos', stage: 'Oportunidade qualificada', potential: 980000, confidence: 71, updatedAt: 'Hoje, 09:12' },
  { id: 'opp3', teamId: 'team-expansao', ownerId: 'm3', accountId: 'a5', thesis: 'Expansão de escopo para operações', stage: 'Comitê executivo', potential: 2400000, confidence: 76, updatedAt: 'Hoje, 08:20' },
  { id: 'opp4', teamId: 'team-expansao', ownerId: 'm4', accountId: 'a11', thesis: 'Créditos sobre despesas operacionais', stage: 'Dados solicitados', potential: 1200000, confidence: 64, updatedAt: 'Ontem, 16:10' },
  { id: 'opp5', teamId: 'team-reativacao', ownerId: 'm5', accountId: 'a2', thesis: 'Revisão de apuração histórica', stage: 'Reunião de retomada', potential: 640000, confidence: 69, updatedAt: 'Ontem, 15:10' },
  { id: 'opp6', teamId: 'team-reativacao', ownerId: 'm6', accountId: 'a9', thesis: 'Diagnóstico de créditos não aproveitados', stage: 'Contexto a revisar', potential: 390000, confidence: 55, updatedAt: 'Há 2 dias' },
];

const diagnoses: Diagnosis[] = [
  { id: 'diag1', opportunityId: 'opp1', title: 'Diagnóstico executivo · Nexo Logística', introduction: 'Avaliação da oportunidade a partir do perfil operacional, do período analisado e das evidências documentais disponíveis.', legalBasis: ['Legislação aplicável à tese selecionada', 'Soluções de consulta e precedentes a validar pelo responsável técnico', 'Premissas do período e da documentação fornecida'], calculationMemory: ['Receita e operações elegíveis por período', 'Base potencial × alíquota aplicável', 'Ajustes, limites, compensações e atualização', 'Valor líquido sujeito à validação documental'], evidence: ['Expansão de centro de distribuição · fonte pública · hoje', 'Perfil da conta e contato decisor revisado', 'Dados operacionais aguardando validação'], recommendation: 'Priorizar reunião executiva e coleta dos documentos que suportam a memória de cálculo.', status: 'Em revisão' },
  { id: 'diag2', opportunityId: 'opp2', title: 'Diagnóstico executivo · Atlas Varejo Digital', introduction: 'Leitura executiva da cadeia de insumos e do momento de expansão do canal digital.', legalBasis: ['Base legal da tese e período analisado', 'Critérios de elegibilidade e documentação comprobatória', 'Validação jurídica e contábil antes de qualquer conclusão'], calculationMemory: ['Mapeamento de despesas elegíveis', 'Aplicação das alíquotas e exclusões', 'Conciliação com documentos fiscais', 'Estimativa de potencial e sensibilidade'], evidence: ['Nova liderança de operações', 'Plano de integração de canais', 'Contato de operações revisado'], recommendation: 'Avançar para diagnóstico documental com o comitê financeiro.', status: 'Gerado' },
  { id: 'diag3', opportunityId: 'opp3', title: 'Diagnóstico executivo · Horizonte Energia', introduction: 'Análise da hipótese de expansão para suprimentos e novas unidades do cliente.', legalBasis: ['Tese aplicável ao escopo de expansão', 'Referências normativas e jurisprudenciais vinculadas', 'Premissas e limitações do escopo contratado'], calculationMemory: ['Unidades e centros de custo incluídos', 'Histórico do período elegível', 'Cenários conservador, base e potencial', 'Descontos e riscos de documentação'], evidence: ['Portfólio de novas usinas', 'Conta cliente com whitespace identificado', 'Comitê de expansão em formação'], recommendation: 'Apresentar cenário base ao cliente e confirmar o escopo da documentação.', status: 'Em revisão' },
];

export const seedState: ProspectraState = {
  selectedAccountId: 'a1',
  selectedCampaignId: 'c1',
  channels: [
    { id: 'whatsapp', name: 'WhatsApp', provider: 'Evolution API · Baileys/Docker', capability: 'API não oficial configurável', status: 'Pronto para configurar', detail: 'Primeiro contato, follow-up, respostas e webhook de status.', routes: ['/message/sendText/{instance}', '/webhook/set/{instance}', '/instance/connectionState/{instance}'], dailyCap: 80 },
    { id: 'linkedin', name: 'LinkedIn', provider: 'API não oficial · endpoint configurável', capability: 'API não oficial configurável', status: 'Pronto para configurar', detail: 'Convite, mensagem, follow-up e handoff em uma cadência única.', routes: ['/messages/send', '/webhooks/inbound', '/messages/status'], dailyCap: 35 },
  ],
  agent: {
    name: 'Prospectra Context Agent',
    voice: 'Direta, consultiva e específica. Nunca usa elogio genérico.',
    instruction: 'Pesquisar contexto antes do contato, citar uma evidência válida e entregar ao humano assim que houver interesse, objeção ou resposta.',
    reviewMode: 'Toda mensagem',
    enabled: false,
    mode: 'Teste',
  },
  playbook: [
    { id: 'pb1', title: 'Contextualizar a conta', detail: 'Correlacionar ICP, sinal recente, contato e evidência verificada.', channel: 'Todos', wait: 'Antes do primeiro contato', active: true },
    { id: 'pb2', title: 'Abrir conversa', detail: 'Usar copy aprovada e adaptar a primeira frase ao sinal da conta.', channel: 'Todos', wait: 'Após aprovação', active: true },
    { id: 'pb3', title: 'Fazer follow-up', detail: 'Relembrar o contexto sem repetir a mensagem e respeitar o limite diário.', channel: 'Todos', wait: '2 dias úteis', active: true },
    { id: 'pb4', title: 'Entregar ao humano', detail: 'Parar a cadência ao detectar resposta, interesse, objeção ou oposição.', channel: 'Todos', wait: 'Imediato', active: true },
  ],
  signals: [
    { id: 's1', channel: 'WhatsApp', title: 'Resposta recebida · interesse detectado', detail: '“Faz sentido. Como isso funcionaria na nossa operação?”', accountId: 'a1', priority: 'Alta', state: 'Em handoff', createdAt: 'há 8 min' },
    { id: 's2', channel: 'LinkedIn', title: 'Perfil contextualizado', detail: 'Head de Receita revisado e associado ao comitê de compra.', accountId: 'a1', priority: 'Média', state: 'Novo', createdAt: 'há 32 min' },
    { id: 's3', channel: 'WhatsApp', title: 'Próximo passo sugerido', detail: 'Follow-up pronto no playbook após confirmação de entrega.', accountId: 'a2', priority: 'Baixa', state: 'Novo', createdAt: 'há 1 h' },
    { id: 's4', channel: 'LinkedIn', title: 'Sinal de contratação', detail: 'Nova liderança de operações associada à expansão regional.', accountId: 'a4', priority: 'Alta', state: 'Novo', createdAt: 'há 2 h' },
    { id: 's5', channel: 'WhatsApp', title: 'Janela de expansão identificada', detail: 'Comitê do cliente abriu discussão sobre novas unidades.', accountId: 'a5', priority: 'Média', state: 'Novo', createdAt: 'há 3 h' },
    { id: 's6', channel: 'LinkedIn', title: 'Oposição registrada', detail: 'Conta pediu para não receber novos contatos comerciais.', accountId: 'a6', priority: 'Alta', state: 'Resolvido', createdAt: 'há 1 dia' },
  ],
  teams,
  members,
  opportunities,
  diagnoses,
  accounts: [
    {
      id: 'a1', name: 'Nexo Logística', domain: 'nexologistica.example', sector: 'Logística e transporte', employees: '1.200–2.000', tier: 'Tier 1', journey: 'Aquisição', relationship: 'Prospect', owner: 'Marina Costa', score: 86,
      scoreReason: 'Sinal recente + decisor revisado + fit ICP alto', stage: 'Qualificação', paused: false, suppressed: false,
      contacts: [
        { id: 'p1', name: 'Marina Veloso', role: 'Diretora Comercial', email: 'marina.veloso@nexologistica.example', linkedin: 'linkedin.com/in/marina-veloso', reviewedAt: 'Hoje', status: 'Revisado' },
        { id: 'p2', name: 'Caio Ramos', role: 'Head de Receita', email: 'caio.ramos@nexologistica.example', linkedin: 'linkedin.com/in/caio-ramos', reviewedAt: 'Há 12 dias', status: 'A revisar' },
      ],
      evidence: [{ id: 'e1', title: 'Expansão de centro de distribuição', url: 'https://nexologistica.example/noticias/expansao', excerpt: 'A empresa anunciou a abertura de uma nova operação regional.', source: 'Web pública', collectedAt: 'Hoje, 10:42', verified: true }],
      activities: [{ id: 'at1', kind: 'Evidência', text: 'Sinal de expansão confirmado e associado à conta.', createdAt: 'Hoje, 10:42', actor: 'Pesquisa' }, { id: 'at2', kind: 'Nota', text: 'Conta aderente ao ICP de operação distribuída.', createdAt: 'Ontem', actor: 'Marina Costa' }],
    },
    {
      id: 'a2', name: 'VerdeVita Alimentos', domain: 'verdevita.example', sector: 'Indústria alimentícia', employees: '500–1.000', tier: 'Tier 2', journey: 'Reativação', relationship: 'Ex-cliente', owner: 'Marina Costa', score: 71,
      scoreReason: 'Contexto novo verificado; cooldown encerrado', stage: 'Reativação', paused: false, suppressed: false,
      contacts: [{ id: 'p3', name: 'Rafael Lima', role: 'VP de Operações', email: 'rafael.lima@verdevita.example', linkedin: 'linkedin.com/in/rafael-lima', reviewedAt: 'Há 2 dias', status: 'Revisado' }],
      evidence: [{ id: 'e2', title: 'Nova unidade industrial', url: 'https://verdevita.example/imprensa/unidade', excerpt: 'Comunicado de inauguração de nova unidade em Minas Gerais.', source: 'Web pública', collectedAt: 'Ontem, 15:10', verified: true }],
      activities: [{ id: 'at3', kind: 'Nota', text: 'Relacionamento anterior encerrado há mais de 90 dias.', createdAt: 'Há 91 dias', actor: 'Sistema' }],
    },
    {
      id: 'a3', name: 'Orbe Saúde', domain: 'orbe-saude.example', sector: 'Saúde', employees: '2.000–5.000', tier: 'Tier 1', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'André Tintilio', score: 63,
      scoreReason: 'Whitespace mapeado; comitê parcialmente revisado', stage: 'Mapa de conta', paused: true, suppressed: false,
      contacts: [{ id: 'p4', name: 'Carolina Alves', role: 'CFO', email: 'carolina.alves@orbe-saude.example', linkedin: 'linkedin.com/in/carolina-alves', reviewedAt: 'Hoje', status: 'Revisado' }],
      evidence: [{ id: 'e3', title: 'Relatório anual publicado', url: 'https://orbe-saude.example/relatorio', excerpt: 'Resultados do ciclo anual disponíveis ao mercado.', source: 'Web pública', collectedAt: 'Há 4 dias', verified: true }],
      activities: [{ id: 'at4', kind: 'Resposta', text: 'Resposta recebida: pausar ações pendentes para revisão humana.', createdAt: 'Hoje, 09:18', actor: 'Inbox' }],
    },
    {
      id: 'a4', name: 'Atlas Varejo Digital', domain: 'atlasvarejo.example', sector: 'Varejo omnichannel', employees: '1.000–3.000', tier: 'Tier 1', journey: 'Aquisição', relationship: 'Prospect', owner: 'André Tintilio', score: 78,
      scoreReason: 'Contratação recente + operação omnichannel + fit ICP', stage: 'Pesquisa validada', paused: false, suppressed: false,
      contacts: [
        { id: 'p5', name: 'João Pedro Martins', role: 'VP de Operações', email: 'joao.martins@atlasvarejo.example', linkedin: 'linkedin.com/in/joao-pedro-martins', reviewedAt: 'Hoje', status: 'Revisado' },
        { id: 'p6', name: 'Bia Nascimento', role: 'Diretora de Growth', email: 'bia.nascimento@atlasvarejo.example', linkedin: 'linkedin.com/in/bia-nascimento', reviewedAt: 'Hoje', status: 'Revisado' },
      ],
      evidence: [
        { id: 'e4', title: 'Nova liderança de operações', url: 'https://atlasvarejo.example/novidades/lideranca', excerpt: 'Executivo com experiência em expansão assumiu a área de operações.', source: 'Web pública', collectedAt: 'Hoje, 08:55', verified: true },
        { id: 'e5', title: 'Expansão do canal digital', url: 'https://atlasvarejo.example/investidores', excerpt: 'Plano público prevê integração de lojas, marketplace e fulfillment.', source: 'Web pública', collectedAt: 'Há 2 dias', verified: true },
      ],
      activities: [{ id: 'at5', kind: 'Evidência', text: 'Dois sinais públicos correlacionados ao momento de compra.', createdAt: 'Hoje, 08:55', actor: 'Pesquisa' }, { id: 'at6', kind: 'Aprovação', text: 'Contato de operações revisado para abertura assistida.', createdAt: 'Hoje, 09:12', actor: 'André Tintilio' }],
    },
    {
      id: 'a5', name: 'Horizonte Energia', domain: 'horizonteenergia.example', sector: 'Energia renovável', employees: '800–1.500', tier: 'Tier 2', journey: 'Expansão / ABM', relationship: 'Cliente', owner: 'Camila Rocha', score: 74,
      scoreReason: 'Cliente ativo + novas unidades + whitespace de expansão', stage: 'Comitê de expansão', paused: false, suppressed: false,
      contacts: [
        { id: 'p7', name: 'Luciana Prado', role: 'Diretora de Suprimentos', email: 'luciana.prado@horizonteenergia.example', linkedin: 'linkedin.com/in/luciana-prado', reviewedAt: 'Há 3 dias', status: 'Revisado' },
        { id: 'p8', name: 'Felipe Moura', role: 'Head de Planejamento', email: 'felipe.moura@horizonteenergia.example', linkedin: 'linkedin.com/in/felipe-moura', reviewedAt: 'Há 5 dias', status: 'A revisar' },
      ],
      evidence: [{ id: 'e6', title: 'Portfólio de novas usinas', url: 'https://horizonteenergia.example/projetos', excerpt: 'A companhia publicou quatro projetos em fase de implantação.', source: 'Web pública', collectedAt: 'Há 3 horas', verified: true }],
      activities: [{ id: 'at7', kind: 'Nota', text: 'Conta cliente com hipótese clara de expansão para suprimentos.', createdAt: 'Hoje, 08:20', actor: 'Camila Rocha' }, { id: 'at8', kind: 'Tarefa', text: 'Mapear segundo decisor antes da próxima reunião.', createdAt: 'Hoje, 08:40', actor: 'Operações' }],
    },
    {
      id: 'a6', name: 'Pulsar Tecnologia', domain: 'pulsartec.example', sector: 'Software corporativo', employees: '200–500', tier: 'Tier 3', journey: 'Reativação', relationship: 'Perdido', owner: 'Marina Costa', score: 42,
      scoreReason: 'Oposição registrada; nenhuma ação pode ser reativada automaticamente', stage: 'Supressão', paused: true, suppressed: true,
      contacts: [{ id: 'p9', name: 'Eduardo Reis', role: 'Diretor Financeiro', email: 'eduardo.reis@pulsartec.example', linkedin: 'linkedin.com/in/eduardo-reis', reviewedAt: 'Há 6 dias', status: 'Revisado' }],
      evidence: [{ id: 'e7', title: 'Encerramento de negociação', url: 'https://pulsartec.example/comunicado', excerpt: 'Registro interno demonstra que a conta optou por outro fornecedor.', source: 'Operador', collectedAt: 'Há 30 dias', verified: true }],
      activities: [{ id: 'at9', kind: 'Resposta', text: 'Oposição persistente registrada. Cadências e follow-ups permanecem bloqueados.', createdAt: 'Há 1 dia', actor: 'Inbox assistido' }],
    },
    ...additionalAccounts,
  ],
  campaigns: [{
    id: 'c1', name: 'Enterprise · Operações', status: 'Ativa', icp: 'Empresas com operação distribuída, 500+ colaboradores e sinal público recente.', accounts: ['a1', 'a2', 'a4', 'a5'],
    copy: { text: 'Marina, vi a expansão recente da operação da Nexo. Posso compartilhar como times comerciais usam evidências de campo para priorizar contas semelhantes?', revision: 3, state: 'Rascunho' },
    tasks: [
      { id: 't1', accountId: 'a1', contactId: 'p1', title: 'Enviar abertura contextualizada pelo LinkedIn', channel: 'LinkedIn', capability: 'API não oficial configurável', state: 'Aguardando revisão', due: 'Hoje' },
      { id: 't2', accountId: 'a1', contactId: 'p1', title: 'Preparar primeira conversa no WhatsApp', channel: 'WhatsApp', capability: 'API não oficial configurável', state: 'Aguardando revisão', due: 'Amanhã' },
      { id: 't3', accountId: 'a4', contactId: 'p5', title: 'Revisar abertura para sinal de contratação', channel: 'LinkedIn', capability: 'API não oficial configurável', state: 'Aprovado', due: 'Amanhã' },
      { id: 't4', accountId: 'a5', contactId: 'p7', title: 'Preparar conversa de expansão com cliente', channel: 'WhatsApp', capability: 'API não oficial configurável', state: 'Pendente', due: 'Em 2 dias' },
    ],
  }],
};

import type { ProspectraState } from './types';

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
  ],
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
  ],
  campaigns: [{
    id: 'c1', name: 'Enterprise · Operações', status: 'Ativa', icp: 'Empresas com operação distribuída, 500+ colaboradores e sinal público recente.', accounts: ['a1', 'a2'],
    copy: { text: 'Marina, vi a expansão recente da operação da Nexo. Posso compartilhar como times comerciais usam evidências de campo para priorizar contas semelhantes?', revision: 3, state: 'Rascunho' },
    tasks: [
      { id: 't1', accountId: 'a1', contactId: 'p1', title: 'Enviar abertura contextualizada pelo LinkedIn', channel: 'LinkedIn', capability: 'API não oficial configurável', state: 'Aguardando revisão', due: 'Hoje' },
      { id: 't2', accountId: 'a1', contactId: 'p1', title: 'Preparar primeira conversa no WhatsApp', channel: 'WhatsApp', capability: 'API não oficial configurável', state: 'Aguardando revisão', due: 'Amanhã' },
    ],
  }],
};

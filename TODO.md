# Prospectra+ — primeira entrega

- [ ] **CRM demonstrável por organização:** contas, contatos, oportunidades, atividades, evidências e tarefas aparecem em um CRM nativo; dados de demonstração são identificados e persistem apenas no navegador até a conexão do repositório/servidor persistente.
- [ ] **Enriquecimento rastreável:** URL gera uma solicitação com evidência, origem, data e estado explícito; sem `SGAI_API_KEY`, nenhum enriquecimento real é apresentado como conectado.
- [ ] **Cadência assistida e aprovação:** copy revisada possui versão e aprovação; edição invalida a aprovação; LinkedIn cria somente tarefa assistida com capacidade exibida.
- [ ] **Automação multicanal:** Agent Studio, playbooks, limites diários, sinais, handoff humano e fila única para WhatsApp e LinkedIn; Evolution API é o adaptador prioritário de WhatsApp e depende de base URL, credencial, health check e webhook válidos.
- [ ] **Guardas comerciais:** registrar resposta pausa a conta; oposição não expira automaticamente; auditoria registra as mudanças.
- [ ] **Marca e distribuição:** aplicar o logo escolhido pelo usuário, testar interface, criar repositório privado e publicar o Prospectra+ separadamente do Reversa Tax.
- [ ] **Painel Owner/Master funcional:** o usuário administrador cadastra usuários, define os papéis Administrador/Líder/Liderado, cria equipes, escolhe o líder e atribui liderados; alterações ficam no armazenamento privado, o usuário master não pode ser rebaixado/desativado e nenhum líder pode ser removido sem reatribuição da equipe.
- [ ] **Convites e recuperação por Office 365:** um Owner pode enviar ou renovar explicitamente o convite de criação de senha; usuários ativos podem pedir recuperação sem revelar existência de endereços não autorizados; links são únicos, expiram em 15 minutos e são enviados pelo Microsoft Graph.

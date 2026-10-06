# Prospectra+ — primeira entrega

- [x] **CRM demonstrável por organização:** contas, contatos, oportunidades, atividades, evidências e tarefas aparecem em um CRM nativo; dados de demonstração são identificados e o workspace autenticado persiste no Blob privado; a troca por dados reais depende de importação e homologação.
- [x] **Enriquecimento rastreável:** URL gera uma solicitação com evidência, origem, data e estado explícito; sem `SGAI_API_KEY`, nenhum enriquecimento real é apresentado como conectado.
- [x] **Enriquecimento em lote:** a área de Enriquecimento aceita arquivos CSV, XLSX e XLS, permite escolher a coluna de URL/domínio, identifica linhas elegíveis, executa uma requisição real por linha com progresso e até três requisições concorrentes, mostra sucesso/erro/request ID por registro e exporta os resultados em CSV.
- [x] **Cadência assistida e aprovação:** copy revisada possui versão e aprovação; edição invalida a aprovação; LinkedIn cria somente tarefa assistida com capacidade exibida.
- [x] **Automação multicanal:** Agent Studio, playbooks, limites diários, sinais, handoff humano e fila única para WhatsApp e LinkedIn; Evolution API é o adaptador prioritário de WhatsApp e depende de base URL, credencial, health check e webhook válidos.
- [x] **Guardas comerciais:** registrar resposta pausa a conta; oposição não expira automaticamente; auditoria registra as mudanças.
- [x] **Marca e distribuição:** aplicar o logo escolhido pelo usuário, testar interface, criar repositório privado e publicar o Prospectra+ separadamente do Reversa Tax.
- [x] **Painel Owner/Master funcional:** o usuário administrador cadastra usuários, define os papéis Administrador/Líder/Liderado, cria equipes, escolhe o líder e atribui liderados; alterações ficam no armazenamento privado, o usuário master não pode ser rebaixado/desativado e nenhum líder pode ser removido sem reatribuição da equipe.
- [x] **Convites e recuperação por Office 365:** um Owner pode enviar ou renovar explicitamente o convite de criação de senha; usuários ativos podem pedir recuperação sem revelar existência de endereços não autorizados; links são únicos, expiram em 15 minutos e são enviados pelo Microsoft Graph.
- [x] **Operação sem botões inertes:** o sino abre uma central de notificações com itens não lidos, marcação individual/total e navegação para a origem; dashboard, CRM, auditoria, filtros, contratos e configurações executam ações observáveis ou informam claramente a dependência externa.
- [x] **Workspace autenticado persistente:** o estado comercial do workspace é carregado e salvo server-side no Blob privado após autenticação; usuários não administradores recebem somente o escopo permitido por papel e o cliente não escolhe `organizationId`.
- [x] **LinkedIn assistido e auditável:** uma tarefa aprovada oferece abrir o perfil, copiar a mensagem contextualizada e registrar a ação humana concluída; o registro não afirma entrega do LinkedIn e mantém a capacidade como `Assistido` enquanto não houver API autorizada.
- [x] **Integrações com health check real:** WhatsApp/Evolution e LinkedIn exibem `Conectado`, `Não configurado`, `Pausado` ou `Falhou` apenas após consultar o endpoint server-side e comprovar base URL, segredo e resposta; ScrapeGraphAI continua sendo verificado pelo endpoint real.

## Correção de produto e operação real — 06/10/2026

- [x] O sino abre uma central de notificações com itens não lidos, leitura individual/total e navegação para a origem; não é apenas um ícone sem ação.
- [x] O workspace carrega a cópia do Blob privado após autenticação, não reutiliza `localStorage` entre usuários e só o Owner grava o snapshot completo.
- [x] Resposta e oposição pausam as tarefas pendentes da conta; ações assistidas exigem copy aprovada, revisão atual, destinatário, canal e evidência verificada.
- [x] O ScrapeGraphAI valida URL pública, rejeita destinos privados/locais, preserva request ID, URL, data e grava o resultado como evidência não verificada até revisão.
- [x] WhatsApp/Evolution API e fornecedor LinkedIn exibem health check server-side; status “conectado” não é mais hard-coded na tela de Configurações.
- [x] O conector Hosted Auth Unipile foi criado sem armazenar senha/cookie: geração de link temporário, callback protegido, Blob privado por usuário e UI para conectar LinkedIn/WhatsApp.
- [x] A arquitetura de prospecção documenta o caminho assistido de custo zero, o provider Hosted Auth e o Desktop Bridge separado, com fontes e custos explícitos.
- [ ] Configurar e testar Evolution API em serviço persistente separado do Vercel, com webhooks e reconciliação.
- [ ] Obter e validar provider/API de LinkedIn conforme escopos, quotas, custo, termos aplicáveis e aprovação jurídica; não ativar envio automático antes disso.
- [ ] Migrar snapshot de workspace para PostgreSQL com RLS forçada, versionamento otimista e outbox durável.

## Entregas solicitadas — 06/10/2026

- [x] **Menu de ações no Owner:** o diretório de usuários mostra três pontos por usuário não master; o menu permite editar nome/e-mail/papel/equipe/estado, enviar ou renovar convite Office 365 e desativar acesso de forma reversível. O master permanece protegido server-side.
- [x] **Importação econômica:** CSV/XLSX/XLS pode ser incorporado ao CRM no modo padrão sem chamar o ScrapeGraphAI; a pesquisa externa é opt-in por lote e exibe origem e request ID para diferenciar consumo de créditos.

## Entregas de operação multicanal — 06/10/2026

- [x] **Evolution API configurável:** o Owner cria/atualiza a instância, gera QR Code e acompanha o estado retornado pelo serviço persistente; a chave permanece no backend.
- [x] **WhatsApp com aprovação:** campanhas podem criar tarefa WhatsApp, validar contato revisado com telefone, copy aprovada e evidência, enviar pela rota Evolution e registrar o recibo do provider na auditoria.
- [x] **Importação de telefone:** CSV/XLSX reconhece telefone, celular, WhatsApp, número e mobile; o modo econômico não chama ScrapeGraphAI.
- [x] **Abridge organograma:** o aplicativo desktop lê perfis LinkedIn públicos informados pelo operador e opcionalmente até cinco posts recentes por perfil; não solicita senha, não envia cookies e não descobre pessoas por bypass.
- [ ] **Homologação externa:** configurar URL/chave/instância/segredo/webhook Evolution e testar em um WhatsApp real; homologar Abridge em Windows/macOS.

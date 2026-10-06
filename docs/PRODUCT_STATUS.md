# Estado do produto — 06/10/2026

## Funciona no deployment

- Autenticação, recuperação/criação de senha e convites pelo Microsoft Graph/Office 365.
- Painel Owner/Master com usuários, papéis, equipes e regras server-side.
- Workspace autenticado com leitura/persistência no Blob privado; fallback local é identificado na interface.
- CRM nativo com contas, contatos, evidências, linha do tempo, pausa e oposição persistente.
- Criação manual de conta, busca/filtro e exportação da auditoria em CSV.
- Importação econômica de CSV/XLSX/XLS: a base já enriquecida, inclusive contatos, telefone e LinkedIn quando informados, entra no CRM sem chamada ao ScrapeGraphAI. A importação não concede verificação nem opt-in; pesquisa externa é seletiva e opt-in.
- Central de notificações com itens não lidos, leitura individual/total e navegação para a origem.
- ScrapeGraphAI v2: análise de página da empresa, pesquisa pública opcional de pessoas com fontes e lote seletivo de até 20 URLs. O Owner escolhe contatos antes de incluir no CRM; os resultados do lote deixam de ser apenas exportação e podem ser gravados. Health consulta créditos do fornecedor sem consumir saldo. Telefones e perfis LinkedIn só aparecem se encontrados nas fontes; não são garantidos.
- Campanhas com revisão de copy, invalidação após edição, aprovação condicionada a contato/evidência e tarefas assistidas.
- LinkedIn assistido: abrir perfil, copiar copy aprovada e registrar a ação humana sem afirmar entrega externa.
- Conexão de conta opcional em Hosted Auth Unipile: link temporário, callback com token, status privado por usuário e reconexão indicada; o provedor precisa ser configurado no Vercel antes de uso.
- Gateway Baileys separado com API autenticada, QR Code, sessão persistente, reconexão, envio aprovado, recibos e webhook; o Prospectra tem adaptador server-side e health check sem expor token.
- Equipes com diagnóstico consolidado para líderes/liderados e diagnóstico executivo completo para Owner.
- Menu de três pontos no Owner para editar nome/e-mail/papel/equipe/estado, reenviar convite e desativar acesso reversivelmente, com proteção server-side do master.
- Abridge Desktop disponível para qualquer usuário cadastrado e ativo em **Configurações → Desktop Bridge**, com empacotamento para Windows, macOS e Linux, Chrome visível em perfil dedicado, polling HTTPS, fila de tarefas, confirmação local para mensagens/convites, leitura de perfis e organograma a partir de URLs informadas, sem exportar cookies. Cada usuário cria e revoga somente o próprio dispositivo. Download Windows: https://files.manuscdn.com/user_upload_by_module/session_file/310419663029693892/msyBOtxEqaDZfSiL.zip · Download macOS Apple Silicon nativo (M1/M2/M3/M4, ARM64): https://files.manuscdn.com/user_upload_by_module/session_file/310419663029693892/nNEUkFKReysCTznz.zip · Download macOS Intel x64: https://files.manuscdn.com/user_upload_by_module/session_file/310419663029693892/aVqmYcllxhRrhNnP.zip

## Não é apresentado como conectado

- WhatsApp só muda para conectado depois de `BAILEYS_GATEWAY_URL`, token, processo persistente, health check, QR Code, volume `data/auth` e webhook comprovados; Baileys é uma integração não oficial e Evolution continua fallback explícito.
- LinkedIn não é um conector cloud oficial: a alternativa sem assinatura usa Abridge + linkout-scraper em Chrome local visível. O operador faz login manualmente no Abridge; leituras públicas podem ser processadas, mas convites/mensagens exigem confirmação local. A conexão Hosted Auth Unipile continua opcional e separada.
- A base demonstrativa continua marcada como massa de homologação até a importação de dados reais e validação de isolamento da organização.
- A pesquisa paga ScrapeGraphAI e a gravação de contas pelo frontend estão disponíveis somente ao Owner enquanto o workspace usa um snapshot Blob único. Líderes/liderados têm leitura filtrada, mas não recebem falso sucesso de gravação. A ampliação segura de escrita multiusuário requer operações granulares com controle de concorrência.

## Próximos bloqueadores de piloto real

1. Configurar e testar o Baileys Gateway em serviço persistente separado do Vercel, com DNS/HTTPS, QR Code, volume `data/auth`, webhook e número real.
2. Homologar o Abridge em uma máquina Windows/macOS com a conta LinkedIn do operador, incluindo leitura de perfil, organograma e confirmação de uma tarefa de escrita.
3. Migrar o snapshot de workspace para PostgreSQL com RLS forçada, versionamento otimista e outbox durável.
4. Implementar worker durável para esperas, reconciliação `unknown`, budgets e webhooks assinados.
5. Executar importação real, restauração de backup e revisão de finalidade/base legal LGPD antes de mensagens reais.
6. Publicar o contrato de fila Abridge no deployment e homologar o artefato `.exe` em Windows, o ZIP ARM64 nativo em Apple Silicon e o ZIP x64 em Mac Intel. A sandbox Linux valida o código, mas não substitui o teste em cada sistema.
7. Homologar resultados de telefone e perfil LinkedIn em empresas reais autorizadas; dados não públicos não podem ser prometidos pelo extrator de páginas e a disponibilidade depende da fonte.

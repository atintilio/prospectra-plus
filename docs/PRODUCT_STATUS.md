# Estado do produto — 06/10/2026

## Funciona no deployment

- Autenticação, recuperação/criação de senha e convites pelo Microsoft Graph/Office 365.
- Painel Owner/Master com usuários, papéis, equipes e regras server-side.
- Workspace autenticado com leitura/persistência no Blob privado; fallback local é identificado na interface.
- CRM nativo com contas, contatos, evidências, linha do tempo, pausa e oposição persistente.
- Criação manual de conta, busca/filtro e exportação da auditoria em CSV.
- Importação econômica de CSV/XLSX/XLS: a base já enriquecida entra no CRM sem chamada ao ScrapeGraphAI; enriquecimento externo é opt-in por lote.
- Central de notificações com itens não lidos, leitura individual/total e navegação para a origem.
- ScrapeGraphAI v2 em enriquecimento individual e lote CSV/XLSX, quando a chave server-side e os créditos estiverem disponíveis.
- Campanhas com revisão de copy, invalidação após edição, aprovação condicionada a contato/evidência e tarefas assistidas.
- LinkedIn assistido: abrir perfil, copiar copy aprovada e registrar a ação humana sem afirmar entrega externa.
- Conexão de conta opcional em Hosted Auth Unipile: link temporário, callback com token, status privado por usuário e reconexão indicada; o provedor precisa ser configurado no Vercel antes de uso.
- Health check server-side para Evolution API/WhatsApp e fornecedor autorizado de LinkedIn.
- Equipes com diagnóstico consolidado para líderes/liderados e diagnóstico executivo completo para Owner.
- Menu de três pontos no Owner para editar nome/e-mail/papel/equipe/estado, reenviar convite e desativar acesso reversivelmente, com proteção server-side do master.
- Abridge Desktop em construção com empacotamento para Windows, macOS e Linux, Chrome visível em perfil dedicado, polling HTTPS, fila de tarefas, confirmação local para mensagens/convites, leitura de perfis e organograma a partir de URLs informadas, sem exportar cookies.

## Não é apresentado como conectado

- WhatsApp só muda para API autorizada depois de base URL, segredo, health check e webhook comprovados.
- LinkedIn não é um conector cloud oficial: a alternativa sem assinatura usa Abridge + linkout-scraper em Chrome local visível. O operador faz login manualmente no Abridge; leituras públicas podem ser processadas, mas convites/mensagens exigem confirmação local. A conexão Hosted Auth Unipile continua opcional e separada.
- A base demonstrativa continua marcada como massa de homologação até a importação de dados reais e validação de isolamento da organização.

## Próximos bloqueadores de piloto real

1. Configurar e testar Evolution API em serviço persistente separado do Vercel, com DNS/HTTPS, QR Code, webhook e número real.
2. Homologar o Abridge em uma máquina Windows/macOS com a conta LinkedIn do operador, incluindo leitura de perfil, organograma e confirmação de uma tarefa de escrita.
3. Migrar o snapshot de workspace para PostgreSQL com RLS forçada, versionamento otimista e outbox durável.
4. Implementar worker durável para esperas, reconciliação `unknown`, budgets e webhooks assinados.
5. Executar importação real, restauração de backup e revisão de finalidade/base legal LGPD antes de mensagens reais.
6. Publicar o contrato de fila Abridge no deployment e homologar o instalador `.exe` em Windows e `.dmg` em macOS; a sandbox Linux valida o código, mas não substitui o teste em cada sistema.

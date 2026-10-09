# Produção e demonstração

Novos cadastros recebem `workspaceMode: production` e uma base privada identificada pelo hash do ID do usuário. Contas, contatos, campanhas, sinais, atividades, equipes, oportunidades, diagnósticos, playbook e campos personalizados começam vazios. Somente configurações padrão de canais e agente desativado são mantidas.

O modo `demo` carrega os exemplos originais em sua própria base. A senha é informada no formulário e armazenada com scrypt e salt aleatório. Ela não faz parte do código ou das entregas. Somente essa conta pode restaurar os exemplos. Ações externas, dispositivos, autenticação de provedores e envio de mensagens são bloqueados na demonstração.

Usuários existentes sem esse atributo preservam a base legada e as permissões atuais; não há exclusão ou migração automática de seus dados. Administradores de bases individuais não recebem acesso ao painel Owner global. Bases individuais não herdam o diretório global de pessoas ou equipes. O cadastro ativo, consultado no servidor, determina o escopo; IDs e modo enviados pelo navegador não escolhem a base.

Os resultados e eventos do Abridge usam a base de seu proprietário. O webhook do gateway compartilhado continua exclusivo da base legada. A VM possui uma única sessão WhatsApp do Owner: bases individuais não podem listar, parear ou enviar por essa sessão. Para WhatsApp de cada usuário ainda é necessário implantar sessões exclusivas e identificar o proprietário nos webhooks. O isolamento de dados não implementa essa evolução do gateway.

Validação: testes de base vazia, seed restrito à demonstração, preservação do legado, gravações independentes, tentativa de forjar escopo no payload, novos cadastros vazios, hash de senha, acesso global restrito e bloqueio de ações externas. Verificação em Chrome local do fluxo base vazia → cadastro da primeira empresa → CRM sem exigir campanha prévia. O frontend inicia vazio mesmo quando a API falha, calcula indicadores da base real e disponibiliza importação/cadastro no estado vazio.

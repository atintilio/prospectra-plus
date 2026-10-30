# Implementação obrigatória do Prospectra — Open Claude

## Objetivo

Implemente diretamente no código o núcleo operacional do Prospectra. Não entregue apenas recomendações: crie telas, rotas, banco, permissões, integrações, testes e documentação.

O sistema só estará pronto quando os fluxos puderem ser executados pela interface, sem editar código, `.env` ou banco.

## P0 — núcleo da operação

### Go LinkedIn

Crie no menu a página **Go LinkedIn** com o botão **Conectar LinkedIn**.

O usuário deve poder conectar, desconectar, testar e visualizar o status da própria conta: aguardando, conectada, expirada, bloqueada ou desconectada.

No MVP, cada usuário terá uma conta LinkedIn. Modele o banco para permitir várias contas no futuro e vincule tudo a `orgId` e `userId`.

A sessão/token deve ser criptografada no servidor. Nunca salve cookies, tokens ou credenciais em texto puro, logs, respostas de API ou GitHub.

### Campanhas

Permita selecionar a conta LinkedIn na campanha. Valide organização, usuário, limites diários e conta conectada.

Mantenha o contrato do worker:

```text
POST /dispatch
{ "state": "sent" | "unknown", "providerId"?: string }
```

Resultado `unknown` não pode ser reenviado automaticamente.

### Demo

No ambiente demo, simule conexão, desconexão, envio, resposta, erro e fila. Nenhum botão do demo pode chamar LinkedIn, WhatsApp, e-mail, voz ou webhook real.

## P1 — agenda e Helpin

### Agenda

Crie o item **Agenda** no menu e uma tela com URL pública, reuniões solicitadas, confirmadas, cancelamento, estado do convite `.ics` e erros de e-mail.

Use `MEETING_SCHEDULER_URL` sem quebrar quando a variável estiver ausente.

### Helpin básico

Garanta inbox, leitura, resposta, atribuição, encerramento, histórico, contexto do lead e isolamento por organização.

No demo, respostas devem ser simuladas e nunca enviadas por WhatsApp ou e-mail.

## Administração

O administrador master deve conseguir criar organização, convidar usuário, cadastrar e-mail remetente, visualizar integrações, ativar/desativar recursos e configurar horário de atendimento e autorresposta simples.

Não fixe preços agora. Crie apenas estrutura configurável de planos e limites.

## Menu obrigatório

Todos os módulos devem estar acessíveis: Painel, Leads, Campanhas, Fila, Go LinkedIn, WhatsApp, Helpin/Suporte, Harvey/Inteligência, Agenda, Automação, Documentos, Equipe, Configurações e Administração.

Não adicione links para páginas inexistentes.

## Testes obrigatórios

Execute e registre typecheck, testes unitários, integração, isolamento entre organizações, demo sem chamadas externas, conexão/desconexão LinkedIn, seleção de conta em campanha, fila, agenda, convite `.ics`, Helpin e permissões.

## GitHub

Crie uma branch própria, faça commits pequenos, não inclua segredos, abra um Pull Request e não faça merge automático. No PR informe resumo, arquivos, migrações, variáveis, testes, limitações reais e passos manuais do administrador.

## Critério final

Só declare concluído quando o botão de conexão existir, a conta puder ser cadastrada pela interface, a campanha puder selecioná-la, o worker receber a ação, o demo simular o fluxo completo, Helpin e Agenda estiverem no menu e todos os testes passarem.

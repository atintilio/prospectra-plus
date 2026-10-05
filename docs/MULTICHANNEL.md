# Prospectra+ — automação multicanal

A referência pública do Contatio organiza o produto em **Context Engine, Agent Studio, Playbooks, Signals, Pipeline e Human Handoff**. O Prospectra+ absorve essa lógica no CRM: a conta recebe contexto e evidências, um agente aplica regras de voz, um playbook define abertura/follow-up, sinais priorizam respostas e o handoff devolve a conversa ao operador.

## WhatsApp

O conector é provider-neutral e espera uma API não oficial compatível com envio, status e webhook. O endereço da API e as credenciais ficam no servidor. Antes do envio, o Prospectra verifica: conta não suprimida, contato elegível, copy aprovada, evidências associadas, janela/capacidade do provedor e limite diário. Mensagens recebidas pausam a cadência e geram sinal de handoff.

## LinkedIn

O conector é tratado da mesma forma, com uma API não oficial escolhida pelo cliente. O adaptador não aceita cookies no navegador nem automatiza uma sessão de Chrome; espera credencial e endpoint de um provedor externo. A interface mostra claramente `API não oficial configurável`, `Conectado`, `Pausado` ou `Não configurado`, sem confundir fila local com entrega externa.

## Agente e playbooks

O agente mantém voz, instrução, modo de revisão e modo Teste/Produção. O playbook inicial tem quatro etapas: contextualizar, abrir com sinal, fazer follow-up e entregar ao humano ao detectar interesse, objeção ou resposta. Toda mudança de copy incrementa a revisão e invalida aprovações anteriores.

## Contrato de entrega

Cada envio grava `channel`, `externalContactId`, `campaignId`, `approvedCopyRevision`, `evidenceIds`, provider message id e status de entrega. Respostas, falhas e estados desconhecidos são eventos de primeira classe; não são convertidos em “enviado” por inferência. O banco definitivo deve impor `organizationId` em todas as tabelas e filas.

## Configuração necessária

- `WHATSAPP_PROVIDER_BASE_URL`, `WHATSAPP_PROVIDER_API_KEY`, `WHATSAPP_WEBHOOK_SECRET`;
- `LINKEDIN_PROVIDER_BASE_URL`, `LINKEDIN_PROVIDER_API_KEY`, `LINKEDIN_WEBHOOK_SECRET`;
- `SGAI_API_KEY` para pesquisa/enriquecimento.

Essas variáveis não entram no bundle web. Os provedores e seus termos, estabilidade, segurança, limites e autorização são responsabilidade da operação que os contratar.

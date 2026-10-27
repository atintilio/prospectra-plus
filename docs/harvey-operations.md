# Operação comercial persistente

`/inteligencia` cadastra manualmente perfil, estratégia e até oito ofertas por vendedor/operação. A aprovação por lead exige telefone, qualificação CRM e confirmação explícita, apresenta a primeira mensagem e guarda snapshot do perfil. Editar o perfil não muda fluxos já aprovados. A aprovação interrompe a cadência anterior daquele lead para não haver dois emissores automáticos.

A primeira oferta aprovada abre o contato. Respostas comuns podem gerar perguntas restritas à prioridade, processo ou permissão, com plano OpenRouter validado e evidências literais. Interesse/reunião, técnico, mídia, falha de IA, resposta simultânea ou limite de três respostas transferem para humano. Não são inventados preços, fatos ou eventos de agenda. Pedido explícito de interrupção bloqueia o CRM, cancela fila pendente e não depende de IA.

Handoff cancela mensagens pendentes ao lead, notifica por Office 365 e agenda lembretes WhatsApp **somente ao número interno do vendedor** a cada dois dias. A mensagem inclui `C-<8 caracteres>` da oportunidade. Respostas do vendedor são registradas separadamente, roteadas por tema para André (comercial/estratégia/negociação/administração), Moisés (marketing/crescimento/dados) ou ambos (ambíguo). Com várias oportunidades, uma resposta sem código é guardada sem atribuição e o sistema pede o código. Encerrar o fluxo interrompe também lembretes.

## Operação e configuração

- Migração `0007_harvey.sql`: perfis, conversas/aprovações, inbox lead, inbox vendedor e outbox.
- `OPENROUTER_API_KEY`; `AI_MODEL=openrouter/free` (ou modelo `:free`). Nunca modelo pago.
- WA-AKG: `WA_AKG_BASE_URL`, `WA_AKG_API_KEY`; cada vendedor pareia sua própria sessão.
- `HARVEY_WEBHOOK_SECRET`: chave mestra privada de pelo menos 32 caracteres. O app deriva uma assinatura diferente por sessão; nunca configurar a chave mestra diretamente no gateway. Ao conectar, o app cadastra/atualiza automaticamente `POST/PUT /api/webhooks/{sessionId}` com o segredo derivado e `message.received`. O proxy precisa permitir essas rotas autenticadas. O endpoint valida HMAC do corpo bruto, sessão e validade temporal de cinco minutos. Respostas anteriores à aprovação não iniciam fluxos novos; recibos evitam duplicidade.
- A entrada é salva em `harvey_inbound_jobs` antes do HTTP 200. O processamento usa `after()` gerenciado pelo Next, com retomada pelo executor persistente; não espera a IA para confirmar o callback. JIDs `@lid` não resolvidos ficam em conferência humana, sem associação presumida a um lead. Opt-out é aplicado imediatamente. Uma análise interrompida é encaminhada para conferência, sem reenvio cego.
- Cron `GET /api/cron` exige `Authorization: Bearer <CRON_SECRET>`. Executa a cadência existente, relatórios e até dez entregas comerciais por rodada. O intervalo do agendador determina a latência; Vercel Hobby diário não representa tempo real. Um agendador autenticado a cada minuto pode acionar a mesma rota, sem adicionar um segundo produtor de cadências.
- O executor leve da VPS deve chamar `/api/harvey/tick`, com o mesmo bearer, para processar uma resposta e uma entrega por ciclo. Essa rota não cria cadências duplicadas. Não habilitar o novo agendador enquanto a versão publicada não expuser a rota autenticada.
- Office 365 reutiliza `OFFICE365_TENANT_ID`, `OFFICE365_CLIENT_ID`, `OFFICE365_CLIENT_SECRET`, `OFFICE365_SENDER_EMAIL` (aliases existentes continuam válidos).

Sem transporte/email configurado, mensagens permanecem pendentes. Os limites e recibos por vendedor reutilizam `sendWhatsAppCommand`. Entrega incerta nunca é reenviada automaticamente. Processamento abandonado há 20 minutos fica `unknown`, visível na interface; conferir o canal antes de uma ação humana. A fila valida novamente organização ativa, vendedor ativo, carteira, IA e opt-out antes de despachar.

## Limites explícitos

- Nenhuma agenda foi conectada: intenção e horário sugerido seguem no resumo para confirmação humana, sem evento `meeting_booked` fictício.
- A aprovação inicial autoriza uma conversa limitada; não é um agente de negociação ilimitada.
- O WhatsApp externo precisa estar pareado, webhook configurado e cron rodando para o fluxo ao vivo. O gateway atual despacha callbacks sem garantia de retry; interrupção do callback pode exigir conferência manual.
- Uma entrega já iniciada no provedor antes de receber/parar a conversa não pode ser recolhida. Após a passagem, a fila cancela novas mensagens pendentes ao lead.
- A detecção de intervenção humana fora do app não é inferida de `fromMe` (também identifica o próprio assistente). O botão de encerrar ou o handoff explícito define a parada.

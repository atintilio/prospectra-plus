# Prospectra+ — auditoria de documentação, funções e status

Data da auditoria: 17/11/2026  
Escopo: `ProspectraPlus/app`  
Método: leitura da documentação existente, rotas, bibliotecas, serviços, testes e estado do Git. Este documento é um inventário de evidências; não decide desativação, remoção ou substituição de módulo.

## Legenda

- **Implementado:** há código integrado ao app e evidência local de contrato/teste ou rota utilizável.
- **Não validado:** há código/documentação/teste local, mas falta confirmação operacional, externa, de produção ou de ponta a ponta.
- **Faltante:** a capacidade é descrita como objetivo, plano ou necessidade, mas não há implementação suficiente no app atual.

“Implementado” não significa “implantado em produção”. Testes com mocks, PGlite, respostas simuladas ou código de preparação não comprovam serviço externo, pareamento, entrega, desempenho ou autorização operacional.

## Resumo executivo

| Módulo | Implementado | Não validado | Faltante / limite atual |
|---|---|---|---|
| Prospectra núcleo | Sim | Deploy/smoke externo | Nenhuma lacuna funcional ampla identificada no escopo atual |
| Leads, Campanhas e Fila | Sim | Deploy na VPS e domínio | Execução automática completa; LinkedIn continua assistido |
| Argus OSINT | Contrato inicial | Persistência/integração ainda não exercitadas | Worker, fontes, correlação e UI comercial ampla |
| DISC | Heurística local | Validação com dados reais e integração na UI | Modelo enriquecido por OSINT e ciclo persistente |
| Voice Studio | Contrato, cadastro, fila e worker preparados | Motor, VPS, geração e envio real | Chamadas/VoIP, conversa contínua e automação comercial espontânea |
| WA-AKG | Gateway cliente, ações e recibos | Instalação, QR, pareamento e envio real | Inbox, webhooks e entrega multicanal durável |
| Go LinkedIn | Conta, estados, cifragem e modo demo | Sessão real, worker e execução real | Automação de navegador/outreach autônomo |
| Agenda | Reuniões, página pública, ICS e e-mail | E-mail/produção e scheduler externo | Integração externa de calendário, se desejada |
| Inteligência Comercial/Harvey | Rascunho restrito, handoff e fila | Worker e provedor em ambiente publicado | OSINT completo, notificações e outbound automático |
| Helpin | MVP de conversas e isolamento | Integrações reais | Inbox multicanal completo |
| Administração/equipe/configuração | Sim | Validação operacional por perfil | Nada adicional confirmado neste inventário |

## 1. Prospectra núcleo e navegação

### Implementado

- Next.js 16/React 19, Postgres/Drizzle, autenticação própria com sessão em cookie `httpOnly`, senha `scrypt`, controle por organização e papéis.
- Menu e shell autenticado em `src/app/(app)/layout.tsx` com páginas para painel, leads, campanhas, fila, Go LinkedIn, WhatsApp, Inteligência, Agenda, Helpin, equipe, documentos, configurações, conta, administração e simulador.
- Variáveis de ambiente, primeiro acesso e modo de cadência assistida documentados em `README.md`.
- Saúde e operação agendada expostas por `src/app/api/health/route.ts`, `src/app/api/cron/route.ts` e `src/app/api/dispatch/route.ts`.

### Não validado

- Deploy publicado, domínio, PM2/nginx/Cloudflare e cron na VPS continuam condicionados a acesso operacional. `docs/DEPLOY-VPS.md`, `docs/DEPLOY-MANUAL-VPS.md` e `PLANO-EXECUCAO.md` registram esse bloqueio.
- O histórico de documentação contém escopos antigos que já não refletem toda a árvore atual: `docs/ESCOPO-LEADS-CAMPANHAS.md` ainda declara WhatsApp, Voice Studio e Inteligência fora do escopo, embora existam código e testes para eles.

### Faltante / limite atual

- Não foi encontrada evidência de um smoke test publicado que cubra os módulos e integrações externas em conjunto.

## 2. Leads, Campanhas e Fila do dia

### Implementado

- `/leads`: listagem, busca/filtros, criação manual, importação CSV/URLs, busca assistida por IA, mudança de etapa, inscrição em campanha e exclusão.
- `/campanhas` e `/campanhas/[id]`: criação/edição, métricas, atribuição, editor visual de fluxo e passos de reação, convite, mensagem e comentário, com delays, condição de aceite e variáveis de lead.
- `/fila`: scheduler ao abrir a página, ações vencidas, limites diários serializados e marcação manual como feita.
- A cadência permanece assistida: o sistema prepara texto e o usuário abre o LinkedIn, envia e confirma. O README declara que não há envio automático ao LinkedIn.
- Evidência local: `tests/cadence.test.ts`, `flow.test.ts`, `import.test.ts`, `campaign-account.test.ts`, `deletion-audit.test.ts` e `demo*.test.ts`.

### Não validado

- Execução na VPS, cron real, conta LinkedIn real, publicação e smoke do domínio.
- A documentação registra validações locais, mas não há neste inventário confirmação de execução recente dessas suítes contra a árvore de trabalho atual.

### Faltante / limite atual

- Outbound autônomo, extensão/navegador LinkedIn, inbox de respostas e follow-up automático não fazem parte da implementação confirmada.
- Resultado ambíguo (`unknown`) não deve ser reenviado automaticamente.

## 3. Argus OSINT

### Implementado

- Existe contrato de domínio em `src/lib/argus/types.ts`: evidências, confiança (`candidate`, `probable`, `confirmed`, `conflict`, `unverified`), sinais comerciais, conflitos e estados de investigação.
- `createLeadEnrichment()` produz snapshot inicial `partial`.
- Há migration `drizzle/0009_lead_enrichment.sql` e teste de contrato em `tests/argus-types.test.ts`.
- A especificação documenta fontes públicas/permitidas, preservação de evidências, isolamento por organização/lead e integração planejada com o Prospectra.

### Validado no deploy de 17/11/2026

- `prospectra-argus-worker.service` está ativo na VPS e executa a fila persistente de `enrichment_jobs`.
- O worker coleta fontes públicas HTTP/DNS, correlaciona e grava evidências, sinais e conflitos em `leads.enrichment` e no job correspondente.
- A compatibilidade de produção foi verificada em 17/11/2026: `enrichment_jobs`, `campaigns.graph`, `campaigns.linkedin_account_id` e `enrollments.node_id` estão presentes; os três serviços publicados permanecem ativos.
- Um job Argus real de teste percorreu a fila, coletou DNS público, gerou sinal comercial e persistiu o enriquecimento no lead (`completed`, 1 lead enriquecido).
- A rota pública `/login` respondeu HTTP 200 após a ativação; a validação de uma investigação real depende de existir um lead autorizado na fila.

### Faltante

- `services/argus/worker.*`, adaptadores públicos HTTP/DNS, normalização, retry, deduplicação, correlação, scoring básico e o executor persistente da fila estão implementados e testados. A UI de investigação permanece enxuta, integrada ao painel de Inteligência; conectores externos além de HTTP/DNS continuam fora do escopo validado.
- Não classificar a existência de tipos/migration como OSINT completo.

## 4. DISC

### Implementado

- `src/lib/disc.ts` implementa análise heurística determinística por sinais textuais, perfil primário D/I/S/C, confiança baixa/média/alta, recomendações, perguntas, “faça/evite” e evidências públicas.
- O resultado inclui disclaimer explícito: é estimativa de comunicação baseada em sinais observáveis e não diagnóstico psicológico.
- `tests/disc.test.ts` cobre dominância, evidência rastreável e baixa confiança.

### Não validado

- Não há validação com dados reais de leads, fontes OSINT efetivamente coletadas ou avaliação de qualidade por especialista.
- Não há evidência de que o resultado DISC esteja apresentado numa tela Argus/Inteligência ou alimentando uma campanha executável.

### Faltante

- Integração com pipeline Argus, histórico/revisão do perfil, explicação baseada em múltiplas fontes e uso persistente do perfil de comunicação.
- Não tratar a heurística como diagnóstico ou certeza de personalidade.

## 5. Voice Studio

### Implementado

- Página e ações de voz dentro de WhatsApp: cadastro autorizado, consentimento, referência/transcrição, perfil por vendedor/operação, fila e visualização de jobs.
- `src/lib/voice/voicestudio.ts` valida configuração privada, perfil, formato/tamanho, geração WAV, `X-Audio-Id`, conversão/retorno Ogg/Opus e limites de resposta.
- `src/lib/voice/delivery.ts` registra jobs idempotentes, aplica autorização, limite diário, troca de perfil e estado `waiting_transport` para intenção de chamada.
- `scripts/voice-worker.ts` e `build:voice-worker` fornecem executor persistente separado do request web.
- Evidência local: `tests/voice-studio.test.ts` e `tests/voice-delivery.test.ts`; documentação em `docs/voice-studio.md` e `docs/REVISAO-INDEPENDENTE-VOZ.md`.

### Não validado

- `VOICE_AUTOMATION_ENABLED=false` é o padrão e a documentação exige motor instalado, modelo revisado, geração em português, pareamento e envio autorizado antes de ativar.
- Não validado: backend Voice Studio real, modelo/pesos/licença/desempenho, worker na VPS, geração real, áudio real e envio real pelo WA-AKG.

### Faltante

- Transporte de chamadas/VoIP, transferência ao humano, conversação telefônica contínua, respostas a áudio recebido e criação espontânea de mensagens pelas campanhas.
- A rota upstream `/calls` não é utilizada.

## 6. WA-AKG

### Implementado

- `/whatsapp`: status, criação/início de sessão, QR, conexão, logout/desvinculação e envio individual de texto/áudio.
- `src/lib/whatsapp/akg.ts` mantém API key server-only, sessão determinística por operação/vendedor, valida URL/prefixo, timeout, redirects e respostas; demo é bloqueada para operação real.
- `src/lib/whatsapp/commands.ts` mantém recibo/idempotência, limites e estado `unknown` após falta de confirmação; o registro não afirma entrega/leitura.
- `infra/wa-akg/compose.yaml`, `.env.example` e `prepare.py` isolam gateway/banco do CRM e documentam preparação do pacote.
- Evidência local: `tests/whatsapp.test.ts`, `tests/whatsapp-commands.test.ts` e documentação em `docs/wa-akg.md`.

### Não validado

- A própria documentação registra que o AKG não estava instalado, sem QR, pareamento, endpoint/API key configurados ou envio real.
- Não validado: Docker na VPS, banco MariaDB do gateway, proxy/TLS, sessão real, logout/repareamento e mensagem de teste autorizada.

### Faltante

- Inbox, webhooks de entrada, reconciliação visual e entrega multicanal/campanhas duráveis.
- Não há autorização para considerar “sent” como entregue ou lido.

## 7. Go LinkedIn

### Implementado

- `/golinkedin`: conectar, desconectar, testar e mostrar estados aguardando, conectada, expirada, bloqueada e desconectada.
- `src/lib/linkedin.ts` vincula conta a `orgId`/`userId`, cifra sessão com AES-256-GCM, valida sessão em produção e simula a rede no demo.
- Ações server-side em `src/app/(app)/golinkedin/actions.ts`; conta pode ser selecionada em campanhas.
- Evidência local: `tests/golinkedin-mvp.test.ts`, `tests/campaign-account.test.ts` e `tests/demo*.test.ts`.

### Não validado

- A sessão real, a estabilidade da verificação perante o LinkedIn, execução de worker e operação publicada não foram confirmadas.
- Não há evidência de smoke test com conta real nem de ausência de bloqueio da plataforma.

### Faltante

- Automação de navegador, execução autônoma de convites/mensagens, inbox e extensão LinkedIn. O produto continua no modo assistido documentado.

## 8. Agenda

### Implementado

- `/agenda`: criação de reunião, seleção opcional de lead, confirmação, cancelamento, reenvio e lista de reuniões.
- `/agenda/[publicId]`: página pública por token, ações públicas e download de `ics/route.ts`.
- `src/lib/agenda.ts` gera ICS com status/horário/duração, envia por Office 365 quando configurado e marca `queued` no demo ou `error` com motivo visível.
- Evidência local: `tests/agenda-mvp.test.ts`.

### Não validado

- E-mail real, recebimento do convite pelo convidado, confirmação pública em domínio publicado e eventual `MEETING_SCHEDULER_URL` externo.
- O funcionamento local sem scheduler externo é documentado; isso não comprova sincronização com calendário externo.

### Faltante / limite atual

- Não foi encontrada integração confirmada com Google/Microsoft Calendar como calendário externo bidirecional.

## 9. Inteligência Comercial / Harvey

### Implementado

- `/inteligencia` restringe análise a lead do vendedor na organização, operação ativa, IA habilitada, aprovação explícita, ofertas/estratégia fornecidas pelo vendedor e lead fora de `do_not_contact`.
- `src/lib/harvey.ts`/ações aplicam resposta estruturada, evidência, limites, handoff e falha fechada; o resultado é rascunho salvo em nota, não evento de envio.
- Handoff interrompe inscrições e ações pendentes do lead; opt-out pode marcar `do_not_contact`.
- `services/intelligence` contém worker Python, fila durável, lease/retomada, SafetyGuard e testes sintéticos; a interface permanece desabilitada até validação do executor.
- Evidência local: `tests/harvey*.test.ts`, `tests/intelligence-*.test.ts` e `services/intelligence/tests/`.

### Não validado

- Worker publicado, `INTELLIGENCE_WORKER_ENABLED=true`, provedor OpenRouter em produção, limites/custos reais e execução contra lead real.
- A documentação registra que não há notificação enviada aos destinatários do handoff.

### Faltante

- OSINT completo, perfil/ofertas reutilizáveis, lifecycle durável de draft/handoff, notificações, ingestão de resposta e outbound automático.

## 10. Demais módulos

| Módulo | Evidência atual | Status |
|---|---|---|
| Helpin | `/helpin`, ações, conversas abertas/fechadas, atribuição e testes `helpin-mvp.test.ts` | Implementado localmente; integrações reais e inbox multicanal não validados/faltantes |
| Administração | `/admin`, gestão de usuários e regras de administrador; `admin.test.ts` | Implementado localmente; validação operacional por perfil não validada |
| Equipe | `/equipe` e `team-view.tsx` | Implementado em UI; fluxo operacional publicado não validado |
| Configurações/Conta | `/configuracoes`, `/conta`, sessão, remetente e preferências | Implementado em UI/ações; configuração real de serviços não validada |
| Documentos | `/documentos`, ações e visualização | Implementado na rota; ingestão/uso comercial amplo não confirmado |
| Simulador/Demo | `/simulador`, `demo*.test.ts`, bloqueios de rede/envio | Implementado localmente; não equivale a operação real |
| WhatsApp voice demo | rotas/actions de demonstração e áudio | Implementado como demonstração/teste; separado do perfil de produção |
| Painel/ambiente | `/painel`, `/ambiente`, loading, navegação e reduced-motion | Implementado em UI; smoke publicado não validado |

## 11. Auditoria da documentação existente

### Documentos úteis e coerentes com a evidência

- `README.md`: arquitetura básica e cadência assistida.
- `docs/status-2026-10-26.md`: separa validação local de bloqueios externos e limitações de WhatsApp/voz/Inteligência.
- `docs/voice-studio.md` e `docs/wa-akg.md`: contratos, limites, segurança e gates de ativação.
- `docs/harvey.md` e `services/intelligence/README.md`: limites do planejador comercial e do worker.
- `docs/intelligence-provider-validation.md`: conectores externos tratados como não validados/opcionais.
- `docs/superpowers/specs/2026-11-17-osint-comercial-prospectra-design.md`: desenho e critérios de segurança do Argus OSINT.

### Documentos que precisam ser lidos como históricos ou planos

- `docs/ESCOPO-LEADS-CAMPANHAS.md` e `PLANO-EXECUCAO.md` refletem um recorte anterior em que WhatsApp, Voice Studio e Inteligência estavam fora do escopo. O código atual contém incrementos desses módulos; portanto, esses arquivos não devem ser usados sozinhos como fotografia do estado atual.
- `docs/OPENCLAUDE-IMPLEMENTACAO-MVP.md` descreve requisitos/objetivos e não prova que cada item esteja entregue.
- `docs/superpowers/plans/2026-11-17-argus-osint-visual-flows-plan.md` é plano de implementação: suas tarefas não devem ser contadas como implementação apenas por estarem documentadas.
- `docs/DEPLOY-VPS.md` e `docs/DEPLOY-MANUAL-VPS.md` são procedimentos; não comprovam que o deploy foi executado.

## 12. Pendências de validação, sem decisão de desativação

1. Confirmar estado do working tree e registrar um commit/revisão de referência para esta auditoria; há alterações não commitadas em schema, Inteligência, Argus, DISC, testes e planos.
2. Executar `pnpm typecheck`, `pnpm test` e o build no estado atual, registrando saída e limitações.
3. Aplicar/confirmar migrations no banco de validação e no banco publicado.
4. Validar na VPS, em sequência controlada: app, cron, worker de Inteligência, WA-AKG, Voice Studio e seus segredos server-only.
5. Fazer smoke tests autorizados: conexão/reconexão LinkedIn, QR e mensagem WA-AKG, geração e envio de áudio, e-mail/ICS da Agenda e análise comercial.
6. Atualizar documentação histórica ou adicionar links para este inventário quando houver decisão do proprietário sobre qual documento será a fonte de status.

Nenhum item acima implica desativar, apagar ou substituir um módulo.

### Evidência operacional de voz — 17/11/2026

A produção contém um perfil de voz persistido e habilitado na aplicação, sem áudio ou identificador no código-fonte. Há dois jobs históricos de áudio: um `sent` e um `failed`, sem jobs pendentes; o Voice Worker e o WA-AKG estão ativos.

## Referências principais

- Rotas: `src/app/(app)` e `src/app/agenda/[publicId]`.
- Domínio: `src/lib/agenda.ts`, `src/lib/argus/types.ts`, `src/lib/disc.ts`, `src/lib/linkedin.ts`, `src/lib/voice/`, `src/lib/whatsapp/`, `src/lib/intelligence/`, `src/lib/harvey.ts`.
- Serviços/infra: `services/intelligence/`, `infra/wa-akg/`, `infra/voice-studio/`, `scripts/voice-worker.ts`.
- Testes: `tests/` e `services/intelligence/tests/`.

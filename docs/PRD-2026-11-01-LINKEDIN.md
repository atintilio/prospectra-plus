# PRD — LinkedIn no Prospectra+: do piloto simulado à automação real

**Versão:** 1.0 · **Data:** 2026-11-01 · **Status:** aprovado como escopo; execução por fatias
**Área:** Prospectra+ (aplicação Next.js + Worker Cloudflare + serviços na VPS)
**Responsável técnico:** Mavis · **Aprovação de negócio:** dono do Prospectra+

---

## 1. Contexto

O LinkedIn foi previsto desde o início do produto como o **motor de prospecção**: convites,
mensagens, comentários em publicações e passagem de lead para o closer. O que existe hoje:

| Peça | Situação | Onde |
|---|---|---|
| Fila e regras do piloto | ✅ existe | `src/lib/linkedin/automation.ts` |
| Chamada ao worker (HTTP) | ✅ existe (no-op sem env) | `src/lib/linkedin/http-executor.ts` |
| Gate por operação | ✅ existe (default desligado) | `orgs.linkedin_enabled` |
| Tela do piloto | ⚠️ **só na demonstração** e 100% simulada | `src/app/(app)/automacao/page.tsx` |
| Tela de **conectar conta** | ❌ **não existe** | — |
| Worker de LinkedIn (headless + `li_at` + proxy) | ❌ **não implantado** | — |
| Env `LINKEDIN_WORKER_URL/KEY` | ❌ ausentes | `/etc/prospectra-plus/app.env` |
| Disparações reais | 0 | `linkedin_dispatches` (vazia) |

**Problema:** o produto promete LinkedIn e não entrega nenhuma peça visível. Não há como
conectar uma conta, não há como ver o piloto fora da demo, e o backend nunca roda porque o
worker não existe. É o maior buraco funcional do Prospectra+.

## 2. Objetivo

Entregar o LinkedIn **de ponta a ponta e visível**:

1. **Por usuário:** cada pessoa conecta a **própria conta** do LinkedIn (OIDC).
2. **Por operação:** o dono liga/desliga o piloto automático (gate já existente).
3. **Na execução:** o agente executa convites/mensagens/comentários reais, com fila,
   idempotência e limites diários.
4. **Na demonstração:** o mesmo fluxo aparece **100% simulado**, sem rede, com a persona
   fictícia **João da Silva** (SDR da Atlas Consultoria).
5. **Documentado:** PRD, guia da ferramenta e marca oficial do LinkedIn (cor `#0A66C2`).

**Fora do escopo:** scraping de dados do LinkedIn, canvas de nós (ver §7), qualquer alteração
no CRM Argus, Reversa/Gov ou demais produtos (ver `docs/ESCOPO-E-TOCABILIDADE.md`).

## 3. Personas

| Persona | Quem é | O que precisa |
|---|---|---|
| **Dono / Admin** | dono do Prospectra+, admin da plataforma | ligar o piloto por operação, ver o estado real, desligar em 1 clique |
| **SDR (usuário)** | vendedor que opera a conta | conectar a **sua** conta, montar o fluxo arrastando os passos, ver o piloto trabalhar |
| **João da Silva** *(fictício)* | SDR da Atlas Consultoria — cliente da demo | caso de uso completo na demonstração: conta "conectada" (simulada), campanha em andamento, fila do dia |

## 4. Requisitos funcionais

### RF1 — Conectar conta do LinkedIn (OIDC, por usuário)

- Tela **`/linkedin`** (nova), também acessível por atalho em `/conta`:
  estado da conexão, botão **Conectar conta**, **Desconectar**, perfil vinculado
  (nome, e-mail, data), aviso de limites e política.
- API nova:
  - `GET /api/integrations/linkedin/connect` → `{ status, profile? }`
  - `DELETE /api/integrations/linkedin/connect` → desconecta
  - `GET /api/integrations/linkedin/start` → redireciona ao authorize do LinkedIn
  - `GET /api/integrations/linkedin/callback` → troca o `code`, vincula e responde o popup
    com `postMessage({ type: 'prospectra-linkedin-oidc', result })`
- Estados suportados: `disconnected` · `authenticated` · `configuration_required` · `unavailable`.
  Sem `LINKEDIN_CLIENT_ID/SECRET` → **`configuration_required`** (a UI explica o que falta).
- **Segredos nunca chegam ao navegador**: o app só orquestra; `client_secret` fica no servidor.
- Dados: nova tabela `linkedin_connections`
  (`user_id`, `org_id`, `provider_id`, `profile_name`, `profile_email`, `status`, `scopes`,
  `connected_at`, `updated_at`), com índice único por `(org_id, user_id)`.

### RF2 — Gate por operação (paridade com imagem e ligação)

- `orgs.linkedin_enabled` (default `false`) continua sendo o interruptor por operação.
- O **editor de campanhas só oferece** passos de LinkedIn quando ligado ✅ (mesma regra de
  `src/lib/campaign-features.ts` usada por imagem e ligação).
- O interruptor global `LINKEDIN_AUTOMATION_ENABLED` desliga tudo de uma vez.

> **Achado da releitura (01/11):** hoje o gate existe em **uma** camada só.
> `src/lib/campaign-features.ts` cobre `image` e `call` — os tipos de passo do LinkedIn
> (`invite`, `message`, `comment`, `react`) **não são gated no editor**, e a fila automática
> filtra por `orgs.linkedin_enabled` ✅ mas a **fila assistida** (execução manual pelo SDR)
> precisa ser conferida. Ou seja: o interruptor do LinkedIn está **fino demais** e o editor
> oferece convites/mensagens para operação que não ativou o recurso.
>
> **RF2-bis (obrigatório):** o LinkedIn passa a ser gate de verdade nas **três camadas**:
> 1. **Editor**: passos `invite`/`message`/`comment`/`react` só aparecem com o gate ligado
>    (passos já existentes continuam visíveis, como regra do repo).
> 2. **Cadência**: passo de LinkedIn ainda não alcançado com o recurso desligado é pulado
>    (não age) — mesmo comportamento de `image`/`call`.
> 3. **Fila (assistida e automática)**: ação de LinkedIn com o recurso desligado não é executada
>    e não fica pendente para execução manual.
> O gate da **demo** continua liberando tudo (é simulação), como já ocorre hoje.

### RF3 — Execução real

- O executor HTTP existente (`http-executor.ts`) passa a ter destino: `POST {LINKEDIN_WORKER_URL}/dispatch`
  com `Authorization: Bearer {LINKEDIN_WORKER_KEY}`.
- **Worker na VPS** (novo serviço `prospectra-linkedin`): navegador headless, cookie `li_at`,
  proxy e uma fila local. Recebe `{ action, payload }` e responde
  `{ state: 'sent' | 'unknown' | 'failed', providerId? }`.
- `unknown` **nunca** é reenviado automaticamente (a fila não reenvia resultado incerto).
- Limites diários por usuário (`users.daily_invites`, `users.daily_messages`) respeitados.

### RF4 — Piloto visível fora da demo

- `/automacao` deixa de ser "só demo": em produção mostra o **estado real** —
  ligado/desligado, conta conectada, itens na fila, últimos dispatches, limites do dia.
- Em produção **sem** LinkedIn ligado: a tela explica o que é e como ativar (não é erro).
- Na demo: mantém a simulação atual e ganha o bloco de conexão **simulado**.

### RF5 — Ambiente de demonstração com o João da Silva

- Persona **João da Silva** (SDR da Atlas Consultoria) semeada na demo: perfil, conta
  LinkedIn em estado "simulado/conectado", campanha com o fluxo de passos, itens na fila.
- Seed **idempotente** (reexecutar não duplica) e **sem rede**.
- Botão "Recriar do zero" continua zerando tudo ✅.

### RF6 — Marca oficial do LinkedIn

- Cor oficial **`#0A66C2`** e símbolo oficial (o "in") usados em: tela de conexão, selos de
  integração, tela de ambiente e documentação.
- O logo **não** é redesenhado: é o vetor oficial, com a marca da operação.

### RF7 — "Meu flow" (o que existe + o que melhora)

- O editor de campanhas **já** permite arrastar passos (`draggable` + `onDrop`) ✅.
- Melhora proposta: **prévia visual do fluxo** (mini-mapa com os blocos em ordem) e nomeação
  do passo, para o fluxo ser legível como um fluxo.
- **Fora de escopo agora:** canvas de nós estilo n8n/Make (ver §7).

## 5. Requisitos não funcionais

| # | Requisito |
|---|---|
| N1 | Segredos (`client_secret`, `li_at`, proxy) **só na VPS**; nunca no app nem no navegador |
| N2 | A demo é **100% offline**: nenhuma chamada a IA, LinkedIn, WhatsApp ou e-mail no seed |
| N3 | Idempotência: reexecutar seed ou fila não duplica registro nem reenvia ação incerta |
| N4 | Falha explícita: nada de estado "fingido"; `unknown` é honesto e visível |
| N5 | Limites: convites/mensagens por dia por usuário, com o contador visível na UI |
| N6 | A tela de integração do LinkedIn **não pode quebrar** o resto do app se a config faltar |
| N7 | Testes: toda regra nova com teste; suíte completa verde antes de release |

## 6. Critérios de aceite (verificáveis)

| # | Critério | Como se verifica |
|---|---|---|
| AC1 | Sem credencial OIDC, `/linkedin` mostra "Configuração pendente" e o que falta | rota + teste |
| AC2 | Com credencial, o usuário conecta a conta e vê nome/e-mail/data | OIDC real (depende do dono) |
| AC3 | Desconectar volta para "Não conectado" | DELETE + teste |
| AC4 | Demo: `/linkedin` mostra a conta do **João da Silva** em estado simulado | seed + rota |
| AC5 | Demo: o piloto simulado roda sem nenhuma chamada de rede | teste (mock de rede) |
| AC6 | Gate desligado → o editor não oferece LinkedIn; ligado → oferece | `campaign-features` + teste |
| AC7 | `/automacao` em produção mostra o estado real (não "disponível na demonstração") | rota + teste |
| AC8 | Worker respondendo `sent` atualiza `linkedin_dispatches` e a fila do dia | integração |
| AC9 | Logo oficial + `#0A66C2` presentes nas telas do LinkedIn | inspeção visual |
| AC10 | Suíte completa verde + smoke com sessão real sem regressão | `pnpm test` + smoke |
| AC11 | Gate do LinkedIn vale nas **3 camadas**: editor não oferece os passos, cadência pula, fila assistida não executa | teste do gate |
| AC12 | Demo segue liberando LinkedIn (é simulação) | teste do gate |

## 7. Não-objetivos (YAGNI)

- **Canvas de nós** (arrastar blocos em canvas livre): caro, não pedido de forma clara.
  Hoje "arrastar passos" já resolve a ordenação do fluxo. Entra só com pedido explícito.
- **Scraping** de dados do LinkedIn (perfis, vagas): fora do produto e do risco aceitável.
- **Envio em massa sem limites**: nada de bypass dos limites diários.
- **Multiusuário na mesma conta**: uma conta por usuário (RF1).

## 8. Fases de execução (fatias independentes)

| Fase | Entrega | Depende de | Bloqueio externo |
|---|---|---|---|
| **F1** | Schema `linkedin_connections` + API de conexão + tela `/linkedin` (estados reais e `configuration_required`) + testes | — | — |
| **F2** | Persona **João da Silva** + estado simulado da conexão + piloto simulado coerente na demo | F1 | — |
| **F3** | `/automacao` fora da demo com estado real + gate visível | F1 | — |
| **F4** | Worker LinkedIn na VPS (headless + `li_at` + proxy) + `LINKEDIN_WORKER_URL/KEY` | F1 | ⚠️ `li_at`/proxy do dono |
| **F5** | OIDC real (authorize + callback + popup) | F1 | ⚠️ client_id/secret do dono |
| **F6** | Marca oficial (logo + `#0A66C2`) nas telas | — | — |
| **F7** | Prévia visual do fluxo + nome do passo no editor | — | — |
| **F8** | Documentação: PRD, guia da ferramenta, guia de decisões, runbook do LinkedIn | — | — |
| **F9** | **RF2-bis**: gate do LinkedIn nas 3 camadas (editor, cadência, fila assistida) | F1 | — |

F1, F2, F3, F6, F7, F8 e F9 **não dependem de nada externo** e podem sair sem o dono.
F4 e F5 só fecham com credenciais do dono — o código é entregue pronto e testado.

## 9. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | **Termos de uso do LinkedIn** para automação — risco real do produto | Limites diários, ritmo humano, pausa automática, opt-out, o dono decide o uso |
| R2 | Bloqueio/suspensão da conta | Proxy estável, cadência baixa, id 1 operação = 1 conta |
| R3 | `unknown` repetido gera duplicidade | Fila não reenvia `unknown`; idempotência por `linkedin_dispatches` |
| R4 | CPU da VPS com navegador headless | Medir consumo; worker em processo separado do app |
| R5 | Escopo: mexer fora do Prospectra | `docs/ESCOPO-E-TOCABILIDADE.md` — parar e perguntar |
| R6 | Escolha do layout da tela de ambiente | Decisão pendente do dono (não bloqueia F1-F8) |

## 10. Dados

**Nova tabela** `linkedin_connections` (ver RF1). **Reaproveitadas:** `orgs.linkedin_enabled`,
`users.daily_invites/daily_messages`, `linkedin_dispatches`, `sessions`, `memberships`.

## 11. Marca

- Cor oficial do LinkedIn: **`#0A66C2`** (azul do "in").
- Símbolo/logotipo: vetor **oficial** da marca, exibido em tela de conexão, selos de integração,
  tela de ambiente e na documentação. Sem deformação, sem recolorir fora do azul oficial.
- A documentação registra cor, símbolo e regras de uso (fundo claro/escuro, tamanho mínimo).

## 12. Definição de pronto

1. F1-F3, F6-F8 em produção (VPS) com suíte verde e smoke sem regressão.
2. F4 e F5 prontos no código, com o pendente de credencial explicitado na tela e no guia.
3. Documentação (`docs/`) cobrindo: PRD (este arquivo), guia da ferramenta, decisões,
   runbook do LinkedIn e escopo/intocabilidade.
4. O dono decide: ativar o piloto em produção e quais operações entram.

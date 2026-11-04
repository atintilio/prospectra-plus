# Prospectra+ — o que falta implantar (estado real em 01/11/2026)

O texto anterior (27/10) dizia que não havia acesso SSH à VPS, que a voz não estava no
ar e que a agenda não existia. **Nada disso é mais verdade**: o acesso SSH funciona
deste ambiente, a voz está **no ar e validada ponta a ponta** e a **agenda virou um
módulo do próprio Prospectra** (o cal.com saiu de cena).

Estado do repositório: `main` com as PRs #48..#58, #30 e a **Helpin fase 6** mergeados.
Detalhes operacionais da voz em `docs/voice-studio.md`; do gateway WhatsApp em
`docs/wa-akg.md`; **da agenda nativa em `docs/AGEND-NATIVA.md`**; o estado para continuar
o trabalho está em `docs/HANDOFF-CODEX.md`.

---

## 1. Status geral

| Item | Estado | Observação |
|---|---|---|
| Prospectra+ (web) | **NO AR (VPS nativa)** | `https://prospectra.argusprime.com.br` → nginx na VPS → `127.0.0.1:3100` (`systemd prospectra-plus`) — `/api/health` e `/login` respondem 200 |
| Voz (Voice Studio) | **NO AR** | `https://voice.argusprime.com.br` — 401 sem chave, 200 com `VOICESTUDIO_API_KEY`; motor MOSS-TTS-Nano |
| WA-AKG (gateway WhatsApp) | **NO AR** | `https://crm.argusprime.com.br/prospectra-whatsapp` — 401 sem `x-api-key` |
| Heartbeat (cron) | **NO AR** | `/usr/local/bin/prospectra-tick` + `/etc/cron.d/prospectra-tick`, a cada 5 min |
| Gate de imagem/ligação | **IMPLEMENTADO** | `orgs.image_enabled` / `orgs.call_enabled`, default `false`, liberados em `/admin` |
| Agenda (cal.diy) | **SUBSTITUÍDA** | O cal.com saiu de cena: o domínio `https://agenda.argusprime.com.br` agora serve o **app do Prospectra** (vhost trocado em 30/10 ✅). O serviço dele continua rodando em `127.0.0.1:3102`, **sem vhost público** |
| Agenda nativa | **NO AR + PARIDADE DE FEATURES** | Publicada e validada ponta a ponta (8/8 no fluxo público, 32/32 rotas em 200). Ganhou o que faltava: convite `.ics` por e-mail, aviso ao vendedor, confirmação no WhatsApp do participante, **lembrete automático antes da reunião** (no cron) e **bloqueios de compromissos** com tela em `/agenda`. Matriz de paridade em `docs/AGEND-NATIVA.md` §9 |
| Inteligência comercial | **EXECUTOR CRIADO** | A tela enfileirava e **ninguém processava** — não existia consumidor de `intelligence_jobs`. Agora há `src/lib/intelligence/runner.ts` (claim com `SKIP LOCKED`, 6 fatores, IA como cérebro + heurística), rodando no cron de 5 min. Falta ligar `INTELLIGENCE_WORKER_ENABLED=true` na VPS |
| WhatsApp (WA-AKG) | **RELIGADO (30/10 22:23)** | A instância do WhatsApp **caía** e o Prospectra falhava com "WA-AKG indisponível". Duas causas: (a) o `crm.argusprime.com.br` aponta para a **Vercel**, então o proxy do WA-AKG nunca chegava na VPS — o gateway foi publicado em `https://prospectra.argusprime.com.br/whatsapp-gateway` (vhost versionado em `infra/prospectra/nginx/prospectra.argusprime.com.br.nginx`); (b) a sessão do WA-AKG foi pareada com o id da operação **antigo** (antes do Neon recriar as tabelas) — agora `WA_AKG_SESSION_ID` fixa a sessão. Enviar mensagem foi validado no gateway |
| IA (GLM) | **FALLBACK IMPLEMENTADO** | A conta z.ai está **sem saldo** (`1113`): `glm-4.7` não responde, `glm-4.7-flash` está em rate limit (`1302`). Agora a chamada cai sozinha para `glm-4.7-flash` → `glm-4.5-flash` (grátis) e o Harvey usa o provedor configurado (antes exigia OpenRouter e nunca funcionou). **Recarregar a z.ai** devolve o 4.7 como cérebro |
| WhatsApp (número real) | **AGUARDA PAREAMENTO** | Falta escanear o QR do número na tela **WhatsApp** do app |
| Voz automática | **LIGADA (02/11) — FALTA O PERFIL DE VOZ EM PRODUÇÃO** | `VOICE_AUTOMATION_ENABLED=true` na VPS, executor de voz como serviço systemd (`prospectra-voice-worker`), demo nunca envia (o executor ignora org de demonstração). Em `/whatsapp` o painel "Sua voz no WhatsApp" está ativo. **Falta**: você cadastrar o perfil de voz na `Argus Prime` (gravar + transcrever + autorizar) |
| LinkedIn automático | **ENTREGUE (01/11) — FALTA CREDENCIAL** | Tela de **conectar conta** (OIDC por usuário) em `/linkedin`, API `GET|DELETE /api/integrations/linkedin/connect` + `/start` + `/callback`, marca oficial `#0A66C2`, **gate em 3 camadas** (editor, cadência, execução automática) com `orgs.linkedin_enabled`. Na **demo** a persona **"João da Silva"** aparece com conta simulada, campanha e fila próprias. **Falta**: `LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI` (credencial do dono) e o worker com `li_at`/proxy para envio real. PRD em `docs/PRD-2026-11-01-LINKEDIN.md` |
| Guia da ferramenta | **ENTREGUE (01/11)** | `docs/GUIA.md` + `docs/guia/01..06`: produto/rotas, dados/deploy/runbook, decisões e expectativas, marca do LinkedIn, **arquitetura atual e escala**, **tela de ambiente**. Versão consolidada em PDF (116 páginas) gerada por `build-doc.mjs` |
| Identidade das marcas | **ENTREGUE (01/11)** | Botão "Conectar conta" com o símbolo e o azul oficial `#0A66C2`; símbolo do WhatsApp (`src/components/whatsapp-mark.tsx`) em `#25D366`; selo reutilizável `src/components/integration-badge.tsx`; atalhos em `/conta`; estado real (pareado/pareando/desconectado) em `/whatsapp` |
| Tela de ambiente | **ENTREGUE (02/11) — VARIAÇÃO A NO AR** | O dono escolheu a **A ("Escolha o seu mundo")**: tela cheia dividida, produção em azul escuro e demonstração em violeta, badge "Você está aqui", métricas reais por lado e selos de integração. O código foi para dentro de `src/app/ambiente/page.tsx`; as variações B e C e a página de conferência `/ambiente-variantes` foram **removidas**. "Recriar do zero" continua na tela, com trava no servidor (`confirmar=sim`). Decisão em `docs/guia/06-tela-de-ambiente.md` |
| Escopo e não-intervenção | **ENTREGUE (01/11)** | `docs/ESCOPO-E-TOCABILIDADE.md`: o que é do Prospectra, o que é intocável (CRM, Reversa/Gov, site, e-mail, cal.diy) e as regras operacionais |
| **Ambiente de demonstração** | **COMPLETO (31/10, recontado em 01/11 21h)** | A demo semeia o cenário fictício inteiro. Contagem real do banco em 01/11/2026: **35 tabelas com dado** de 46 no total; as 4 vazias com `org_id` são `deletion_reports`, `linkedin_dispatches`, `support_widget_origins` e `whatsapp_commands` (recibos de envio/exclusão — vazios por desenho, porque a demo não envia nada). Botão **“Recriar do zero”** em `/ambiente`, rota `POST /api/demo/reset`, script `scripts/demo-reset.ts`. Roteiro em `docs/DEMO.md` |
| Helpin fase 6 | **NO AR** | Atributos, SLA, horário + auto-resposta, CSAT, relatórios, webhooks e auditoria ✅ |
| CRM (Argus) | **FORA DE ESCOPO** | Re-deploy do CRM em andamento por você; nada do Prospectra+ depende disso |

---

## 2. O que está NO AR

### 2.1 Prospectra+ (web)

`https://prospectra.argusprime.com.br` — **implantação nativa na VPS** (a Vercel continua
publicando, mas o tráfego vai para a VPS ✅). Nginx → `127.0.0.1:3100` (`systemd
prospectra-plus`), release em `/opt/prospectra-plus-release-<sha>` com symlink
`/opt/prospectra-plus-current`. O env fica em `/etc/prospectra-plus/app.env` (600) ✅.

Publicar uma versão:

```bash
# na VPS: o repo precisa do .git
cd /opt/prospectra-plus && git fetch origin main
/usr/local/bin/prospectra-plus-release <sha>     # migra, compila, troca symlink, valida
```

`/api/health` e `/login` respondem 200 ✅. App, login, CRM/leads, importação de leads,
cadência assistida, IA de texto, DISC, campanha multicanal e Helpin nativo estão publicados ✅.

### 2.2 Voz — Voice Studio

| | |
|---|---|
| Serviço | systemd `prospectra-voice` — `active` |
| Endereço local | `http://127.0.0.1:3900` (só loopback) |
| Endereço público | `https://voice.argusprime.com.br` |
| Autenticação | `Authorization: Bearer <chave>` — **401 sem chave** |
| Motor | **MOSS-TTS-Nano** (`OpenMOSS-Team/MOSS-TTS-Nano-100M`, Apache-2.0, uso comercial ok) |
| Profile de produção | `70b1a89f` — "Voz Prospectra PT-BR", `kind=clone`, `language=Portuguese` |

O motor, os patches do pacote, a masterização em numpy e as env vars de velocidade estão
documentados em `docs/voice-studio.md`. Resumo: o serviço responde, gera áudio em
português e o e2e foi validado (`POST /profiles` → JSON com id; `POST /generate` → WAV
binário com o id no header `X-Audio-Id`; `GET /audio/{id}.ogg` → Ogg/Opus).

O **OmniVoice foi descartado**: licença CC-BY-NC, não comercial.

### 2.3 WA-AKG — gateway WhatsApp

O gateway roda na VPS, escutando em `127.0.0.1:3101`, publicado por um *location* do vhost
`argus-crm`:

```nginx
location ^~ /prospectra-whatsapp/api/ {
    # allowlist de rotas + checagem de x-api-key
    rewrite ^/prospectra-whatsapp(/api/.*)$ $1 break;
    proxy_pass http://127.0.0.1:3101;
}
```

O dashboard e o banco do AKG ficam privados (acesso por túnel SSH). Fora do *location*,
`/prospectra-whatsapp/` devolve 404.

### 2.4 Heartbeat (cron)

O cron real está na VPS, não no GitHub:

```
*/5 * * * * root /usr/local/bin/prospectra-tick
```

O workflow `tick.yml` do GitHub é **throttled (1x/dia)** e serve apenas de rede de
segurança. A cadência de 5 min é a da VPS.

### 2.5 Gate de imagem e ligação

O commit `1a6762f` (migração `drizzle/0020`) adicionou `orgs.image_enabled` e
`orgs.call_enabled`, **default `false`**. O passo de campanha do tipo `image`
(automático) e o do tipo `call` (assistido) só funcionam com a operação **ativada em
`/admin`**. Sem ativação: o passo não é oferecido no editor, não vira tarefa na Fila e
nada é enviado. Passo já existente continua visível, com aviso de que não age.

### 2.6 Variáveis na Vercel

Já configuradas em produção (só os nomes; valores não saem daqui):

`WA_AKG_BASE_URL`, `WA_AKG_API_KEY`, `VOICESTUDIO_BASE_URL`, `VOICESTUDIO_API_KEY`,
`VOICESTUDIO_ENGINE`, `VOICE_AUTOMATION_ENABLED`, `CRON_SECRET`, `HARVEY_WEBHOOK_SECRET`,
`PUBLIC_APP_URL`, `MASTER_USER_EMAIL`, `OFFICE365_SENDER_EMAIL`, `BLOB_READ_WRITE_TOKEN`.

### 2.7 Helpin — fase 6 (30/10)

Schema (migration aditiva `drizzle/0021_helpin_fase6_sla_atributos.sql` ✅) + módulos em
`src/lib/` + APIs + três telas novas, todas em pt-BR e responsivas:

| Entrega | Onde | Como funciona |
|---|---|---|
| Atributos personalizados | `/leads/atributos` | Campos por operação (texto/número/data/sim-não/lista) gravados em `leads.attributes` |
| SLA | `/atendimento` | Prazo de 1ª resposta e de resolução; conta só o horário comercial se você marcar |
| Horário + auto-resposta | `/atendimento` | Dias, hora de abertura/fechamento e fuso; fora do horário entra a mensagem automática |
| CSAT | widget | O cliente avalia de 1 a 5 ao fim da conversa; entra no relatório |
| Relatórios | `/relatorios` | Volume, 1ª resposta, SLA, resolução, CSAT, agentes e times |
| Webhooks | `/atendimento` | 5 eventos com assinatura HMAC-SHA256 (`X-Prospectra-Signature`) |
| Auditoria | `/atendimento` | Trilha das ações sensíveis da operação |

**Como verificar**: `/api/health` ✅, `/api/cron` ✅, `/api/support/reports` (sessão) ✅,
`/atendimento` ✅, `/relatorios` ✅, `/leads/atributos` ✅.

### 2.8 Entrega de 30/10 (tarde) — voz, agenda e LinkedIn

| Entrega | Onde | Como funciona |
|---|---|---|
| Clonagem da sua voz | `/voz` | Você grava → o Prospectra transcreve no Voice Studio → cria o perfil vinculado só à sua conta |
| Primeiro acesso da agenda | Card no Painel e em `/admin` | **Substituído pela agenda nativa** (seção 2.9) — o card do cal.diy saiu do app |
| LinkedIn automático | `/admin` | Backend ligado; cada operação libera o seu. A fila só despacha para operação com o flag ligado |
| Transcrição automática | `VoiceStudioGateway.transcribe()` | Novo método: `POST /transcribe` no Voice Studio (multipart, `language=pt`) |

---

### 2.9 Agenda nativa — o que mudou (30/10/2026, fechamento)

A agenda **deixou de ser um app separado**. O cal.com (cal.diy) era um Next.js à parte, na
porta 3102, ligado ao Prospectra só por um card com link externo — não era integração.
Agora é **um módulo dentro do Prospectra**: mesmo banco (Neon), mesma sessão, mesma
operação, lead vinculado à reserva.

| Entrega | Onde | Como funciona |
|---|---|---|
| Tipo de reunião | `/agenda` | Título, duração, antecedência, intervalo, fuso, local da call, "exigir aprovação do vendedor"; slug único na operação |
| Disponibilidade | `/agenda` | Janelas semanais por dia da semana (minutos desde 00:00 no fuso do evento) |
| Link rastreado | `/agenda` → "Gerar link" | Gera `agenda_links` com token; se gerar para um lead, a reserva nasce **vinculada a ele** |
| Grade pública | `/agendamento/<slug>` | Horários livres por dia, pt-BR, mobile-first; agenda com nome/e-mail/telefone/observação |
| Cancelamento | `/agendamento/cancelar?token=...` | Token por reserva; marca `cancelled` + `cancelledAt` |
| Reservas do time | `/agenda` | Próximas reservas, confirmar (quando `requested`) e cancelar |
| Schema | `drizzle/0023_agenda_nativa.sql` | `agenda_event_types`, `agenda_availability`, `agenda_blackouts`, `agenda_links` + colunas novas em `meetings` |
| Sem duplicidade | banco | `meetings_no_double_booking` (não agenda 2× o mesmo horário do mesmo vendedor) e `meetings_one_open_per_lead` (1 reunião aberta por contato) |

**O servidor nunca confia no horário enviado pelo navegador**: `bookPublic` recalcula a
grade na hora e valida o pedido contra a disponibilidade atual.

**Domínio**: `agenda.argusprime.com.br` passou a servir o app do Prospectra
(`127.0.0.1:3100`) em 30/10 ✅ — o vhost novo está versionado em
`infra/prospectra/nginx/agenda.argusprime.com.br.nginx`, o antigo do cal.com foi
removido de `sites-enabled` mas **preservado em `sites-available`** (rollback em um
comando). O serviço `prospectra-agenda` (cal.com) **continua rodando** em `127.0.0.1:3102`
— ele só perdeu o vhost público.

**Estado do cal.com**: banco vazio (0 `EventType`, 0 `Booking`, 0 `Availability`) — **nada
a migrar**. O desligamento definitivo do serviço é decisão do dono, depois de validar a
agenda nativa (passo a passo em `docs/AGEND-NATIVA.md`, seções 4 e 5).

> ✅ **Release publicada (30/10).** O código está no `main` e no ar: a release `2d3111e`
> está em produção na VPS, com as migrations aplicadas no Neon. `/agenda` (com sessão) e
> `/agendamento/*` (público) respondem, e `agenda.argusprime.com.br` já serve o app.

---

### 2.10 Achados da auditoria de 30/10 (o que já foi corrigido)

| Achado | Correção |
|---|---|
| `prospectra-harvey-recovery` falhando **todo dia** com HTTP 403 | O Cloudflare bloqueia o User-Agent padrão do Python (`Python-urllib/3.x`). O script agora manda `User-Agent: Prospectra-Recovery/1.0` ✅ — recovery "succeeded" |
| Units e scripts da VPS **fora do repo** (infra não reproduzível) | Versionados em `infra/prospectra/systemd/` e `infra/prospectra/scripts/` ✅, com o README de instalação ✅ |
| `CRON_SECRET` precisa ser igual em 3 arquivos | `app.env`, `harvey-worker.env` e `cron.env` — divergência = 403 silencioso ✅ |

---

## 3. O que falta e de quem depende

| # | Item | O que falta | Depende de |
|---|------|-------------|------------|
| 1 | **WhatsApp real** | Parear o número (QR na tela **WhatsApp** do app) e validar envio/recebimento/respostas/encaminhamento | **Você** escaneando o QR |
| 2 | **Voz automática** | `VOICE_AUTOMATION_ENABLED=true` **ligado em 02/11** ✅ com executor systemd e trava de demo ✅. Falta **clonar a sua voz na operação de produção** (`Argus Prime` está com 0 perfis): em `/whatsapp`, gravar + transcrever + autorizar | **Você** (a gravação) |
| 3 | ~~Agenda nativa — publicar~~ **FEITO (30/10)** | Publicada na VPS e validada: fluxo público 8/8, 32/32 rotas em 200, suíte 46 arquivos / 215 testes | — |
| 4 | **Agenda nativa — primeiro tipo de reunião** | Criar o 1º tipo de reunião em `/agenda` (título, duração, disponibilidade) e gerar o link público; testar uma reserva e o cancelamento. Passo a passo em `docs/AGEND-NATIVA.md` §4 | **Você** (a agenda de verdade) |
| 7 | **Recarregar a conta z.ai** | Sem saldo, o GLM 4.7 não responde (`1113`). O app cai para `glm-4.5-flash` (grátis), mas o "cérebro" ideal é o 4.7 — recarregar em <https://z.ai> (console da conta) | **Você** (pagamento) |
| 9 | **Importar leads na operação Argus Prime** | A operação está com **0 leads** (consequência do incidente Neon: as tabelas foram recriadas). A inteligência comercial não tem o que analisar até haver leads. Importação em `/leads` (CSV/URLs) |
| 8 | **Consentir `Calendars.Read` no Office 365** | Para a agenda ler a agenda externa do vendedor e bloquear esses horários. Hoje bloqueia por reservas + bloqueios manuais (`/agenda` → compromissos) | **Você** (admin do tenant) |
| 5 | **Desligar o cal.com** | O serviço `prospectra-agenda` (3102) já está **sem vhost público** ✅ e o banco dele está **vazio** (0/0/0) ✅. Falta você validar a agenda nativa e então `systemctl disable --now prospectra-agenda` + remover `AGENDA_BASE_URL` do `app.env` (§5 de `docs/AGEND-NATIVA.md`) | **Você** (após validar) |
| 6 | **Agendamento de reuniões (fila assistida)** | Apontar `MEETING_SCHEDULER_URL` na Vercel para a página do tipo de reunião na agenda nativa (`https://agenda.argusprime.com.br/agendamento/<slug>`); o provedor de e-mail (Gmail/Office365/Zimbra) você configura | Agenda nativa publicada |
| 7 | **LinkedIn automático** | O backend **já está ligado** ✅ e cada operação liga o seu em `/admin` ✅ — falta `LINKEDIN_WORKER_URL`/`LINKEDIN_WORKER_KEY` ✅, rodar `infra/linkedin` com `LI_AT` e `PROXY_URL` ✅ e revalidar os seletores no site vivo ✅ | **Você** (proxy e conta) |
| 8 | **Worker de inteligência** | `INTELLIGENCE_WORKER_ENABLED` não está configurada na Vercel; o executor Python precisa ser validado na VPS | Validação na VPS |
| 9 | **CRM (Argus)** | Nada — fora de escopo nesta fase | **Você** (re-deploy) |
| 10 | **Helpin standalone** | **Não recomendado** — ver riscos | Decisão sua |

### 3.1 Fila de construção (funcionalidades pedidas e ainda não prontas)

Itens que o dono pediu e que **não** existem no app hoje. A ordem é a ordem de
execução; cada item só entra em desenvolvimento depois de fechado o escopo.

| # | Item | Situação real hoje | O que precisa ser fechado antes de codar |
|---|------|--------------------|--------------------------------------------|
| F1 | **Módulo de fluxos arrastáveis** (flow builder) | **ENTREGUE (02/11)** — `/fluxos` (lista) e `/fluxos/[id]` (construtor com paleta, arraste nativo, configuração por bloco e dia acumulado), vínculo campanha↔fluxo no editor de campanha, tabelas `flows`/`flow_steps` + `campaigns.flow_id` (migration `0026_fluxos.sql`), gate nas mesmas 3 camadas, demo semeando 2 fluxos. **Sem motor novo**: o motor de cadência existente executa o fluxo (`src/lib/flows/resolve.ts`). Doc: `docs/FLUXOS.md` | — |
| F4 | **Timeout de sessao por inatividade** | **ENTREGUE (04/11)** — 15 minutos sem uso encerram o Prospectra: o navegador manda a "batida" que renova a sessao, avisa 2 minutos antes e, no fim, destroi a sessao no servidor (banco + cookie) e volta para o login. Configuravel em `SESSION_IDLE_MINUTES`. `src/lib/session-idle.ts`, `src/components/guarda-sessao.tsx` | — |
| F2 | **Editor visual do fluxo de LinkedIn** | Depende de F1 | herda as decisões de F1 |
| F3 | **Fluxo entre operações** (reutilizar um modelo de fluxo em várias campanhas/operações) | Depende de F1 | modelo de dados (`flow_templates`?) — fora do escopo da fase 1 do PRD |

**Regra:** nada de F2/F3 começa sem o aval do dono sobre o **preview** (processo em
`docs/guia/07-processo-de-entrega.md` §2.4). F1 cumpriu o caminho completo: preview
mostrado → escopo fechado no PRD → implementação → teste → doc → release.

---

## 4. Pendências e decisões do dono

1. **`VOICE_AUTOMATION_ENABLED`** — **LIGADO em 02/11/2026** na VPS (decisão do
   dono), com três proteções: (a) o executor de voz virou serviço systemd
   (`prospectra-voice-worker`) e só roda com a flag ligada; (b) o executor
   **ignora operação de demonstração** — os telefones do seed são fictícios com
   formato de número real; (c) a fila de voz da demo foi limpa e o job pendente
   fica na fila. **Falta o dono cadastrar o perfil de voz na operação de produção**
   (`Argus Prime` está com 0 perfis): em `/whatsapp`, gravar + transcrever +
   autorizar. Sem perfil, a voz não sai em produção.
2. **LinkedIn (termos de uso)** — não ativar sem decisão explícita sua. O executor HTTP
   (`src/lib/linkedin/http-executor.ts`) e o worker da VPS (`infra/linkedin/`) existem;
   o que falta é a decisão, as três variáveis acima e a revalidação dos seletores no
   LinkedIn vivo.
3. **Mover o WA-AKG para um vhost próprio — antes do re-deploy do CRM.** O gateway mora
   **dentro** do vhost `argus-crm`. Um re-deploy do CRM reescreve
   `/etc/nginx/sites-available/argus-crm` e pode apagar o *location* do proxy e o check
   de `x-api-key`. Ver o risco na seção 5.
4. **Número do WhatsApp para parear** — cada vendedor pareia a própria sessão; o QR
   aparece na tela **WhatsApp** do app. Sem pareamento, o gateway responde mas não há
   número conectado.
5. **Helpin standalone — não recomendado.** O script `scripts/install-helpin-vps.sh` (no
   repo) instala o Helpin integral em Docker na VPS, mas: exige **8 GiB de RAM** (mínimo
   oficial, com 20 GiB de disco) numa VPS de **12 GB** que já hospeda voz, WhatsApp,
   CRM e o build da agenda; e **duplica o Helpin nativo** que já está no `main` (inbox
   web/WhatsApp/interno, dois públicos, central de ajuda, merge de CRM, etiquetas, notas
   internas e @menções, times de atendimento). Manter o Helpin nativo.
6. **Cal.com — desligar depois de validar.** O serviço `prospectra-agenda` (3102) já está
   **sem vhost público** (30/10 ✅) e o banco dele está **vazio** (0 evento, 0 reserva,
   0 disponibilidade) ✅ — **nada a migrar**. Ainda assim ele roda, ocupando memória e
   CPU da VPS. Depois de você validar a agenda nativa (criar um tipo de reunião, gerar um
   link, fazer e cancelar uma reserva de teste), o desligamento é:
   `systemctl disable --now prospectra-agenda` + remover `AGENDA_BASE_URL` de
   `/etc/prospectra-plus/app.env` + `systemctl restart prospectra-plus`.
   Passo a passo e rollback em `docs/AGEND-NATIVA.md` §5. **Não desligar antes de validar.**
7. **Publicação da release da agenda** — o domínio já aponta para o app, mas a release
   que está na VPS ainda não tem as rotas da agenda. Publicar antes de criar o primeiro
   tipo de reunião, senão `/agenda` responde 404.

---

## 5. Riscos conhecidos

| Risco | Detalhe | Mitigação |
|---|---|---|
| **WA-AKG dentro do vhost `argus-crm`** | O *location* `^~ /prospectra-whatsapp/api/` e o `proxy_pass` para `127.0.0.1:3101` vivem em `/etc/nginx/sites-available/argus-crm`. O re-deploy do CRM reescreve esse arquivo | Mover o WA-AKG para um vhost próprio **antes** do re-deploy do CRM |
| **Helpin standalone na mesma VPS** | 8 GiB de RAM mínimo numa VPS de 12 GB, somando voz, gateway, CRM e build da agenda; e duplica o Helpin nativo | Não instalar; manter o Helpin nativo do `main` |
| **Voz: referência de demonstração** | `demo0001.wav` é a voz de demonstração do VoiceStudio, **em inglês**; o profile `70b1a89f` clona esse timbre | Para produção em pt-BR, grave uma referência do locutor e recrie o profile |
| **Voz: custo de CPU** | ~3 min de CPU por take em 2 vCPU | Gerar só na VPS; nunca em Vercel Functions |
| **Voz: patches do motor** | O upstream do `moss-tts-nano` não funciona sem os patches; reinstalar o pacote ou limpar o cache do HF quebra a voz | Ver `docs/voice-studio.md` — backups `.orig`/`.bak` na VPS |
| **Cal.com ainda rodando em 3102** | O serviço `prospectra-agenda` continua ativo na VPS (memória/CPU), mesmo sem vhost público e com banco vazio | Desligar **depois** de validar a agenda nativa — `systemctl disable --now prospectra-agenda` (decisão do dono, `docs/AGEND-NATIVA.md` §5) |
| **Agenda nativa: desligar o cal.com** | O serviço `prospectra-agenda` (cal.com) continua ativo na VPS, agora sem vhost público e com banco vazio | Desligar **depois** de usar a agenda nativa — `systemctl disable --now prospectra-agenda` (decisão do dono, `docs/AGEND-NATIVA.md` §5) |

---

## 6. Como verificar cada coisa hoje

### 6.1 De fora (curl de uma linha)

```bash
# Prospectra+ (web) -> 200
curl -s -o /dev/null -w '%{http_code}\n' https://prospectra.argusprime.com.br/api/health

# Voz sem chave -> 401
curl -s -o /dev/null -w '%{http_code}\n' https://voice.argusprime.com.br/health

# Voz com chave -> 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $OMNIVOICE_API_KEY" https://voice.argusprime.com.br/health

# WA-AKG sem x-api-key -> 401
curl -s -o /dev/null -w '%{http_code}\n' https://crm.argusprime.com.br/prospectra-whatsapp/api/sessions

# WA-AKG com x-api-key -> 200
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $WA_AKG_API_KEY" https://crm.argusprime.com.br/prospectra-whatsapp/api/sessions

# Agenda (vhost trocado em 30/10) -> 307 (redireciona para o login do app)
# 404 em /agendamento é o APP sem a rota (falta publicar a release) — nunca 502/503
curl -s -o /dev/null -w '%{http_code}\n' https://agenda.argusprime.com.br/
curl -s -o /dev/null -w '%{http_code}\n' https://agenda.argusprime.com.br/agendamento
```

### 6.2 Na VPS

```bash
# serviços
systemctl is-active prospectra-plus         # active
systemctl is-active prospectra-voice         # active
systemctl is-active prospectra-agenda        # active (cal.com; só perde o vhost público)

# app (3100) e cal.com (3102) — os dois no ar
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3102/

# vhost da agenda (o nginx só escuta em [::]:80 — teste com Host)
curl -s -o /dev/null -w '%{http_code}\n' -H "Host: agenda.argusprime.com.br" "http://[::1]/agendamento"

# voz
curl -s http://127.0.0.1:3900/health          # {"status":"ok","device":"cpu","version":"0.5.7"}

# gateway WhatsApp (401 = no ar, exigindo chave)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/api/sessions

# heartbeat
cat /etc/cron.d/prospectra-tick               # */5 * * * * root /usr/local/bin/prospectra-tick
```

SSH (usar `timeout` e nunca `tail -f` — a VPS está sob carga):

```bash
ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no -p 9229 root@VPS-905340.ssh.vps1euro.fr "<comando>"
```

---

## 7. Arquivos relacionados

| Arquivo | O que é |
|---|---|
| `docs/voice-studio.md` | Procedimento da voz na VPS: motor, patches, contrato da API, como reverter |
| `docs/wa-akg.md` | Gateway WhatsApp: preparação, variáveis, pareamento |
| `docs/AGEND-NATIVA.md` | **Agenda nativa**: como funciona, URLs, variáveis, passo a passo do dono, o que fazer com o cal.com e rollback do vhost |
| `docs/HANDOFF-CODEX.md` | Estado do produto e próximos passos de código |
| `scripts/install-helpin-vps.sh` | Instalador do Helpin standalone — **não recomendado** (ver seção 4) |

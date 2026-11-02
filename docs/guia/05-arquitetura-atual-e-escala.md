# Parte 5 — Arquitetura atual e caminho de escala

> Estado real em **01/11/2026**, conferido no código, no versionamento de infra e na
> própria VPS. Onde não deu para verificar, o texto diz **"não verificado"** — não há
> número inventado aqui.

---

## 1. Topologia real agora

### 1.1 O caminho do usuário (app)

```
navegador
   │  HTTPS
   ▼
Cloudflare (edge/DNS)  ── zona argusprime.com.br
   │  AAAA 2a0c:b641:1a0:800::256 (proxy ligado), SSL "flexible"
   ▼
Envoy (server: istio-envoy)         ← roteia o host; hosts desconhecidos vão para a Vercel
   │  HTTP
   ▼
nginx na VPS  ([::]:80 — escuta SÓ em IPv6)
   │  location /
   ▼
app Next.js  127.0.0.1:3100   (systemd: prospectra-plus)
   │
   ├── drizzle-orm ──► Neon Postgres (PostgreSQL)
   ├── rotas /api/* (Next) ──► IA (z.ai/GLM), Office 365, WhatsApp, LinkedIn
   └── /voz (Next em 3112) ──► motor de voz
```

**Detalhe que costuma morder:** o nginx da VPS escuta apenas em `[::]:80`. Teste com
`127.0.0.1:80` dá *connection refused* — o certo é `[::1]:80`. O mesmo vale para o
tunnel, cujo origin é `http://[::1]:80`.

### 1.2 O caminho do WhatsApp (exceção 1)

```
app (3100) ──POST /whatsapp-gateway/api/messages/...──►
   ▼
nginx (vhost prospectra.argusprime.com.br)
   │  location ^~ /whatsapp-gateway/api/
   │  exige header x-api-key (401 sem ele)
   │  allowlist de URIs (404 fora da allowlist)
   │  rewrite ^/whatsapp-gateway(/api/.*)$ $1 break
   ▼
WA-AKG  127.0.0.1:3101   (systemd: prospectra-wa-akg, node+tsx)
   │  sessão fixa via WA_AKG_SESSION_ID
   ▼
WhatsApp (número pareado)
```

O prefixo `/whatsapp-gateway` existe para o gateway **não** colidir com as rotas do
próprio app Next.js. Sem ele, `/api/...` do gateway e `/api/...` do app brigariam pelo
mesmo prefixo no mesmo vhost.

### 1.3 O caminho do WhatsApp pela Cloudflare (exceção 2 — o bridge)

Quando o gateway precisa ser alcançado por um host de 1 nível (o wildcard do
Universal SSL só cobre `*.argusprime.com.br`):

```
app ou cliente ──► https://wa.argusprime.com.br/whatsapp-gateway/api/...
   ▼
Cloudflare edge (DNS: CNAME 9feddb29-4fe9-48eb-9bf0-cc3e592ad868.cfargotunnel.com)
   ▼
Cloudflare Tunnel (id 9feddb29-4fe9-48eb-9bf0-cc3e592ad868)
   │  ingress → http://[::1]:80
   │  originRequest.httpHostHeader: gw.prospectra.argusprime.com.br
   ▼
nginx (vhost gw.prospectra.argusprime.com.br)  →  127.0.0.1:3101 (WA-AKG)
```

O **bridge** (`prospectra-wa-gateway-bridge`, um Worker) é só um proxy: ele traduz o
host de 1 nível para o host do tunnel. Ele **não** é um gateway novo e não guarda
estado de mensagem.

### 1.4 A agenda (exceção 3)

```
https://agenda.argusprime.com.br/...
   ▼
nginx (vhost agenda.argusprime.com.br)
   │  /auth/setup e /api/auth/setup → 403 (setup desativado)
   │  raiz → 302 /agendamento
   ▼
app Next.js  127.0.0.1:3100  (a mesma aplicação do Prospectra)
   ▼
tabelas nativas: meetings / meeting_types / meeting_slots / meeting_blocks
```

O **cal.diy** (`prospectra-agenda.service`) continua rodando em `127.0.0.1:3102`, **sem
vhost público**, e com o banco vazio. Ele é o rollback antigo, não o produto.

### 1.5 A voz (exceção 4)

```
https://voice.argusprime.com.br  ──► nginx ──► 127.0.0.1:3900
                                          (uvicorn /opt/prospectra-voice — MOSS-TTS-Nano)
app /voz (Next em 3112) ──► VOICESTUDIO_BASE_URL ──► voice.argusprime.com.br
```

O gateway de voz exige `VOICESTUDIO_API_KEY` (401 sem a chave).

### 1.6 A rota alternativa: Cloudflare Worker (OpenNext)

Existe um Worker `prospectra` (OpenNext) com o mesmo app:

```
https://prospectra.atintilio.workers.dev ──► Worker ──► Neon via driver WebSocket
```

Ele foi construído para **tirar a Vercel do caminho de produção**, mas **ainda não está
aprovado**: as rotas que tocam o banco respondem 500 por causa do driver do Neon
(compartilhado entre requisições). O conserto (um `Client` WebSocket **por requisição**)
está commitado (`78d80d3`) e **ainda não publicado**, porque falta o token da Cloudflare.
**Enquanto o Worker não estiver verde, o domínio oficial continua na VPS.**

---

## 2. Plano de controle × plano de dados

| Peça | Dono | Se cair | Impacto | Como se recupera | Quem decide |
|---|---|---|---|---|---|
| **DNS / edge Cloudflare** | Dono (painel) | Domínio não resolve; app fora do ar | Alto — é a entrada de todo mundo | Painel Cloudflare | Dono |
| **Envoy (roteador do host)** | Infra da VPS | Host não roteia | Alto | Reiniciar o serviço | Infra |
| **nginx** | systemd na VPS | 502 em tudo | Alto | `systemctl restart nginx` | Infra |
| **app Next (3100)** | systemd `prospectra-plus` | 502/503 | Alto | Release script (com rollback) | Mavis (com o dono) |
| **Neon (Postgres)** | Neon (externo) | Sem dados, sem sessão | Alto | Neon faz failover automático; auto-cura local do drizzle | Dono (plano Neon) |
| **WA-AKG (3101)** | systemd `prospectra-wa-akg` | Sem WhatsApp; o resto do app funciona | Médio | Reiniciar o serviço; a sessão é reaproveitada | Dono (parear número) |
| **Voice Studio (3900/3112)** | systemd `prospectra-voice` | Sem voz | Médio-baixo | Reiniciar o serviço | Mavis |
| **Tunnel do Cloudflare** | `systemd: prospectra-tunnel` na VPS | `wa.argusprime.com.br` cai (o domínio oficial do app continua) | Médio | `systemctl restart prospectra-tunnel` (sobe sozinho) | Mavis |
| **Cron de 5 min** | `/etc/cron.d/prospectra-tick` | Cadência, lembretes e inteligência param | Médio | `prospectra-tick` roda de novo no próximo tick | Mavis |
| **Serviço do cal.diy (3102)** | systemd `prospectra-agenda` | Nada visível | Nenhum (sem vhost) | — | Dono (desligar depois de validar) |

---

## 3. O caminho de um request (e onde a segurança é decidida)

1. **Browser → Cloudflare**: TLS terminado no edge (SSL `flexible` na zona, então o
   edge→origem é HTTP). O IP do cliente segue em `CF-Connecting-IP`.
2. **Cloudflare → Envoy**: o Envoy decide o destino pelo `Host`. Hosts fora da lista
   (por exemplo `whatsapp.prospectra.*`) vão para a **Vercel** — foi assim que o CRM
   Argus ficou no ar ali, e também foi a causa de uma falha do WhatsApp no passado.
3. **Envoy → nginx**: o nginx escolhe o vhost pelo `server_name`.
   - `/whatsapp-gateway/api/*` → exige `x-api-key` e passa pela allowlist de URIs.
   - `/` → app Next.
4. **nginx → app (3100)**: `proxy_set_header Host`, `X-Forwarded-For`, `X-Forwarded-Proto`.
5. **No app (Next)**:
   - **Sessão**: cookie assinado com `AUTH_SECRET` (`src/lib/auth.ts`). A sessão carrega
     `userId` e `orgId`.
   - **Autorização por operação**: `requireOrg()`/`requireUser()` verificam a
     **membership** do usuário na operação — é aqui que o `orgId` de todo acesso a
     dados é fixado. Nenhuma query confia em `orgId` vindo do cliente.
   - **Gates por operação**: `orgs.image_enabled`, `orgs.call_enabled`,
     `orgs.linkedin_enabled` (default `false`). Validados em três camadas: o editor não
     oferece o passo, a cadência pula o passo e a execução automática exige gate global
     **e** gate da operação (`src/lib/campaign-features.ts`, `src/lib/cadence.ts`).
   - **Papel de plataforma**: `platformRole === 'admin'` amplia a visibilidade
     (ex.: `/admin` liga os gates).
6. **App → Neon**: drizzle-orm com `DATABASE_URL` (host *pooler* na VPS). Transações
   reais existem no código — por isso o Worker não pode usar o driver HTTP do Neon
   (`neon-http`), e sim WebSocket.

---

## 4. Estado de cada serviço

| Serviço | Onde | Porta | Como sobe | Health check |
|---|---|---|---|---|
| Prospectra+ (app) | `/opt/prospectra-plus`, `/opt/prospectra-plus-current` (symlink) | 3100 | `systemd: prospectra-plus` | `curl -s localhost:3100/api/health` → 200; `/login` → 200 |
| WA-AKG (WhatsApp) | `/opt/prospectra-wa-akg` | 3101 | `systemd: prospectra-wa-akg` | `curl -H 'x-api-key: …' https://prospectra.argusprime.com.br/whatsapp-gateway/api/sessions` → 200 |
| Voice Studio (motor) | `/opt/prospectra-voice` (venv Python) | 3900 | `systemd: prospectra-voice` | `curl -H "Authorization: Bearer $VOICESTUDIO_API_KEY" https://voice.argusprime.com.br/health` → 200 |
| Voice Studio (UI) | — | 3112 | `systemd: prospectra-voice` | não verificado |
| Agenda nativa | dentro do app (3100) | 3100 | mesma release do app | `curl -H 'Host: agenda.argusprime.com.br' http://[::1]:80/agendamento` → 200/302 |
| cal.diy (legado) | `/opt/prospectra-agenda` | 3102 | `systemd: prospectra-agenda` | sem vhost público — **não verificado por URL pública** |
| nginx | — | `[::]:80` | `systemd: nginx` | `curl -H 'Host: prospectra.argusprime.com.br' http://[::1]:80/login` → 200 |
| Tunnel Cloudflare | `/etc/cloudflared/tunnel.token` + `/usr/local/bin/cloudflared` | — | `systemd: prospectra-tunnel.service` (Restart=always) | `systemctl is-active prospectra-tunnel` → active; log `/var/log/cloudflared.log` |
| Cron de 5 min | `/usr/local/bin/prospectra-tick` + `/etc/cron.d/prospectra-tick` | — | cron do sistema | `tail /var/log/prospectra-plus-release.log`; resposta `{"processed":N,…}` |
| Cron diário (Vercel) | Vercel → `/api/cron` (`0 10 * * *`) | — | agendador da Vercel | **ainda ativo** — pendência de desligamento (precisa de token da Vercel) |

---

## 5. Onde cada coisa mora

### 5.1 VPS — `/etc/prospectra-plus/app.env` (modo 600)

Nomes das variáveis presentes (sem os valores):

```
AUTH_SECRET              OPENROUTER_API_KEY     INTELLIGENCE_WORKER_ENABLED
VOICE_AUTOMATION_ENABLED VOICESTUDIO_API_KEY    VOICESTUDIO_BASE_URL
VOICESTUDIO_ENGINE       AI_BASE_URL            AI_MODEL
AI_API_KEY               AI_FALLBACK_MODELS     CRON_SECRET
HARVEY_WEBHOOK_SECRET    WA_AKG_BASE_URL        WA_AKG_API_KEY
WA_AKG_SESSION_ID        OFFICE365_SENDER_EMAIL OFFICE365_TENANT_ID
OFFICE365_CLIENT_ID      OFFICE365_CLIENT_SECRET MASTER_USER_EMAIL
PUBLIC_APP_URL           BLOB_READ_WRITE_TOKEN  DATABASE_URL
LINKEDIN_AUTOMATION_ENABLED  AGENDA_BASE_URL    AGENDA_PUBLIC_URL
```

### 5.2 Worker (Cloudflare) — secrets

```
NEON_DATABASE_URL   (host direto, sem "-pooler" — o WebSocket exige o host direto)
```

### 5.3 Painel Vercel — variáveis do projeto

O projeto da Vercel ainda carrega `DATABASE_URL`, `CRON_SECRET` e as chaves de IA. Ele
é **espelho** hoje, não a origem do tráfego.

### 5.4 O que **nunca** pode ir para o navegador

`AUTH_SECRET`, `DATABASE_URL`, `CRON_SECRET`, `VOICESTUDIO_API_KEY`, `WA_AKG_API_KEY`,
`HARVEY_WEBHOOK_SECRET`, chaves do Office 365, `BLOB_READ_WRITE_TOKEN`, `AI_API_KEY`,
`OPENROUTER_API_KEY`, `LINKEDIN_CLIENT_SECRET`, `li_at` e `PROXY_URL` do LinkedIn.

---

## 6. Decisões de arquitetura (e o porquê)

| Decisão | Por quê |
|---|---|
| **App na VPS, não na Vercel** | A Vercel só publicava; o tráfego real já estava na VPS. Ter o app perto do WA-AKG e do motor de voz elimina um salto de rede em cada mensagem. A Vercel segue como espelho/rollback até o Worker ficar verde. |
| **Neon via WebSocket no Worker** | O runtime dos Workers **não faz I/O TCP**. O `postgres.js` (TCP) travava o request e o Workers matava a execução com erro 1101. O `@neondatabase/serverless` com `Client` WebSocket resolve. E, como o app usa transações, o driver HTTP (`neon-http`) foi descartado. |
| **Um `Client` do Neon por requisição** | Um `Pool` singleton criado na requisição A e reaproveitado na B quebra com *"Cannot perform I/O on behalf of a different request"*. O singleton só continua no Node (VPS). |
| **Gateway atrás de `/whatsapp-gateway`** | O gateway e o app dividem o mesmo vhost. Sem prefixo próprio, as rotas `/api/*` colidiriam. |
| **Bridge no Cloudflare + Tunnel** | O Universal SSL da zona cobre **um nível** (`*.argusprime.com.br`). Hosts de dois níveis (`wa.prospectra...`) falham no TLS. O tunnel resolve com host de 1 nível; o `httpHostHeader` mantém o vhost certo no nginx. |
| **cal.diy substituído pela agenda nativa** | Dois calendários, dois bancos e duas sessões para a mesma coisa. A agenda nativa usa a mesma sessão, a mesma operação e o mesmo banco do Prospectra — e ganhou paridade de recursos (convite `.ics`, aviso ao vendedor, confirmação no WhatsApp, lembrete automático, bloqueios). |
| **Gates por operação, default `false`** | Nenhum recursoexpensive (imagem, ligação, LinkedIn) liga sozinho. A operação decide. Três camadas: editor, cadência e execução automática. |
| **Cron unificado na VPS (5 min)** | A Vercel rodava um cron diário, que não cobria cadência, lembrete e inteligência. Um tick local de 5 minutos cobre tudo. O cron antigo da Vercel é pendência de desligamento. |
| **Notificações best-effort e idempotentes** | `invite_sent_at`, `seller_notified_at`, `reminder_sent_at`: reenviar é barato, perder a notificação é pior que duplicar. |

---

## 7. Como escalar

### 7.1 Mais operações (multi-tenant)

| O que muda | Limite atual | O que fazer |
|---|---|---|
| A tela `/ambiente` e o `ensureMasterOrg()` | Sobe uma operação por linha de `memberships` | Nada estrutural: a org é uma linha em `orgs` + `memberships`. A tela de ambiente já lista produção e demo da conta. |
| Isolamento de dados | `orgId` vem da sessão, nunca do cliente | Manter a regra: **toda** query filtra por `orgId` |
| Gates | Uma flag por capacidade, por operação | Continue por operação; não faça flag global |

### 7.2 Mais leads

| O que muda | Limite atual | O que fazer |
|---|---|---|
| Volume de query | Postgres único (Neon), pooler com pool de conexões | Subir o pool do Neon e/ou usar Hyperdrive quando o Worker estiver no ar |
| Importação | `/leads` importa CSV (5 colunas) | O import atual **ignora** e-mail e telefone do CSV — dá para lote e paralelizar antes |
| Fila do dia | `limit(300)` na fila | Paginar por data; hoje não há paginação |
| Contadores do painel | Contagens por tabela | Cachear por org com TTL curto |

### 7.3 Mais contas de WhatsApp

| O que muda | Limite atual | O que fazer |
|---|---|---|
| Sessões | Uma sessão por operação (`WA_AKG_SESSION_ID`) | Uma sessão por usuário/vendedor: chave do gateway passa a ser por conta, não por instalação |
| Concorrência | Um processo node (WA-AKG) | Subir para PM2/cluster **só** quando houver fila de mensagens simultânea |
| Envio em massa | Limites diários por usuário (`dailyInvites`, `dailyMessages`) | Manter — é proteção de conta, não de infraestrutura |
| CPU | Compressão de mídia happens no gateway | Subir a VPS antes de aumentar o paralelismo |

---

## 8. Riscos técnicos abertos

| # | Risco | Severidade | Mitigação proposta |
|---|---|---|---|
| **R1** | ~~**O tunnel do Cloudflare roda como processo manual**~~ **RESOLVIDO em 01/11/2026**: virou serviço systemd (`prospectra-tunnel.service`, `Restart=always`), com o token em `/etc/cloudflared/tunnel.token` (modo `600`, lido por `--token-file`, fora do `ps`) | ~~Alta~~ → **Baixa** (residual: se o arquivo for apagado, o serviço não sobe — documentado no README da infra) | Manter a unidade versionada em `infra/prospectra/systemd/`; trocar o token exige reescrever o arquivo e `systemctl restart` |
| **R2** | O Worker tem **500 nas rotas de banco** (fix `78d80d3` commitado e **não publicado**) — se o domínio for cortado antes do deploy, o app cai | **Alta** | Publicar o fix **e** rodar o smoke repetido **antes** de qualquer corte de rota |
| **R3** | Cron diário da Vercel (`0 10 * * *`) continua ativo e **aponta para o app antigo** | Média | Desabilitar quando houver token da Vercel com escopo no projeto certo |
| **R4** | Alias `prospectra.argusprime.com.br` na Vercel continua existindo — duas-published cópias do mesmo domínio | Média | Remover o alias junto com o cron (mesma pendência do token) |
| **R5** | O `main` do GitHub aponta para outra linha (a "Open Claude MVP"); a linha do Prospectra está em `backup/prospectra-plus-2026-10-31` e na branch `release/prospectra-cloudflare-20261101` | Média | Decisão do dono sobre qual linha fica no `main` |
| **R6** | O `DB_TOKEN`/segredo do Neon é sensível e vive em três lugares (VPS, secret do Worker, painel Vercel) | Média | Rotação documentada; nunca imprimir; sempre por arquivo temporário |
| **R7** | Dependência do z.ai sem saldo: `glm-4.7` responde 1113 e o `glm-4.7-flash` entra em rate limit (1302) | Média | O fallback (`glm-4.7-flash` → `glm-4.5-flash`) e a heurística do runner de inteligência já cobrem; recarregar a conta resolve |
| **R8** | `ENABLE` do LinkedIn depende de credenciais do dono e de um `li_at`/proxy estáveis | Média | Manter o padrão assistido; execução automática só com gate + credencial + proxy estável |
| **R9** | A VPS tem 12 GB e hospeda app, voz, WhatsApp, CRM, Helpin e o build do OpenNext | Média | Build do Worker em máquina separada (já é o caso: `/opt/cf-build`); nunca buildar no servidor em horário de pico |
| **R10** | `VOICE_AUTOMATION_ENABLED=false` por decisão do dono | Baixa | Manter até a validação à mão |
| **R11** | O log do tunnel mostra falha de DNS do resolver (`region1.v2.argotunnel.com: i/o timeout`) de forma intermitente | Baixa | Vigiar o log; o conector reconecta sozinho |

---

## 9. Checklist de manutenção

### Semanal

```bash
# 1. App e serviços no ar
curl -s -o /dev/null -w 'app %{http_code}\n' https://prospectra.argusprime.com.br/api/health
curl -s -o /dev/null -w 'wa   %{http_code}\n' https://prospectra.argusprime.com.br/whatsapp-gateway/api/sessions   # 401 = exige chave (ok)
curl -s -o /dev/null -w 'voz  %{http_code}\n' https://voice.argusprime.com.br/health

# 2. Cron de 5 min rodando
tail -20 /var/log/prospectra-plus-release.log | grep -E 'processed|failed'

# 3. Tunnel vivo
ps aux | grep -c '[c]loudflared'    # esperado: 2

# 4. Disco e memória
df -h / | tail -1; free -m | head -2
```

### Mensal

```bash
# 1. Release e rollback
readlink -f /opt/prospectra-plus-current
tail -50 /var/log/prospectra-plus-release.log

# 2. Migrações pendentes
cd /opt/prospectra-plus && ls drizzle/ | tail -5

# 3. Segredos: conferir que nenhum vazou para o navegador
curl -s https://prospectra.argusprime.com.br/login | grep -iE 'DATABASE_URL|AUTH_SECRET|AI_API_KEY' && echo 'VAZOU' || echo 'ok'

# 4. Neon: tamanho do banco e autovacuum
# (painel do Neon)

# 5. Backups
# (painel do Neon: retention > 7 dias)
```

### Quando algo quebrar

1. `curl -s https://prospectra.argusprime.com.br/api/health` — se der 502, é o app;
   se der 404/500 do Cloudflare, é o edge/route.
2. `systemctl status prospectra-plus` na VPS.
3. `tail -50 /var/log/prospectra-plus-release.log` — se houve release recente, o
   rollback automático já pode ter rodado.
4. Rollback manual: `/usr/local/bin/prospectra-plus-release <sha-anterior>`.

---

**Fontes:** código do repositório (`release/prospectra-cloudflare-20261101`), infra
versionada em `infra/prospectra/`, e leitura direta da VPS em 01/11/2026.
Itens marcados como "não verificado" não foram conferidos em tempo de execução.

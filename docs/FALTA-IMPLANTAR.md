# Prospectra+ — o que falta implantar (estado real em 29/10/2026)

O texto anterior (27/10) dizia que não havia acesso SSH à VPS, que a voz não estava no
ar e que a agenda não existia. **Nada disso é mais verdade**: o acesso SSH funciona
deste ambiente, a voz está **no ar e validada ponta a ponta** e a agenda está **em build**
na VPS.

Estado do repositório: `main` em `928e91e` — PRs #48..#58 e #30 mergeados, **zero PRs
abertas**. Detalhes operacionais da voz em `docs/voice-studio.md`; do gateway WhatsApp em
`docs/wa-akg.md`.

---

## 1. Status geral

| Item | Estado | Observação |
|---|---|---|
| Prospectra+ (web) | **NO AR** | `https://prospectra.argusprime.com.br` — `/api/health` e `/login` respondem 200 |
| Voz (Voice Studio) | **NO AR** | `https://voice.argusprime.com.br` — 401 sem chave, 200 com `VOICESTUDIO_API_KEY`; motor MOSS-TTS-Nano |
| WA-AKG (gateway WhatsApp) | **NO AR** | `https://crm.argusprime.com.br/prospectra-whatsapp` — 401 sem `x-api-key` |
| Heartbeat (cron) | **NO AR** | `/usr/local/bin/prospectra-tick` + `/etc/cron.d/prospectra-tick`, a cada 5 min |
| Gate de imagem/ligação | **IMPLEMENTADO** | `orgs.image_enabled` / `orgs.call_enabled`, default `false`, liberados em `/admin` |
| Agenda (cal.diy) | **EM BUILD** | DNS e vhost prontos; o serviço ainda não sobe (502) |
| WhatsApp (número real) | **AGUARDA PAREAMENTO** | Falta escanear o QR do número na tela **WhatsApp** do app |
| Voz automática | **AGUARDA VALIDAÇÃO** | `VOICE_AUTOMATION_ENABLED=false` na Vercel até você validar a voz à mão |
| LinkedIn automático | **AGUARDA DECISÃO** | Código e worker na VPS prontos; não ativar sem decisão explícita (termos de uso) |
| CRM (Argus) | **FORA DE ESCOPO** | Re-deploy do CRM em andamento por você; nada do Prospectra+ depende disso |

---

## 2. O que está NO AR

### 2.1 Prospectra+ (web)

`https://prospectra.argusprime.com.br` — deploy de produção na Vercel. `/api/health` e
`/login` respondem 200. App, login, CRM/leads, importação de leads, cadência assistida,
IA de texto, DISC, campanha multicanal e Helpin nativo estão publicados.

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

---

## 3. O que falta e de quem depende

| # | Item | O que falta | Depende de |
|---|------|-------------|------------|
| 1 | **WhatsApp real** | Parear o número (QR na tela **WhatsApp** do app) e validar envio/recebimento/respostas/encaminhamento | **Você** escaneando o QR |
| 2 | **Voz automática** | Validar a voz à mão e então ligar `VOICE_AUTOMATION_ENABLED=true` na Vercel | **Você** (decisão) |
| 3 | **Agenda (cal.diy)** | Concluir o build em andamento e subir o serviço `prospectra-agenda` em `127.0.0.1:3102` | Build na VPS (em andamento) |
| 4 | **Agendamento de reuniões** | Apontar `MEETING_SCHEDULER_URL` na Vercel para a agenda; o provedor de e-mail (Gmail/Office365/Zimbra) você configura | Agenda no ar |
| 5 | **LinkedIn automático** | Decidir se ativa; provisionar `LINKEDIN_AUTOMATION_ENABLED`, `LINKEDIN_WORKER_URL` e `LINKEDIN_WORKER_KEY`; rodar `infra/linkedin` com `LI_AT` e `PROXY_URL`; revalidar os seletores no site vivo | **Você** (decisão — termos de uso) |
| 6 | **Worker de inteligência** | `INTELLIGENCE_WORKER_ENABLED` não está configurada na Vercel; o executor Python precisa ser validado na VPS | Validação na VPS |
| 7 | **CRM (Argus)** | Nada — fora de escopo nesta fase | **Você** (re-deploy) |
| 8 | **Helpin standalone** | **Não recomendado** — ver riscos | Decisão sua |

---

## 4. Pendências e decisões do dono

1. **`VOICE_AUTOMATION_ENABLED`** — está `false` na Vercel. O serviço está no ar e
   testado, mas a automação (gerar e enviar pelo número do vendedor) só liga depois da
   sua validação à mão. **Não ativar por conta própria.**
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

---

## 5. Riscos conhecidos

| Risco | Detalhe | Mitigação |
|---|---|---|
| **WA-AKG dentro do vhost `argus-crm`** | O *location* `^~ /prospectra-whatsapp/api/` e o `proxy_pass` para `127.0.0.1:3101` vivem em `/etc/nginx/sites-available/argus-crm`. O re-deploy do CRM reescreve esse arquivo | Mover o WA-AKG para um vhost próprio **antes** do re-deploy do CRM |
| **Helpin standalone na mesma VPS** | 8 GiB de RAM mínimo numa VPS de 12 GB, somando voz, gateway, CRM e build da agenda; e duplica o Helpin nativo | Não instalar; manter o Helpin nativo do `main` |
| **Voz: referência de demonstração** | `demo0001.wav` é a voz de demonstração do VoiceStudio, **em inglês**; o profile `70b1a89f` clona esse timbre | Para produção em pt-BR, grave uma referência do locutor e recrie o profile |
| **Voz: custo de CPU** | ~3 min de CPU por take em 2 vCPU | Gerar só na VPS; nunca em Vercel Functions |
| **Voz: patches do motor** | O upstream do `moss-tts-nano` não funciona sem os patches; reinstalar o pacote ou limpar o cache do HF quebra a voz | Ver `docs/voice-studio.md` — backups `.orig`/`.bak` na VPS |
| **Build da agenda** | A VPS está sob carga com o build do cal.diy; qualquer reinício de serviço durante o build joga fora o progresso | Não reiniciar `prospectra-voice`; acompanhar `/var/log/prospectra-agenda-build.log` |

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

# Agenda -> 502 enquanto o serviço não sobe; 200 depois
curl -s -o /dev/null -w '%{http_code}\n' https://agenda.argusprime.com.br/
```

### 6.2 Na VPS

```bash
# serviços
systemctl is-active prospectra-voice        # active
systemctl is-active prospectra-agenda-build  # activating enquanto o build roda
systemctl is-active prospectra-agenda        # inactive agora; active quando o build acabar

# voz
curl -s http://127.0.0.1:3900/health          # {"status":"ok","device":"cpu","version":"0.5.7"}

# gateway WhatsApp (401 = no ar, exigindo chave)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/api/sessions

# agenda (000 = nada escutando ainda)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3102/

# heartbeat
cat /etc/cron.d/prospectra-tick               # */5 * * * * root /usr/local/bin/prospectra-tick

# build da agenda
tail -n 20 /var/log/prospectra-agenda-build.log
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
| `docs/HANDOFF-CODEX.md` | Estado do produto e próximos passos de código |
| `scripts/install-helpin-vps.sh` | Instalador do Helpin standalone — **não recomendado** (ver seção 4) |

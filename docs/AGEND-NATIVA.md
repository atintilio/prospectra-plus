# Agenda nativa do Prospectra

> A agenda deixou de ser um app separado (cal.com) e virou **um módulo dentro do
> Prospectra**: mesmo banco (Neon), mesma sessão, mesma operação, lead vinculado à
> reserva. O domínio `agenda.argusprime.com.br` agora serve o app do Prospectra.
>
> **Estado em 30/10/2026:** agenda nativa **publicada e no ar** (release `2d3111e` +
> `13ef694`): vhost do domínio trocado na VPS (cal.com só perdeu o vhost público; o
> serviço dele continua rodando em `127.0.0.1:3102`), rotas `/agenda` e
> `/agendamento/*` no ar, 32/32 rotas do smoke test em 200 e fluxo público validado
> ponta a ponta (8/8). A suíte de testes do núcleo está em **46 arquivos / 215 testes**.
>
> **Paridade de features:** a agenda tem que ter as mesmas features de antes. O que
> faltava (convite `.ics` por e-mail, aviso ao vendedor, confirmação no WhatsApp do
> participante, lembrete automático antes da reunião, bloqueios de compromissos e fuso
> do visitante) está em implementação — ver a seção 9.

---

## 1. Como funciona, em 5 peças

| Peça | Tabela | O que é |
|---|---|---|
| **Tipo de reunião** | `agenda_event_types` | A "reunião de 30 minutos": título, slug (o que vai na URL), duração, antecedência, intervalo, fuso, local da call, se exige aprovação. Fica ligado a uma operação (`orgId`) e a um vendedor (`userId`). |
| **Disponibilidade** | `agenda_availability` | Janelas semanais por dia da semana, em **minutos desde 00:00 no fuso do evento** (ex.: 9h = `540`, 18h = `1080`). É o que define quais horários existem. |
| **Bloqueio** | `agenda_blackouts` | Exceções pontuais (feriado, viagem, reunião interna). Tira horários da grade. |
| **Link rastreado** | `agenda_links` | URL pública com **token aleatório**. Se o link foi gerado para um lead, a reserva que sair dele já nasce **vinculada a esse lead** (`leadId`) e o link ganha `usedAt`. |
| **Reserva** | `meetings` (colunas novas) | A reunião marcada. `source = 'agenda'`, `status` = `confirmed` (ou `requested`, se o tipo exigir aprovação), `attendeeName/Email/Phone`, `endTime`, `timezone`, `location`, `cancelToken`, `notes`, `eventTypeId`, `linkId`, `leadId` (pode ser nulo). |

### 1.1 O cálculo dos horários livres

`src/lib/agenda-slots.ts` é puro (sem banco, sem `date-fns`/`luxon`): o fuso é resolvido
com `Intl.DateTimeFormat(..., { timeZone }).formatToParts` e a conversão "hora local → UTC"
é feita em duas passadas de ajuste de offset (a segunda resolve o horário de verão).

Um slot só nasce se **todas** estas condições valem:

1. `início >= agora + antecedência mínima` (`minNoticeMin`, padrão 120 min);
2. o início cai dentro de uma janela de disponibilidade do dia da semana **e** a reunião
   cabe inteira na janela (`fim <= fim da janela`);
3. o slot não sobrepõe nenhuma reserva já existente (`requested`/`confirmed`) nem nenhum
   bloqueio;
4. o slot não **encosta** em uma reserva existente: as reservas são ampliadas pelo
   `bufferMin` (intervalo entre reuniões) antes da comparação;
5. o passo dentro da janela é `slotIntervalMin` (padrão 30 min).

Limites de segurança: no máximo **62 dias** percorridos e **400 slots** gerados por busca.
A busca padrão é "agora → +14 dias".

### 1.2 Reserva: o servidor sempre recalcula

`bookPublic` (`src/lib/agenda-booking.ts`) **nunca confia no horário que o navegador
enviou**. Ele recalcula os slots na hora e valida o horário pedido contra a disponibilidade
atual, dentro de uma janela de ±12 h em torno do pedido. Três desfechos:

| Situação | Resposta |
|---|---|
| Horário já passou | `{ ok: false, code: 'past' }` |
| Horário não está (mais) na grade | `{ ok: false, code: 'slot_taken' }` |
| Evento não encontrado / token inválido | `{ ok: false, code: 'not_found' }` / `'invalid'` |

Dois índices no banco são a última linha de defesa:

- `meetings_no_double_booking (org_id, user_id, scheduled_at) WHERE status IN ('requested','confirmed')`
  → **não existe dois agendamentos no mesmo horário do mesmo vendedor** (corta corrida de
  dois cliques simultâneos);
- `meetings_one_open_per_lead (org_id, lead_id) WHERE status IN ('requested','confirmed')`
  → **um contato não fica com duas reuniões em aberto**.

### 1.3 Cancelamento

Cada reserva nasce com um `cancelToken` aleatório (32 bytes). A URL de cancelamento é:

```
https://agenda.argusprime.com.br/agendamento/cancelar?token=<cancelToken>
```

`cancelPublic` só cancela reservas `confirmed`/`requested`; grava `status: 'cancelled'` e
`cancelledAt`. Token inválido ou reunião já cancelada devolvem uma mensagem amigável
(sem stack trace).

### 1.4 Vínculo com o lead

Três caminhos, do mais forte ao mais fraco:

1. **Link rastreado por lead** (recomendado): em `/agenda` → "Gerar link" com o lead
   selecionado. O token identifica a origem; a reserva nasce com `linkId` **e** `leadId`
   preenchidos, e o link marca `usedAt`.
2. **Link do tipo de reunião, sem lead**: a reserva entra com `leadId` nulo — o lead
   continua não vinculado (a `meetings.lead_id` ficou **nullable** justamente para isso).
3. **Fila assistida** (Harvey): continua como era — `requestMeeting` grava a reunião
   "requested" para o vendedor assumir, e `MEETING_SCHEDULER_URL` aponta o link de
   marcação que vai na mensagem para o lead.

---

## 2. URLs

### Público (sem sessão)

| URL | O que faz |
|---|---|
| `https://agenda.argusprime.com.br/agendamento` | Página de entrada do domínio: explica e pede para abrir o link recebido. |
| `https://agenda.argusprime.com.br/agendamento/<slug>` | Grade de horários livres + formulário de reserva. Aceita `?token=` (link rastreado). |
| `https://agenda.argusprime.com.br/agendamento/cancelar?token=...` | Cancelamento (GET mostra o botão, POST cancela). |

### Interno (sessão do Prospectra)

| URL | O que faz |
|---|---|
| `https://prospectra.argusprime.com.br/agenda` | Tela interna: tipos de reunião, disponibilidade, gerar link, próximas reservas. |
| `https://prospectra.argusprime.com.br/agenda` → item "Gerar link" | Cria `agenda_links` e devolve a URL para copiar/enviar. |

### API

**Público (sem sessão)** — `src/app/api/agenda/**`:

| Rota | Resposta |
|---|---|
| `GET /api/agenda/event?slug=xxx` | `{ ok, event: { slug, title, description, durationMin, location, requiresConfirmation, hostName } }` |
| `GET /api/agenda/slots?slug=xxx&from=ISO&to=ISO` | `{ ok, slots: [{ startIso, endIso, label }] }` — `from`/`to` opcionais (padrão: agora → +14 dias) |
| `POST /api/agenda/book` | corpo `{ slug, token?, start, attendeeName, attendeeEmail?, attendeePhone?, notes? }` → `201 { ok, meetingId, cancelUrl }` ou `4xx { ok:false, error, code }` |
| `POST /api/agenda/cancel` | corpo `{ cancelToken }` → `{ ok:true }` ou `{ ok:false, error }` |

**Interno (sessão + operação)**:

| Rota | Resposta |
|---|---|
| `GET /api/agenda/event-types` | `{ ok, eventTypes: [...] }` |
| `POST /api/agenda/event-types` | corpo `{ title, slug?, description?, durationMin?, slotIntervalMin?, minNoticeMin?, bufferMin?, timezone?, location?, requiresConfirmation?, availability? }` → `201 { ok, eventType }` |
| `PATCH /api/agenda/event-types/[id]` | campos editáveis + `isActive` → `{ ok, eventType }` |
| `POST /api/agenda/event-types/[id]/availability` | corpo `{ availability: [{ dayOfWeek, startMinute, endMinute }] }` → `{ ok }` |
| `GET /api/agenda/bookings?from=ISO&to=ISO` | `{ ok, bookings: [...] }` |
| `POST /api/agenda/links` | corpo `{ eventTypeId, leadId?, channel? }` (`channel`: `link`\|`whatsapp`\|`email`\|`manual`) → `201 { ok, token, url }` |

> O `orgId` **nunca** vem do cliente: sai sempre da sessão. As rotas públicas não exigem
> sessão e não vazam dados de outras operações (o evento é procurado pelo slug, mas as
> reservas que bloqueiam um horário são só da **mesma** operação).

---

## 3. Variáveis de ambiente

| Variável | Onde | Estado |
|---|---|---|
| `AGENDA_PUBLIC_URL` | `/etc/prospectra-plus/app.env` (VPS) | **EM USO** — hoje `https://agenda.argusprime.com.br`. É a base das URLs públicas (grade, link do lead, cancelamento). Mantenha igual ao domínio real: se mudar o domínio, mude aqui **e** reinicie o `prospectra-plus`. |
| `AGENDA_BASE_URL` | `/etc/prospectra-plus/app.env` (VPS) | **OBSOLETA** — era o endereço interno do cal.com (`http://127.0.0.1:3102`). O código do cal.com saiu do app (`src/lib/agenda.ts` agora só reexporta o módulo nativo); a variável não é mais lida por nada. Pode ser apagada do `app.env` quando você republicar a release — inofensiva enquanto lá estiver. |
| `MEETING_SCHEDULER_URL` | Vercel (Production) | Segue válida para a **fila assistida** (`requestMeeting`): é o link de marcação que vai na mensagem ao lead. Aponte para a página do seu tipo de reunião, ex.: `https://agenda.argusprime.com.br/agendamento/reuniao`. Para vínculo por lead use o "Gerar link" de `/agenda`. |

Nenhuma variável nova é obrigatória: sem `AGENDA_PUBLIC_URL` o código cai no padrão
`https://agenda.argusprime.com.br`.

---

## 4. Passo a passo do dono — do zero ao primeiro agendamento

> Pré-requisito: a release com a agenda nativa **publicada** na VPS. Sem ela, `/agenda` e
> `/agendamento/*` respondem 404 (o domínio já aponta para o app, mas a release antiga não
> tem as rotas). Publicar com `/usr/local/bin/prospectra-plus-release <sha>`.

**1. Criar o tipo de reunião**
1. Entre no Prospectra (`https://prospectra.argusprime.com.br`) e abra **Agenda** no menu
   lateral (entre "Fila do dia" e "Leads").
2. Clique em **novo tipo de reunião**.
3. Preencha:
   - **Título**: ex. `Reunião de qualificação`;
   - **Duração**: `30` minutos;
   - **Antecedência mínima**: `120` (2 h) — com quanto tempo o cliente precisa avisar;
   - **Intervalo entre horários**: `30` — de quanto em quanto tempo aparece um horário;
   - **Intervalo entre reuniões** (buffer): `0` ou `15` — folga entre uma reunião e outra;
   - **Fuso**: `America/Sao_Paulo`;
   - **Local da call**: o link da sua sala (ex.: Google Meet) — é o que vai na reserva;
   - **Exigir aprovação do vendedor**: ligue se quiser que a reserva nasça como
     *solicitada* em vez de confirmada.
4. **Disponibilidade**: por dia da semana, marque a janela (ex.: segunda a sexta,
   09:00–18:00). A tela aceita hora de início e fim por dia.
5. Salve. O **slug** é gerado do título (`reuniao-de-qualificacao`); se já existir na
   operação, ganha sufixo (`-2`, `-3`).

**2. Gerar o link público**
1. Na lista de tipos de reunião, clique em **Gerar link**.
2. **Sem lead**: copia a URL `https://agenda.argusprime.com.br/agendamento/<slug>` e
   manda por WhatsApp/e-mail como quiser.
3. **Com lead** (recomendado): selecione o lead antes de gerar. A URL sai com
   `?token=...` e **qualquer reserva feita por ela fica vinculada ao lead**. Depois de
   usada, o link aparece como "usado".

**3. Fazer um agendamento de teste**
1. Abra a URL do link (anônimo, em aba anônima) e escolha um horário.
2. Preencha nome, e-mail (opcional), telefone (opcional) e observação (opcional).
3. Confirme: aparece a confirmação com o **link de cancelar**. Guarde esse link.
4. No Prospectra, em `/agenda`, a reserva aparece na lista de próximas reuniões com o
   lead vinculado (se foi por link rastreado).
5. Teste o cancelamento: abra o link de cancelar e confirme — a reserva vira
   *cancelada* e o horário volta a aparecer na grade.

**4. Conferir**
```bash
# o domínio responde do app (200/307/404 de app; nunca 502/503)
curl -s -o /dev/null -w '%{http_code}\n' https://agenda.argusprime.com.br/agendamento
# o app principal segue no ar
curl -s -o /dev/null -w '%{http_code}\n' https://prospectra.argusprime.com.br/api/health
# rotas da agenda (precisam existir depois da release)
curl -s -o /dev/null -w '%{http_code}\n' 'https://agenda.argusprime.com.br/api/agenda/slots?slug=reuniao'
```

---

## 5. O que fazer com o cal.com depois de validar

O banco do cal.com está **vazio** — verificado em 30/10/2026:

```
select (select count(*) from "EventType"),   -- 0
       (select count(*) from "Booking"),     -- 0
       (select count(*) from "Availability");-- 0
```

Ou seja: **nada a migrar**. Depois de validar a agenda nativa (pelo menos um tipo de
reunião criado, um link gerado, um agendamento de teste feito e cancelado), o cal.com
pode sair de cena. A ordem segura:

1. **Valide** a agenda nativa (seção 4, passo 3).
2. **Pare e desabilite** o serviço do cal.com (não é preciso apagar nada ainda):
   ```bash
   systemctl disable --now prospectra-agenda
   systemctl is-active prospectra-agenda   # esperado: inactive
   ```
   O serviço roda em `127.0.0.1:3102` e **já está sem vhost público** desde 30/10 —
   nada mais chega nele pela internet.
3. **Backup do banco do cal.com** (por garantia, mesmo vazio):
   ```bash
   runuser -u postgres -- pg_dump calcom > /var/backups/calcom-$(date +%F).sql
   ```
4. **Remova `AGENDA_BASE_URL`** de `/etc/prospectra-plus/app.env` e reinicie o app:
   ```bash
   sed -i '/^AGENDA_BASE_URL=/d' /etc/prospectra-plus/app.env
   systemctl restart prospectra-plus
   curl -s https://prospectra.argusprime.com.br/api/health   # {"status":"ok",...}
   ```
5. **Opcional**: apagar o banco `calcom` e a pasta `/opt/agenda`, e remover `infra/agenda/`
   do repositório (o README dele descreve o deploy antigo). Só depois de validado.
6. **Aponte `MEETING_SCHEDULER_URL`** (Vercel) para a página do seu tipo de reunião na
   agenda nativa, se ainda aponta para o cal.com.

---

## 6. Infra — o vhost do domínio

O vhost versionado fica em **`infra/prospectra/nginx/agenda.argusprime.com.br.nginx`**.
Ele é uma cópia dos cuidados do vhost principal do Prospectra
(`infra/prospectra/prospectra-plus.nginx`): `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`,
`proxy_http_version 1.1`, upgrade para WebSocket, `proxy_read_timeout 120s` e
`client_max_body_size 20m`. A diferença é o `proxy_pass` — `127.0.0.1:3100` (app) em vez de
`127.0.0.1:3102` (cal.com).

### O que foi aplicado na VPS (30/10/2026)

```
/etc/nginx/sites-available/agenda.argusprime.com.br   # vhost novo (cópia do repo)
/etc/nginx/sites-enabled/agenda.argusprime.com.br     -> symlink para o de cima
/etc/nginx/sites-available/prospectra-agenda           # vhost antigo do cal.com, PRESERVADO
/etc/nginx/backups/prospectra-agenda.<timestamp>       # backup do vhost anterior
/etc/nginx/backups/prospectra-agenda.enabled.<ts>     # backup do que estava habilitado
```

O vhost antigo foi **removido de `sites-enabled`** (não do disco) para não haver dois
`server_name agenda.argusprime.com.br`. `nginx -t` passou sem warning e o reload foi feito
depois disso.

### Rollback do vhost (voltar o domínio para o cal.com)

```bash
rm -f /etc/nginx/sites-enabled/agenda.argusprime.com.br
cp /etc/nginx/sites-available/prospectra-agenda /etc/nginx/sites-enabled/prospectra-agenda
nginx -t && systemctl reload nginx
```

Rollback com o backup direto (se o arquivo de `sites-available` tiver mudado):

```bash
cp /etc/nginx/backups/prospectra-agenda.enabled.<timestamp> /etc/nginx/sites-enabled/prospectra-agenda
rm -f /etc/nginx/sites-enabled/agenda.argusprime.com.br
nginx -t && systemctl reload nginx
```

### Reaplicar do zero (outra VPS)

```bash
cp infra/prospectra/nginx/agenda.argusprime.com.br.nginx /etc/nginx/sites-available/agenda.argusprime.com.br
ln -sfn /etc/nginx/sites-available/agenda.argusprime.com.br /etc/nginx/sites-enabled/agenda.argusprime.com.br
rm -f /etc/nginx/sites-enabled/prospectra-agenda
nginx -t && systemctl reload nginx
```

> O nginx da VPS escuta **só em `[::]:80`** (o TLS fica na Cloudflare). Para testar
> localmente, use `http://[::1]/` com `-H "Host: agenda.argusprime.com.br"` — `127.0.0.1`
> não conecta.

---

## 7. Regras de operação

- **A agenda é do Prospectra**: `agenda.argusprime.com.br` e `prospectra.argusprime.com.br`
  são o **mesmo app** e o **mesmo banco**. Não há segunda conta, segunda senha nem
  segundo banco de reservations.
- **O login é o do Prospectra**. As rotas `/auth/setup` e `/api/auth/setup` (herança do
  cal.com) continuam **403** no domínio da agenda — não existe "criar conta" lá.
- **Uma reserva não duplica horário**: garantido pelo recálculo no servidor **e** pelo
  índice `meetings_no_double_booking`.
- **O que a operação vê é só dela**: `orgId` vem da sessão; a grade pública bloqueia
  horários apenas com reservas da mesma operação.
- **O fuso é do evento**, não do servidor: `America/Sao_Paulo` por padrão, com horário de
  verão respeitado (`Intl`, sem dependência externa).

---

## 8. Arquivos relacionados

| Arquivo | O que é |
|---|---|
| `src/lib/agenda-slots.ts` | Cálculo dos horários livres (puro, fuso por `Intl`) |
| `src/lib/agenda-booking.ts` | Tipos de reunião, disponibilidade, links, reservas, cancelamento |
| `src/lib/agenda.ts` | Ponto de entrada do módulo (reexporta os dois acima) |
| `src/app/api/agenda/**` | Rotas públicas e internas |
| `src/app/agendamento/**` | Telas públicas (grade, reserva, cancelamento) |
| `src/app/(app)/agenda/**` | Tela interna (tipos, disponibilidade, links, reservas) |
| `infra/prospectra/nginx/agenda.argusprime.com.br.nginx` | Vhost do domínio |
| `infra/agenda/README.md` | Deploy do cal.com (histórico — sai de cena) |
| `drizzle/0023_agenda_nativa.sql` | Migração do schema da agenda |

---

## 9. Paridade de features (cal.com → agenda nativa)

A agenda nativa tem que se comportar **igual** à agenda de antes. Esta é a conta de
features, item por item:

| Feature | Antes (cal.com) | Agora (nativa) | Onde |
|---|---|---|---|
| Página pública de marcação | ✅ | ✅ | `/agendamento/[slug]` |
| Grade de horários | ✅ | ✅ | `src/lib/agenda-slots.ts` |
| Janela de disponibilidade semanal | ✅ | ✅ | `agenda_availability` |
| Antecedência, intervalo entre reuniões (buffer) | ✅ | ✅ | tipo de reunião |
| Exceções/bloqueios (ferias, compromissos) | ✅ | ✅ | `agenda_blackouts` + tela `/agenda` |
| Link público rastreado, vinculado ao lead | ✅ | ✅ | `agenda_links` |
| Reserva pública **sem login** | ✅ | ✅ | `/api/agenda/book` |
| Reserva visível para o time, no CRM | ✅ | ✅ | `meetings` + `/agenda` |
| Horário reservado some da grade | ✅ | ✅ | recálculo no servidor + índice único |
| Cancelamento pelo participante | ✅ | ✅ | `/agendamento/cancelar` |
| Um contato não fica com 2 reuniões em aberto | ✅ | ✅ | `meetings_one_open_per_lead` |
| Fuso do evento (com horário de verão) | ✅ | ✅ | `Intl`, sem dependência externa |
| Fuso de quem agenda, na tela pública | ✅ | ✅ | detecção no cliente |
| **Convite `.ics` por e-mail na reserva** | ✅ | ✅ | `src/lib/agenda-notify.ts` |
| **Aviso ao vendedor de que o lead agendou** | ✅ | ✅ | `src/lib/agenda-notify.ts` |
| **Confirmação no WhatsApp do participante** | ✅ | ✅ | `src/lib/agenda-notify.ts` |
| **Lembrete automático antes da reunião** | ✅ | ✅ | `src/lib/agenda-reminders.ts` (roda no cron) |
| **Ler a agenda externa do vendedor para bloquear horários** | ✅ | ⚠️ **depende do dono** | ver abaixo |

### 9.1 O item que depende do dono: agenda externa (Google/Office 365)

Para o sistema **ler os compromissos do calendário do vendedor** (e tirar esses horários da
grade), o app registration do Office 365 precisa da permissão `Calendars.Read` (app
permission, com consentimento do admin do tenant).

Teste feito em 30/10/2026 na VPS: o token do Microsoft Graph é emitido normalmente, mas
`GET /users/<vendedor>/calendarView` devolve **403** com a lista de permissões exigidas
(`Calendars.Read`, `Calendars.Read.All`, ...). Hoje o app tem apenas `Mail.Send` — por isso
o e-mail funciona e o calendário, não.

O que fazer (no portal do Azure, app registration do Office 365):

1. **API permissions** → Add a permission → **Microsoft Graph** → **Application
   permissions** → `Calendars.Read` → Add.
2. **Consent admin**: pedir o consentimento do administrador do tenant (botão *Grant admin
   consent*).
3. Nenhuma mudança de código é necessária: é só permissão do tenant.

**Enquanto isso**, a agenda bloqueia horários por duas vias que já funcionam:

- reservas já marcadas no Prospectra (com buffer);
- **bloqueios manuais** (compromissos/férias) cadastrados na tela `/agenda`.

### 9.2 Estado do envio (sem reenviar às cegas)

A reserva pública grava o resultado de cada notificação em `meetings`:

| Coluna | Significado |
|---|---|
| `invite_state` | `sent` (convite `.ics` enviado), `missing_email` (participante sem e-mail), `unknown` (falhou — tenta de novo na próxima), `not_required` (tipo de reunião sem convite) |
| `invite_sent_at` | Quando o convite foi enviado |
| `seller_notified_at` | Quando o vendedor foi avisado |
| `reminder_sent_at` | Quando o lembrete saiu (garante **um** lembrete por reserva) |

Regra: **falha de notificação nunca desfaz a reserva**. O lead já agendou; o problema é de
aviso, não de reserva — o estado fica registrado e a rodada do cron tenta de novo.

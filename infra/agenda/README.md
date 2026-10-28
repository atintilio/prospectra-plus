# Agendamento (Cal.diy self-hosted) — `agenda.argusprime.com.br`

Deploy do [cal.diy](https://github.com/calcom/cal.diy) na VPS, usando a **imagem Docker pré-pronta**
(sem build pesado). O Prospectra continua dono do fluxo de reunião (registro + convite `.ics` pelo
Office 365); o cal.diy fornece apenas a **página pública de marcação**, cujo link vai em
`MEETING_SCHEDULER_URL` na Vercel.

> ⚠️ O cal.diy é a edição comunitária; os autores recomendam uso não-produção. Para nosso caso
> (link de marcação de um time pequeno) atende bem. Reavalie se precisar de SLA/escala.

## Pré-requisitos
- VPS com **Docker + Docker Compose** e **≥ 2 GB de RAM** (sem build → não precisa dos 6 GB).
- Acesso **SSH funcionando** à VPS (root ou sudo).
- **IPv4 público** da VPS (o cal.diy fica atrás do proxy reverso do host, como o `wa-akg`).
- Um **SMTP** para enviar e-mails (ver seção E-mail).

## 1. DNS
Crie um registro **A** apontando o subdomínio para o IPv4 da VPS:

```
agenda.argusprime.com.br.  A  <IPV4_DA_VPS>
```

Confirme a propagação: `dig +short agenda.argusprime.com.br` deve retornar o IPv4.

## 2. Subir os arquivos para a VPS
Copie esta pasta para a VPS (ex.: `/opt/agenda`):

```bash
scp -r infra/agenda <usuario>@<ipv4>:/opt/agenda
```

## 3. Configurar os segredos
Na VPS, dentro de `/opt/agenda`:

```bash
cp .env.example .env
# Gere e cole os valores:
openssl rand -base64 32   # CALCOM_DB_PASSWORD
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -base64 24   # CALENDSO_ENCRYPTION_KEY (32 bytes)
openssl rand -base64 24   # CALCOM_APP_CREDENTIAL_ENCRYPTION_KEY
chmod 600 .env            # nunca commite este arquivo
```

Preencha também o bloco de e-mail (`EMAIL_SERVER_*`, `EMAIL_FROM`).

## 4. Subir os containers
```bash
docker compose up -d
docker compose logs -f calcom   # acompanhe até "ready"
```

A imagem roda as migrations do Prisma no boot. Se os logs indicarem que não rodaram, force:

```bash
docker compose exec calcom npx prisma migrate deploy --schema=packages/prisma/schema.prisma
```

O app fica em `127.0.0.1:3102` na VPS (ainda sem TLS; é o proxy reverso que expõe publicamente).

## 5. Proxy reverso + TLS
Use o mesmo proxy que já serve os outros serviços da VPS. Exemplos:

**Caddy** (TLS automático) — adicione ao `Caddyfile`:
```
agenda.argusprime.com.br {
    reverse_proxy 127.0.0.1:3102
}
```

**nginx** (com certbot para o TLS):
```nginx
server {
    server_name agenda.argusprime.com.br;
    location / {
        proxy_pass http://127.0.0.1:3102;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
# depois: certbot --nginx -d agenda.argusprime.com.br
```

Abra `https://agenda.argusprime.com.br` — deve carregar a tela inicial do cal.diy.

## 6. Criar o usuário e o tipo de evento
1. Acesse o domínio → **Sign up** e crie o usuário (ex.: `argus`). O link base fica
   `https://agenda.argusprime.com.br/argus`.
2. Confirme o e-mail (por isso o SMTP é obrigatório).
3. Em **Event Types**, crie "Reunião Prospectra" (ex.: 30 min). O link público fica
   `https://agenda.argusprime.com.br/argus/reuniao-prospectra`.

## 7. Ligar no Prospectra (Vercel)
Defina na Vercel (Production) a variável:

```
MEETING_SCHEDULER_URL = https://agenda.argusprime.com.br/argus/reuniao-prospectra
```

(Pode ser a raiz `https://agenda.argusprime.com.br/argus` também.) No próximo deploy o Prospectra
passa a enviar esse link aos leads. Essa parte eu configuro pela Vercel assim que o link existir.

## E-mail (Office 365)
O cal.diy envia por **SMTP**, não pela API Graph. O `OFFICE365_*` do Prospectra é app registration
(Graph `Mail.Send`) e **não serve** aqui. Para o SMTP do Office 365:
- A caixa (`agenda@argusprime.com.br`) precisa de **SMTP AUTH habilitado** no tenant
  (muitos tenants desabilitam por padrão — habilite em Microsoft 365 Admin → Usuários → caixa →
  "Email apps" → Authenticated SMTP).
- Host `smtp.office365.com`, porta `587`, STARTTLS, usuário = e-mail, senha da caixa (ou app password
  se houver MFA).
- Se o SMTP AUTH não puder ser habilitado, use qualquer outro SMTP (SendGrid, Gmail app password, etc.).

## Manutenção
- Atualizar: `docker compose pull && docker compose up -d`
- Backup do banco: `docker compose exec database pg_dump -U calcom calcom > backup-$(date +%F).sql`
- Logs: `docker compose logs -f calcom`

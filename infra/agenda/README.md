# Agendamento (Cal.diy self-hosted) — `agenda.argusprime.com.br`

Deploy do [cal.diy](https://github.com/calcom/cal.diy) na VPS, compilado a partir do ZIP fornecido pelo dono.
A imagem `calcom.docker.scarf.sh/calcom/cal.diy:latest` não está publicada. Esta VPS é LXC e bloqueia a criação de contêineres; nela, use a instalação **nativa** abaixo. O `compose.yaml` serve para uma VM que permita Docker. O Prospectra continua dono do fluxo de reunião (registro + convite `.ics` pelo
Office 365); o cal.diy fornece apenas a **página pública de marcação**, cujo link vai em
`MEETING_SCHEDULER_URL` na Vercel.

> ⚠️ O cal.diy é a edição comunitária; os autores recomendam uso não-produção. Para nosso caso
> (link de marcação de um time pequeno) atende bem. Reavalie se precisar de SLA/escala.

## Pré-requisitos
- VPS com Node.js 22, Corepack, PostgreSQL e memória/espaço para compilar o monorepo. Para usar `compose.yaml` em outra VM, Docker e Compose também são necessários.
- Acesso **SSH funcionando** à VPS (root ou sudo).
- Um endereço público roteado à VPS. O serviço fica atrás do proxy reverso, como o `wa-akg`.
- Um **SMTP** para enviar e-mails (ver seção E-mail).

## 1. DNS
O domínio usa nameservers Cloudflare. Crie o registro para `agenda` somente após confirmar o endereço roteado à VPS. Na instalação atual, o endereço da interface é `2a0c:b641:1a0:800::256` (registro AAAA). O IP `103.102.135.126` é o proxy de SSH do provedor e não deve ser presumido como endereço do site.

```
agenda.argusprime.com.br.  AAAA  2a0c:b641:1a0:800::256
```

Confirme a propagação e o acesso HTTP antes de ativar o proxy Cloudflare.

## 2. Subir os arquivos para a VPS
Copie esta pasta para `/opt/agenda` e extraia o ZIP de `cal.diy` em `/opt/agenda/source`, de modo que `/opt/agenda/source/Dockerfile` exista. Registre o SHA-256 do ZIP utilizado para reproduzir a compilação.
O ZIP fornecido nesta implantação tem SHA-256 `284f651cf407b2407c7e31827cb17c60a5778078aa561cb5669cddc4bdf26758`.

```bash
rsync -a -e 'ssh -p 9229' infra/agenda/ root@vps-905340.ssh.vps1euro.fr:/opt/agenda/
```

## 3. Configurar os segredos e banco
Na VPS, dentro de `/opt/agenda`:

```bash
test -e .env || cp .env.example .env
# Gere e cole os valores:
openssl rand -hex 32      # CALCOM_DB_PASSWORD (seguro dentro da URL do Postgres)
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -base64 24   # CALENDSO_ENCRYPTION_KEY (32 bytes)
openssl rand -base64 24   # CALCOM_APP_CREDENTIAL_ENCRYPTION_KEY
chmod 600 .env            # nunca commite este arquivo
```

Preencha também o bloco de e-mail (`EMAIL_SERVER_*`, `EMAIL_FROM`).
Para instalação nativa, execute `python3 setup_native.py`: ele cria o banco `calcom` no PostgreSQL local e acrescenta `DATABASE_URL`/`DATABASE_DIRECT_URL` ao `.env` sem imprimir segredos. O banco já existia nesta VPS (PostgreSQL 14).

## 4. Compilar e iniciar nesta VPS LXC
```bash
cd /opt/agenda/source
python3 ../run_env.py corepack yarn install --immutable
python3 ../run_env.py corepack yarn workspace @calcom/trpc run build
python3 ../run_env.py corepack yarn --cwd packages/embeds/embed-core workspace @calcom/embed-core run build
python3 ../run_env.py corepack yarn --cwd apps/web workspace @calcom/web run copy-app-store-static
python3 ../run_env.py corepack yarn --cwd apps/web workspace @calcom/web run build
python3 ../run_env.py corepack yarn prisma migrate deploy --schema=packages/prisma/schema.prisma
id prospectra-agenda || useradd --system --home /opt/agenda --shell /usr/sbin/nologin prospectra-agenda
chown -R prospectra-agenda:prospectra-agenda /opt/agenda/source
chmod 755 /opt/agenda
install -m 644 /opt/agenda/prospectra-agenda.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now prospectra-agenda.service
curl -f http://127.0.0.1:3102
```

O serviço deve rodar somente em `127.0.0.1:3102`. Use `journalctl -u prospectra-agenda.service` para diagnóstico.

Em uma VM com contêineres permitidos, a alternativa é:

```bash
docker compose build calcom && docker compose up -d
```

O app fica em `127.0.0.1:3102` na VPS (ainda sem TLS; é o proxy reverso que expõe publicamente).

## 5. Proxy reverso + TLS
Use o nginx existente e configure TLS entre a Cloudflare e a VPS antes de publicar a página. Exemplo de upstream:

**nginx** (com certificado de origem válido):
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
# depois: nginx -t && systemctl reload nginx
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
- Atualizar: substituir o ZIP de origem, conferir o hash, repetir a instalação/build nativo, migração e reiniciar `prospectra-agenda.service`.
- Backup do banco nativo: `runuser -u postgres -- pg_dump calcom > backup-$(date +%F).sql`
- Logs: `journalctl -u prospectra-agenda.service -n 100 --no-pager`

# Como gerar e me entregar as credenciais que faltam

> Objetivo destravar: (1) o app na Cloudflare, (2) a limpeza da Vercel, (3) o LinkedIn real.
> Nada aqui é urgente para o produto — o **Prospectra+ está no ar e funcionando** na VPS.
> são três pontas que dependem de você.

---

## 1. Cloudflare — token que não expira hoje

O que eu uso hoje (device flow) expira em ~1 hora. Para não refazer isso toda hora,
crie um **API Token** pelo painel — ele pode valer **1 ano** ou **sem expiração**.

**Link para criar:** https://dash.cloudflare.com/profile/api-tokens/create

Como criar (30 segundos):

1. **Token name:** `prospectra-mavis`
2. **Permissions** — clique em *Add permission* e escolha:

   | Escopo | Permissão | Para quê |
   |---|---|---|
   | Account | Workers Scripts → **Edit** | publicar o app (deploy) |
   | Account | Workers Tail → **Read** | ler logs do Worker em tempo real |
   | Account | Account Settings → **Read** | ler os dados da conta |
   | Zone (argusprime.com.br) | Workers Routes → **Edit** | apontar o domínio oficial para o Worker |
   | Zone (argusprime.com.br) | DNS → **Edit** | criar/ajustar registros (tunnel, hosts) |
   | Zone (argusprime.com.br) | Zone → **Read** | ler a zona |

3. **Zone Resources:** `Include → Specific zone → argusprime.com.br`
4. **Account Resources:** `Include → Specific account → Argus Prime (60c66733...)`
5. **Client IP Address Filtering:** deixe em **"No IP filtering"**
6. **TTL (Expiration):** escolha **1 year** (ou *None*, se a sua conta permitir sem expiração)
7. **Summary → Create Token**

> ⚠️ Regra do projeto: o token só pode tocar a conta da Cloudflare do Prospectra
> (conta `60c66733d34a8cc5584b44d799b756f4`, zona `argusprime.com.br`).
> Se o painel oferecer a opção "todas as zonas", escolha **especificamente** essa zona.

**Como me entregar:** não cole no chat. Use o cofre de segredos do Mavis
(comando `secret create --name=CLOUDFLARE_API_TOKEN --value=...`) ou salve num arquivo
com permissão 600 e me diga o caminho. Eu apago o arquivo depois de usar.

---

## 2. Vercel — token do projeto do Prospectra

Meu token atual só alcança o projeto `reversa-gov-suite` (Reversa/Gov). Por segurança,
**não** vou usá-lo para mexer no projeto do Prospectra.

**Link para criar:** https://vercel.com/account/tokens

1. **Token name:** `prospectra-mavis`
2. **Scope:** *Your teams* → marque a equipe que contém o projeto **Prospectra**
   (o mesmo onde está o alias `prospectra.argusprime.com.br`)
3. **Expiration:** 1 ano (ou o máximo permitido)
4. **Create Token**

### O que eu faço com esse token (e o que NÃO faço)

| Ação | Projeto | Efeito |
|---|---|---|
| Desabilitar o cron `0 10 * * *` (`/api/cron`) | **só o Prospectra** | para a execução dupla (Vercel + VPS); o tick de 5 min na VPS continua ✅ |
| Remover o alias `prospectra.argusprime.com.br` | **só o Prospectra** | tira a Vercel do caminho do domínio (o DNS já aponta para a VPS/Cloudflare) |

**Nada é feito no projeto `reversa-gov-suite`, no CRM Argus ou em qualquer outro.**
Se eu rodar uma API com o token novo, primeiro leio o nome do projeto na resposta e
aborto se não for o do Prospectra (essa regra está escrita em
`docs/ESCOPO-E-TOCABILIDADE.md`).

Se preferir fazer na mão (2 cliques, sem token):

- Cron: dashboard do projeto → **Settings → Crons** → desmarcar o agendamento `0 10 * * *`
- Alias: **Settings → Domains** → remover `prospectra.argusprime.com.br`

---

## 3. LinkedIn — credencial do aplicativo OIDC

Você vai cadastrar o app no LinkedIn Developers:

**Link:** https://www.linkedin.com/developers/apps

### O que cadastrar

| Campo | Valor |
|---|---|
| Products | **Sign In with LinkedIn using OpenID Connect** |
| Redirect URL | `https://prospectra.argusprime.com.br/api/integrations/linkedin/callback` |
| Application name | `Prospectra+` |

Depois de criar, em **Auth → Redirect URLs**, confirme exatamente a URL acima
(precisa bater caractere a caractere ✅). Em **Auth → Application credentials**, copie
o **Client ID** e o **Client Secret**.

### O que me entregar

| Credencial | Onde eu coloco | Observação |
|---|---|---|
| `LINKEDIN_CLIENT_ID` | `/etc/prospectra-plus/app.env` (VPS) + secret do Worker | público, sem risco |
| `LINKEDIN_CLIENT_SECRET` | `/etc/prospectra-plus/app.env` (600) + secret do Worker | **nunca** no navegador nem no repo |
| `LINKEDIN_REDIRECT_URI` | idem | já tem o valor padrão correto |

Sem isso, a tela `/linkedin` mostra **"Configuração pendente"** (estado correto ✅) e o
app segue funcionando — o que já está no ar.

### O worker de envio (parte 2 do LinkedIn)

Para o **envio real** (convite/mensagem automatizados) ainda falta o worker com a sua
conta: navegador headless + cookie `li_at` + proxy estável, rodando na sua VPS, exposto
apenas para o app (rota `/dispatch`, autenticada). Isso é o **seu** gateway, como está
documentado em `src/lib/linkedin/automation.ts` — o Prospectra não usa nenhum serviço
pago de LinkedIn.

Eu deixo o worker pronto (código + systemd + wiring) assim que você confirmar que
quer essa via. **Importante:** automação de LinkedIn é contra os termos de uso da
plataforma — o risco é da sua conta, e por isso o padrão do produto é **assistido**
(você revisa e approves cada envio).

---

## 4. Ordem sugerida

1. **Cloudflare** (libera o app 100% na Cloudflare) — 2 min
2. **Vercel** (tira a Vercel do caminho) — 2 min
3. **LinkedIn** (cadastro do app) — 5 min, e eu ligo a conexão OIDC na mesma hora

Em qualquer um dos casos: **me avise e eu sigo**. Nada aqui trava o que já está no ar.

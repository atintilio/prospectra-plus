# Escopo do Prospectra+ e regra de não-intervenção

> **Regra dura (vale para qualquer agente, humano ou automation neste projeto):**
> só se toca em recurso que pertence ao **Prospectra+**. Qualquer coisa de outro projeto
> (CRM Argus, Reversa/Gov, site institucional, cal.diy, e-mail, etc.) é **intocável**
> sem autorização explícita do dono, por escrito, no contexto da tarefa.
>
> Se uma ação必需的 estiver fora do escopo: **parar e perguntar**, não improvisar.

---

## 1. O que É do Prospectra+ (escopo ativo)

| Camada | Recurso | Identificador |
|---|---|---|
| App | Aplicação Next.js (monorepo `prospectra-plus`) | `/opt/prospectra-plus`, release `prospectra-plus.service` |
| App | Worker Cloudflare do app | Worker `prospectra` |
| Integração | Bridge do WhatsApp (proxy → WA-AKG) | Worker `prospectra-wa-gateway-bridge` |
| Integração | Gateway WhatsApp (WA-AKG) | `prospectra-wa-akg.service`, `/opt/prospectra-wa-akg`, porta 3101 |
| Integração | Cloudflare Tunnel → WA-AKG | Tunnel `prospectra-wa-gateway`, host `wa.argusprime.com.br` |
| Voz | Voice Studio (MOSS-TTS-Nano) | `prospectra-voice.service`, `/opt/prospectra-voice`, porta 3103 |
| Agenda | Agenda nativa (módulo Next) | `src/app/api/agenda/**`, `src/lib/agenda-*.ts` |
| Dados | Postgres Neon (orgs, leads, campanhas, agenda, helpin, demo) | `DATABASE_URL` / `NEON_DATABASE_URL` |
| DNS | `prospectra`, `agenda`, `wa` (novo), `gw` (novo) | zona `argusprime.com.br` |
| Cron | Tick do Prospectra (5 min) | `/etc/cron.d/prospectra-tick` |
| Git | Linha do Prospectra+ | `release/prospectra-cloudflare-20261101`, `backup/prospectra-plus-2026-10-31` |

## 2. O que NÃO é do Prospectra+ (intocável)

| Recurso | Onde | Por quê |
|---|---|---|
| CRM Argus | `/etc/nginx/sites-enabled/argus-crm`, `/opt/argus-crm`, `crm.zip` | outro produto |
| CRM (DNS/API) | `crm.argusprime.com.br`, `api.crm.argusprime.com.br`, `crm-api.argusprime.com.br` | outro produto |
| Reversa / Gov | `reversa.*`, `gov.reversa.*`, projeto Vercel `reversa-gov-suite`, `reversa-gov-suite.vercel.app` | outro produto |
| Site institucional Argus Prime | apex `argusprime.com.br`, `www`, `parceiros`, `calculadora`, `2sell`, `scraper` | outro produto |
| E-mail / Mailgun | `email.*`, `mail.*`, MX e SPF/DMARC | outro produto |
| Microsoft 365 | `enterpriseenrollment.*`, `enterpriseregistration.*` | terceiro |
| cal.diy self-hosted | `prospectra-agenda.service`, `/opt/agenda` (porta 3102) | **decisão pendente do dono** — desligar só com aval |
| Serviços base do SO | `mariadb`, `postgresql@14-main`, `postfix`, `nginx`, `rsyslog`, `sshd`, `sysstat` | infraestrutura do host |
| Certbot / e2scrub | `/etc/cron.d/certbot`, `e2scrub_all` | host |
| Outros branches/repos | `codex/*`, `claude/*`, `feat/*`, `backup/openclaude-mvp-*` | linhas de outros agentes |

## 3. Regras operacionais

1. **Nunca** deletar, desabilitar, parar ou reconfigurar item da tabela §2.
2. **Antes** de qualquer mudança: rodar o inventário (`systemctl`, `ls /etc/nginx/sites-enabled`, `wrangler`/`dns_records`) e **listar** o que será tocado.
3. Mudança em serviço do Prospectra: **snapshot antes** (`prospectra-plus-release` já faz rollback automático).
4. DNS: só criar/alterar registros `prospectra*`, `agenda*`, `wa*`, `gw*`. Demais registros da zona são de outros produtos.
5. Git: **nunca** force-push em `main`; linhas divergentes vão para `backup/<data>-<linha>`.
6. Worker: um Worker por finalidade; nada de reaproveitar Worker de outro produto.
7. Se a tarefa exigir tocar fora do escopo → **parar e perguntar ao dono**.

## 4. Como auditar (comandos de verificação)

```bash
# systemd
systemctl list-units --type=service --state=running --no-pager

# vhosts
ls /etc/nginx/sites-enabled/

# cron
ls /etc/cron.d/; crontab -l

# projetos na VPS
ls /opt

# Cloudflare (precisa de token com escopo na conta 60c66733d34a8cc5584b44d799b756f4)
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/805c548e0891f14c4fa73d78416ea3d1/dns_records" | jq -r '.result[].name'
```

## 5. Histórico de mudanças de escopo (auditoria)

| Data | Ação | Item | Escopo |
|---|---|---|---|
| 01/11/2026 | Criado | vhost `gw.prospectra.argusprime.com.br` (nginx) | ✅ Prospectra |
| 01/11/2026 | Criado | vhost `whatsapp.prospectra.argusprime.com.br` (nginx) | ✅ Prospectra |
| 01/11/2026 | Criado | DNS `wa.argusprime.com.br` (CNAME → tunnel) | ✅ Prospectra |
| 01/11/2026 | Removido | DNS `wa.prospectra.argusprime.com.br` — **criado por mim 30 min antes** no mesmo ciclo | ✅ Prospectra |
| 01/11/2026 | Criado | Workers `prospectra` e `prospectra-wa-gateway-bridge` | ✅ Prospectra |
| 01/11/2026 | Criado | Tunnel `prospectra-wa-gateway` | ✅ Prospectra |
| 01/11/2026 | Removido | `/opt/cf-build/index.ts` — arquivo órfão copiado por mim no mesmo ciclo | ✅ Prospectra |

**Nada fora do escopo foi alterado, desabilitado ou removido.** Vercel (`reversa-gov-suite`),
CRM, Reversa/Gov, site, e-mail e cal.diy seguem intocados.

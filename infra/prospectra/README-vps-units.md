# Prospectra+ — unidades systemd e scripts da VPS

Tudo o que roda na VPS (França) e **não** estava versionado. Os secrets ficam fora do
repo: cada unit aponta para um `EnvironmentFile` com permissão 600.

## Instalar

```bash
# units
install -m 644 infra/prospectra/systemd/*.service /etc/systemd/system/
install -m 644 infra/prospectra/systemd/*.timer   /etc/systemd/system/
systemctl daemon-reload

# scripts
install -m 755 infra/prospectra/scripts/prospectra-harvey-recovery.py /usr/local/libexec/
install -m 755 infra/prospectra/scripts/prospectra-plus-cron-trigger.py   /usr/local/libexec/
install -m 755 infra/prospectra/scripts/prospectra-tick                   /usr/local/bin/

# cron de 5 minutos (alternativa ao timer)
install -m 644 infra/prospectra/systemd/cron.d-prospectra-tick /etc/cron.d/prospectra-tick
systemctl enable --now prospectra-harvey-recovery.timer
```

## Arquivos

| Arquivo | O que é |
|---|---|
| `systemd/prospectra-plus.service` | App Next.js (systemd `prospectra-plus`, porta 3100) |
| `systemd/prospectra-voice.service` | Voice Studio (uvicorn, porta 3900) |
| `systemd/prospectra-wa-akg.service` | Gateway WhatsApp WA-AKG (porta 3101) |
| `systemd/prospectra-harvey-recovery.service` + `.timer` | Recovery do Harvey a cada hora |
| `systemd/prospectra-plus-cron.service` + `.timer` | Disparo do `/api/cron` (alternativa ao cron.d; **desligado** por padrão) |
| `systemd/cron.d-prospectra-tick` | Cron de 5 min que chama `/api/cron` |
| `scripts/prospectra-harvey-recovery.py` | Batida horária do Harvey |
| `scripts/prospectra-plus-cron-trigger.py` | Batida via localhost (sem Cloudflare) |
| `scripts/prospectra-tick` | Wrapper em bash do cron de 5 min |

## ⚠️ Armadilha: Cloudflare bloqueia o User-Agent do Python

O domínio `prospectra.argusprime.com.br` passa pelo **Cloudflare**, e o User-Agent padrão
do `urllib` (`Python-urllib/3.x`) é **bloqueado com HTTP 403**. A batida do Harvey falha
toda hora com `Harvey recovery failed: HTTP 403` — sem erro de DNS, sem erro de token.

Por isso o `prospectra-harvey-recovery.py` manda o header:

```
User-Agent: Prospectra-Recovery/1.0
```

**Regra**: qualquer script Python que chame o app **pela URL pública** precisa de um
User-Agent próprio. Quem chama `http://127.0.0.1:3100` (loopback) não passa pelo
Cloudflare e não sofre com isso — foi por isso que o `prospectra-plus-cron-trigger.py`
não quebrou.

Diagnóstico rápido:

```bash
python3 -c "
import os,urllib.request,urllib.error
r=urllib.request.Request(os.environ['PUBLIC_APP_URL']+'/api/harvey/tick',
  headers={'Authorization':'Bearer '+os.environ['CRON_SECRET'],
           'User-Agent':'Prospectra-Recovery/1.0'})
print(urllib.request.urlopen(r,timeout=30).status)"
```

## Secrets (fora do repo)

| Arquivo | Contém |
|---|---|
| `/etc/prospectra-plus/app.env` (600) | `DATABASE_URL`, `CRON_SECRET`, chaves de IA, voz, WhatsApp, Office 365 |
| `/etc/prospectra-plus/harvey-worker.env` (600) | `PUBLIC_APP_URL`, `CRON_SECRET` (mesmo valor do app) |
| `/etc/prospectra/cron.env` (600) | `CRON_SECRET` usado pelo cron de 5 min |

> **Atenção**: `CRON_SECRET` precisa ser **igual** em `app.env`, `harvey-worker.env` e
> `cron.env`. Divergência = 403 silencioso no endpoint.

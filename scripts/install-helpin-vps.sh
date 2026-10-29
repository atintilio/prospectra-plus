#!/usr/bin/env bash
# =============================================================================
# Helpin — instalação INTEGRAL em produção na VPS da França (Ubuntu 22.04)
# =============================================================================
# EXECUTAR NA VPS COMO root:   bash install-helpin-vps.sh
#
# Este script é ADITIVO e NÃO destrutivo:
#   - NÃO toca no CRM anterior, no nginx existente, no WA-AKG, no MariaDB,
#     nem no banco Neon do Prospectra+ (que fica na Vercel).
#   - Helpin sobe no seu PRÓPRIO stack Docker, com portas próprias.
#   - Segredos são gerados pelo instalador NA VPS (nada vem no script).
#
# Método: CLI oficial do Helpin (https://helpin.ai/install.sh) + `helpin install`,
# que baixa o bundle verificado e sobe o Docker Compose (postgres/pgvector,
# Temporal, NATS, Redis, workers e apps).
#
# Requisitos oficiais (Community 0.2 beta): Docker Engine + Compose v2, Bash,
# OpenSSL, curl, sha256sum. Mínimo 8 GiB RAM e 20 GiB de disco livre.
# =============================================================================
set -euo pipefail

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mXX %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Rode como root (sudo -i)."

# ---------------------------------------------------------------------------
# 1) Pré-voo: RAM, disco, arquitetura
# ---------------------------------------------------------------------------
say "[1/6] Pré-voo de recursos"
ARCH="$(uname -m)"; echo "arquitetura: $ARCH"
case "$ARCH" in x86_64|amd64|arm64|aarch64) ;; *) die "Arquitetura não suportada pelo Helpin: $ARCH";; esac

MEM_GIB=$(awk '/MemTotal/{printf "%.1f", $2/1024/1024}' /proc/meminfo)
echo "RAM total: ${MEM_GIB} GiB"
awk "BEGIN{exit !($MEM_GIB < 7.5)}" && warn "RAM abaixo de ~7.7 GiB — o Helpin recomenda 8 GB. Confirme o upgrade antes de prosseguir." || echo "RAM ok para avaliação."

DISK_GIB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
echo "disco livre em /: ${DISK_GIB} GiB"
[ "${DISK_GIB:-0}" -ge 20 ] || warn "Menos de 20 GiB livres — o Helpin pede 20 GiB."

for b in curl openssl sha256sum; do command -v "$b" >/dev/null || { say "instalando $b"; apt-get update -y && apt-get install -y curl openssl coreutils; break; }; done

# ---------------------------------------------------------------------------
# 2) Docker Engine + Compose v2 (instala só se faltar; não mexe se já existe)
# ---------------------------------------------------------------------------
say "[2/6] Docker Engine + Compose v2"
if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  echo "Docker + Compose v2 já presentes: $(docker --version)"
else
  warn "Instalando Docker oficial (repo docker.com). Não remove nada existente."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
docker compose version

# ---------------------------------------------------------------------------
# 3) CLI do Helpin (apenas baixa o binário operador; não sobe serviços)
# ---------------------------------------------------------------------------
say "[3/6] Baixando a CLI do Helpin"
export HELPIN_BIN_DIR="/usr/local/bin"
curl -fsSL https://helpin.ai/install.sh | bash
HELPIN="$(command -v helpin || echo /usr/local/bin/helpin)"
[ -x "$HELPIN" ] || HELPIN="$HOME/.local/bin/helpin"
[ -x "$HELPIN" ] || die "CLI do Helpin não encontrada após a instalação."
echo "CLI: $HELPIN"; "$HELPIN" --version 2>/dev/null || true

# ---------------------------------------------------------------------------
# 4) Diagnóstico de pré-requisitos
# ---------------------------------------------------------------------------
say "[4/6] helpin doctor (verifica Docker, RAM, disco, portas)"
"$HELPIN" doctor || warn "O doctor apontou pendências — resolva-as antes do install."

# ---------------------------------------------------------------------------
# 5) Instalação do Helpin (INTERATIVO)
# ---------------------------------------------------------------------------
say "[5/6] helpin install"
cat <<'NOTE'
A CLI vai perguntar: avaliação LOCAL ou SERVIDOR PÚBLICO.
Para produção, escolha SERVIDOR PÚBLICO e informe o hostname, por ex.:
    helpin.argusprime.com.br
Pré-requisito do hostname: um registro DNS A/AAAA (ou CNAME via Cloudflare)
apontando helpin.argusprime.com.br para ESTA VPS, com HTTPS.
A CLI gera os segredos e grava o .env dela (mantenha privado e faça backup
das chaves de criptografia junto com os dados).
NOTE
read -r -p "Rodar 'helpin install' agora? [s/N] " GO
if [ "${GO:-N}" = "s" ] || [ "${GO:-N}" = "S" ]; then
  "$HELPIN" install
else
  warn "Pulei o install. Rode manualmente quando o DNS estiver pronto:  $HELPIN install"
fi

# ---------------------------------------------------------------------------
# 6) Próximos passos (integração com o Prospectra+)
# ---------------------------------------------------------------------------
say "[6/6] Pós-instalação / integração com o Prospectra+"
cat <<'NEXT'
1) Abra o Helpin (porta local http://localhost:8085 em avaliação, ou o
   hostname público). Crie a 1ª conta = admin do servidor; depois é só convite.
2) Settings → libere a ORIGEM do widget:
       https://prospectra.argusprime.com.br
   (o widget recusa visitantes enquanto a lista de origens estiver vazia).
3) Copie o snippet de instalação do suporte e cole no Prospectra+
   (layout do app). Teste: mande uma mensagem de visitante e responda pela
   inbox — ver a resposta no widget confirma o fluxo nos dois sentidos.
4) E-mail/SMTP e IA do Helpin são OPCIONAIS e configurados manualmente por você
   (Settings → AI / System status). Nada de serviço pago obrigatório.

Comandos úteis:  helpin status | helpin doctor | helpin logs
NEXT
say "Concluído o preparo. Nenhum serviço existente foi alterado por este script."

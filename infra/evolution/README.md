# Evolution API para Prospectra+

## Por que não usar a Oracle agora?

A Oracle possui recursos Always Free, mas exige cartão para verificação de identidade. Como você não quer informar cartão, o caminho sem custo recorrente é rodar a Evolution no seu próprio Windows.

**Limitação importante:** o computador precisa ficar ligado e conectado à internet enquanto o WhatsApp estiver em uso. O Prospectra continua hospedado no Vercel; apenas o motor WhatsApp roda localmente.

## Arquitetura sem custo

```text
Prospectra no Vercel
        │ HTTPS
        ▼
Cloudflare Tunnel temporário
        │
        ▼
Evolution API no Docker Desktop do Windows
        ├── PostgreSQL persistente
        ├── Redis persistente
        └── volume de sessões WhatsApp
```

A Evolution API é open source sob Apache 2.0, mas o modo Baileys usa a sessão do WhatsApp Web. Isso não é a API oficial da Meta e pode desconectar ou sofrer restrições. Para produção de maior previsibilidade, a alternativa oficial é a WhatsApp Cloud API.

## 1. Instale no Windows ou macOS

No **macOS**, instale:

1. [Docker Desktop para Mac](https://www.docker.com/products/docker-desktop/)
2. [Homebrew](https://brew.sh/), caso ainda não esteja instalado
3. Execute `brew install cloudflared`

No **Windows**, instale:

1. [Docker Desktop para Windows](https://www.docker.com/products/docker-desktop/)
2. [Cloudflare cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

No Windows, o segundo também pode ser instalado pelo PowerShell:

```powershell
winget install Cloudflare.cloudflared
```

Não é necessário criar uma conta Oracle nem informar cartão para este caminho.

## 2. Baixe os arquivos

Baixe o pacote `Prospectra-Evolution-Desktop.zip` e extraia em uma pasta simples, por exemplo:

```text
C:\Prospectra\evolution
```

No macOS, abra o Terminal nessa pasta. No Windows, abra o PowerShell e permita os scripts apenas para a sessão atual:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## 3. Inicie a Evolution

No macOS:

```bash
chmod +x start-evolution.sh start-tunnel.sh
./start-evolution.sh
```

No Windows:

```powershell
.\start-evolution.ps1
```

Na primeira execução, o script cria `.env` com chaves aleatórias e inicia a Evolution, o PostgreSQL e o Redis. Os dados ficam nos volumes Docker:

- `evolution_instances`: sessão do WhatsApp;
- `evolution_postgres`: estado e mensagens;
- `evolution_redis`: cache e fila.

Não envie o arquivo `.env` para o GitHub ou para o chat.

## 4. Abra a URL pública HTTPS

No macOS, em outra janela do Terminal:

```bash
./start-tunnel.sh
```

No Windows, em outra janela do PowerShell:

```powershell
.\start-tunnel.ps1
```

Copie a URL exibida, parecida com:

```text
https://alguma-coisa.trycloudflare.com
```

Essa URL temporária muda se o túnel for reiniciado. Ela serve para homologação e para colocar o WhatsApp funcionando hoje sem mensalidade. Para uso contínuo, será necessário um túnel nomeado com domínio próprio ou um servidor persistente.

## 5. Configuração no Vercel

No projeto `prospectra`, abra **Settings → Environment Variables → Production** e crie:

```text
EVOLUTION_API_URL=https://alguma-coisa.trycloudflare.com
EVOLUTION_API_KEY=<valor de AUTHENTICATION_API_KEY do .env>
EVOLUTION_INSTANCE=prospectra-argusprime
EVOLUTION_WEBHOOK_SECRET=<valor de PROSPECTRA_WEBHOOK_SECRET do .env>
EVOLUTION_WEBHOOK_URL=https://prospectra.argusprime.com.br/api/integrations/whatsapp/webhook
EVOLUTION_API_HEALTH_PATH=/
```

Os valores sensíveis devem ser colados diretamente no Vercel. Nunca coloque a API key no navegador, no CSV, no repositório ou nesta conversa.

Depois clique em **Redeploy** no Vercel.

## 6. Conecte o WhatsApp

No Prospectra:

1. Entre em **Configurações**.
2. Abra **WhatsApp · Evolution API**.
3. Clique em **Criar/atualizar instância**.
4. Clique em **Gerar QR Code**.
5. No WhatsApp Business, abra **Aparelhos conectados → Conectar aparelho**.
6. Leia o QR Code.
7. Aguarde o health check mostrar **Conectado**.

## 7. Envio protegido

O Prospectra só envia uma mensagem quando todos os itens abaixo são verdadeiros:

- copy aprovada;
- destinatário e canal aprovados;
- evidência válida;
- conta não pausada;
- conta não suprimida;
- telefone internacional válido;
- Evolution respondendo;
- recibo do provider retornado.

O ID retornado pela Evolution aparece na auditoria do Prospectra.

## 8. Comandos úteis

```powershell
# Ver serviços
 docker compose --env-file .env ps

# Ver logs da Evolution
 docker compose --env-file .env logs -f evolution-api

# Parar sem apagar os volumes
 docker compose --env-file .env down

# Reiniciar
 docker compose --env-file .env up -d
```

Não use `docker compose down -v`: esse comando apaga a sessão do WhatsApp, o banco e o Redis.

## Limites da alternativa sem cartão

- o Windows precisa permanecer ligado;
- o túnel temporário possui URL variável;
- reiniciar o túnel exige atualizar `EVOLUTION_API_URL` no Vercel e fazer redeploy;
- o Baileys não é a API oficial da Meta;
- não existe SLA ou backup externo automático;
- faça backup periódico dos volumes Docker.

# Evolution API para Prospectra+

A Evolution API precisa ficar em um serviço persistente com HTTPS público. O Vercel hospeda o Prospectra, mas não deve hospedar o processo WhatsApp/Baileys nem os volumes de sessão.

## 1. Servidor

Use uma VM/VPS ou Docker Desktop para homologação. Aponte `evolution.argusprime.com.br` para o servidor e coloque TLS reverso (Caddy, Nginx ou proxy equivalente) na frente da porta local `8080`.

## 2. Subir

```bash
cp .env.example .env
# substitua CHANGE_ME e defina senhas fortes
mkdir -p /opt/prospectra-evolution
# copie docker-compose.yml e .env para essa pasta
docker compose pull
docker compose up -d
docker compose ps
```

A imagem usada no exemplo é a linha estável `v2.3.7`. Não usar `latest` sem homologar; a série 2.4 introduziu ativação/licenciamento obrigatório.

## 3. Criar a instância

No Prospectra, o Owner abre **Configurações → WhatsApp · Evolution API → Criar/atualizar instância**. A API cria a instância `EVOLUTION_INSTANCE`, registra o webhook e então mostra o QR Code em **Conectar WhatsApp**. O operador lê o QR com o aplicativo WhatsApp Business.

## 4. Variáveis no Vercel

```text
EVOLUTION_API_URL=https://evolution.argusprime.com.br
EVOLUTION_API_KEY=<mesmo valor de AUTHENTICATION_API_KEY>
EVOLUTION_INSTANCE=prospectra-argusprime
EVOLUTION_WEBHOOK_SECRET=<segredo diferente e aleatório>
EVOLUTION_WEBHOOK_URL=https://prospectra.argusprime.com.br/api/integrations/whatsapp/webhook
EVOLUTION_API_HEALTH_PATH=/
```

A chave fica apenas no backend do Prospectra. Nunca colocar a API key no navegador, no CSV ou no repositório.

## 5. Envio

Uma tarefa WhatsApp só pode ser enviada se tiver copy aprovada, contato, número em formato internacional (por exemplo `5511999999999`), evidência e conta não pausada/suprimida. O Prospectra chama `POST /message/sendText/{instance}` com o header `apikey`.

## 6. Eventos

O webhook recebe `CONNECTION_UPDATE`, `QRCODE_UPDATED`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE` e `SEND_MESSAGE`. O endpoint valida `x-prospectra-webhook-secret`. Eventos não autenticados são rejeitados.

## 7. Produção

A conexão Baileys usa WhatsApp Web e pode desconectar ou sofrer bloqueio; para maior previsibilidade, migre posteriormente o adapter para a WhatsApp Cloud API oficial. Faça backup dos volumes, limite o acesso à porta 8080 e monitore reconexão, fila e webhooks.

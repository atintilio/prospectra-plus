# LinkedIn MCP open source na VM

Este serviço substitui Abridge e Unipile na V0. Ele usa o projeto open source `stickerdaniel/linkedin-mcp-server` com Apache-2.0, fixa a imagem `4.26.2` e persiste o perfil autenticado em volume Docker.

## Instalação sem custo de software

Na VM Oracle, com Docker instalado:

```bash
cd /opt/prospectra/infra/linkedin-mcp
openssl passwd -5 'uma-senha-local-forte'
```

Copie o hash retornado para `LINKEDIN_MCP_PASSWORD_HASH` e execute:

```bash
export LINKEDIN_MCP_USER=prospectra
export LINKEDIN_MCP_PASSWORD_HASH='HASH_GERADO'
docker compose up -d
```

O proxy escuta apenas em `127.0.0.1:8787` até ser publicado por um reverse proxy HTTPS já protegido. Não exponha o MCP diretamente na internet: o endpoint não deve ficar público sem autenticação.

Na primeira autenticação, execute o login viewer documentado pelo projeto e confirme manualmente a conta LinkedIn. Depois, publique o proxy em um hostname HTTPS da VM e configure no Vercel:

```env
LINKEDIN_MCP_BASE_URL=https://linkedin-mcp.seu-dominio
LINKEDIN_MCP_API_KEY=            # reservado para proxy compatível
LINKEDIN_MCP_HEALTH_PATH=/health
```

O servidor MCP pode usar `/mcp` para o transporte streamable HTTP. O health check do Prospectra só marca o canal como conectado quando o endpoint responde; login e ações ainda devem ser homologados com uma conta de teste e limites baixos.

## Limites da V0

O projeto é automação de navegador independente, não API oficial do LinkedIn. Ele não cria uma base de celulares pessoais, não garante e-mails pessoais e pode sofrer expiração ou restrição de conta. O Prospectra mantém aprovação, evidência, opt-in e recibo do provedor como pré-requisitos.

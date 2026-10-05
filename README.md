# Prospectra+

Prospectra+ é uma workspace de prospecção B2B orientada por contexto: CRM, pesquisa com evidência, agente, playbooks, automação multicanal, sinais e handoff humano.

## Executar localmente

```bash
pnpm install
pnpm dev
```

A aplicação fica em `http://localhost:3000`. O build de produção é `pnpm build` e os testes são `pnpm test`.

## Automação

O MVP exibe e persiste no navegador o centro de automação com Agent Studio, playbook de quatro etapas, sinais de WhatsApp/LinkedIn, limites diários e status de handoff. O ambiente permanece sinalizado como demonstrativo até que os conectores sejam configurados.

O adaptador prioritário de WhatsApp é a **Evolution API**, executada em serviço persistente separado do Vercel. Configure `WHATSAPP_PROVIDER_BASE_URL`, `WHATSAPP_PROVIDER_API_KEY` e `WHATSAPP_WEBHOOK_SECRET` no servidor. O LinkedIn usa o mesmo contrato provider-neutral com `LINKEDIN_PROVIDER_BASE_URL`, `LINKEDIN_PROVIDER_API_KEY` e `LINKEDIN_WEBHOOK_SECRET`.

Nenhuma credencial vai para o bundle web. O Prospectra registra estados `queued`, `sent`, `delivered`, `read`, `failed` e `unknown`; não converte falha ou estado desconhecido em envio confirmado.

## Limitações deliberadas

As APIs não oficiais de WhatsApp Web e LinkedIn podem ser desconectadas, mudar protocolo ou sofrer bloqueio. A aplicação não armazena cookies nem simula cliques em navegador; espera um provedor externo com endpoint e credencial de servidor. O adaptador fica isolado para permitir troca pela API oficial quando necessário.

Consulte `docs/MULTICHANNEL.md`, `docs/INTEGRATIONS.md` e `server/integrations/channel-contract.ts` antes de configurar o worker externo.

# Prospectra+

Prospectra+ é uma workspace de prospecção B2B orientada por contexto: CRM, pesquisa com evidência, agente, playbooks, automação multicanal, sinais e handoff humano.

## Executar localmente

```bash
pnpm install
pnpm dev
```

A aplicação fica em `http://localhost:3000`. O build de produção é `pnpm build` e os testes são `pnpm test`.

## Automação

### Agente de IA assistido (custo de modelo zero)

Configure `OPENROUTER_API_KEY` somente no ambiente do servidor. O endpoint `/api/ai/assist` usa exclusivamente `openrouter/free`; não aceita seleção de modelos pagos pelo navegador. Na página **Automação** ou **Campanhas**, selecione empresa e contato para gerar insights, uma mensagem de LinkedIn e a próxima ação sugerida. O Prospectra envia ao modelo apenas dados profissionais mínimos e evidências marcadas como verificadas, sem email ou telefone do contato. O texto gerado fica para revisão humana; **Usar como rascunho** invalida a aprovação anterior da campanha. Após a aprovação, **Criar tarefa assistida** registra a próxima etapa na campanha, sem executar envio externo.

O serviço gratuito do OpenRouter tem limites de uso e disponibilidade. Se a chave não estiver configurada, o painel mostra “Chave pendente” e o fluxo assistido manual continua disponível. Não coloque a chave em variáveis `VITE_`, no Git ou no navegador. Uma chave exposta deve ser revogada e substituída antes do uso em produção.

O MVP exibe e persiste no navegador o centro de automação com Agent Studio, playbook de quatro etapas, sinais de WhatsApp/LinkedIn, limites diários e status de handoff. O ambiente permanece sinalizado como demonstrativo até que os conectores sejam configurados.

O adaptador prioritário de WhatsApp é a **Evolution API**, executada em serviço persistente separado do Vercel. Configure `WHATSAPP_PROVIDER_BASE_URL`, `WHATSAPP_PROVIDER_API_KEY` e `WHATSAPP_WEBHOOK_SECRET` no servidor. O LinkedIn usa o mesmo contrato provider-neutral com `LINKEDIN_PROVIDER_BASE_URL`, `LINKEDIN_PROVIDER_API_KEY` e `LINKEDIN_WEBHOOK_SECRET`.

Nenhuma credencial vai para o bundle web. O Prospectra registra estados `queued`, `sent`, `delivered`, `read`, `failed` e `unknown`; não converte falha ou estado desconhecido em envio confirmado.

## Limitações deliberadas

As APIs não oficiais de WhatsApp Web e LinkedIn podem ser desconectadas, mudar protocolo ou sofrer bloqueio. A aplicação não armazena cookies nem simula cliques em navegador; espera um provedor externo com endpoint e credencial de servidor. O adaptador fica isolado para permitir troca pela API oficial quando necessário.

Consulte `docs/MULTICHANNEL.md`, `docs/INTEGRATIONS.md` e `server/integrations/channel-contract.ts` antes de configurar o worker externo.

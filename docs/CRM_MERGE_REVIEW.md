# Comparação — versão candidata do Prospectra

Data: 09/10/2026. Código implementado em cópia isolada; produção não alterada.

| Área | Antes deste incremento | Versão candidata |
|---|---|---|
| Personalização | Campos fixos | Criação de campos de empresa: texto, número e sim/não; edição por conta |
| Enriquecimento | Evidências gerais | Propostas por contato e campo, com URL, evidência, data, aplicação e descarte |
| Aprovação | Controles existentes | Aplicar proposta coloca contato e tarefas abertas em revisão, removendo aprovação anterior |
| Canais | Integrações existentes | Contrato para eventos com deduplicação; resposta pausa conta e tarefas |
| Persistência | Snapshot privado existente | Extensão opcional do mesmo snapshot; IDs e demais dados preservados |
| Equipes | Filtro de contas e oportunidades | Novos valores, propostas e eventos também filtrados pela carteira autorizada |
| Interface | CRM atual | Painel adicional na tela CRM; restante do produto preservado |

## Validação
Build de produção e TypeScript da interface e API aprovados. Suíte ampliada com preservação de estado, cópia independente, duplicidade de IDs, campos tipados, evidências, deduplicação, revisão de aprovação e visibilidade por equipe. Inspeção visual/fluxo completo no navegador ainda pendente.

## Limites desta entrega
Não representa merge integral do Comp AI CRM. Implementação própria inspirada nos modelos examinados, sem copiar o repositório inteiro. Campos de contato/oportunidade disponíveis no núcleo, ainda sem editor visual. Eventos possuem contrato local, sem novos webhooks conectados. Ainda pendentes PostgreSQL conectado, migração real e backup/restauração, agente durável com provedor de IA, campos Brasil na interface e isolamento entre organizações. A extensão continua no armazenamento legado nesta candidata.

## Aplicação
Revisar o patch e a versão candidata. Antes de produção, completar validação visual, conferir autorização das operações no servidor, exportar dados e ensaiar restauração. Não houve push, migração de banco, envio de mensagens ou contratação de serviço.

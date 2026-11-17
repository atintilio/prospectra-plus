# Argus OSINT — operação

## Fluxo

1. Um usuário autorizado seleciona um lead e cria uma investigação.
2. A investigação entra em `enrichment_jobs` com estado `queued`.
3. O worker Argus coleta somente evidências públicas permitidas, normaliza identificadores e preserva conflitos.
4. O resultado recebe estado `completed`, `partial` ou `failed`.
5. Evidências, sinais comerciais, confiança e conflitos ficam associados ao lead.
6. A Inteligência Comercial usa o resumo aprovado como contexto; a IA não pode criar fatos não presentes nas evidências.
7. O administrador master consulta `/admin/argus` e exporta o relatório CSV.

## Estados e confiança

- Job: `queued`, `running`, `completed`, `failed`, `cancelled`.
- Investigação: `completed`, `partial`, `failed`.
- Evidência: `candidate`, `probable`, `confirmed`, `conflict`, `unverified`.

Resultado parcial é válido: indisponibilidade ou limite de uma fonte não apaga resultados anteriores.

## Dados armazenados

O Prospectra armazena apenas identificadores necessários ao enriquecimento, URL da fonte, tipo, trecho/resumo, data da coleta, confiança, sinais comerciais e conflitos. Não armazenar senhas, cookies, tokens de terceiros ou sessões autenticadas de fontes públicas.

## Relatórios master

O administrador master pode ver totais por status e por operação em `/admin/argus` e baixar `/api/admin/argus/report`. O endpoint é protegido por `platformRole=admin` e retorna CSV sem dados de credenciais.

## Falhas e reprocessamento

Jobs falhos devem registrar erro sanitizado. Reprocessamento é limitado e idempotente pelo identificador do job. Uma fonte indisponível não deve provocar reenvio comercial nem alterar o estágio do lead automaticamente.

## Limites

O Argus não envia mensagens, não acessa contas privadas e não substitui revisão humana. A coleta externa só deve ser ativada após configurar e autorizar explicitamente os destinos públicos permitidos.

# Prospectra+ — validação dos conectores da especificação

Verificação em 27/10/2026. O nome do produto é Prospectra+. As sugestões do anexo são requisitos de integração a revisar, não contratos externos comprovados.

## SpiderFoot

O anexo cita módulos e pressupõe endpoints REST que não foram estabelecidos como um contrato estável oficial. O executor deve usar uma interface efetivamente validada na versão instalada, sem simular respostas.

O [CLI oficial](https://github.com/smicallef/spiderfoot/blob/master/sf.py) aceita `-s` (alvo), `-m` (módulos) e `-o json` (saída JSON). O resolver correto é [sfp_dnsresolve](https://github.com/smicallef/spiderfoot/blob/master/modules/sfp_dnsresolve.py), não `sfp_dns`. O módulo [sfp_email](https://github.com/smicallef/spiderfoot/blob/master/modules/sfp_email.py) extrai e-mails de conteúdo produzido por outros módulos; não equivale a descobrir os contatos de pessoas de uma empresa.

A saída JSON contém eventos com `generated`, `type`, `data`, `module`, `source`, conforme o [plugin de saída](https://github.com/smicallef/spiderfoot/blob/master/modules/sfp__stor_stdout.py) e o [evento oficial](https://github.com/smicallef/spiderfoot/blob/master/spiderfoot/event.py). Antes de integrar: verificar módulos disponíveis (`-M`), fixar uma revisão, validar timeout e saída real, preservar origem e separar candidatos de contatos pessoais confirmados. Não anexar um e-mail institucional a uma pessoa por suposição.

## Apollo e Hunter

Apollo documenta `POST https://api.apollo.io/api/v1/people/match`, com header `x-api-key`, e consumo de créditos. O `/v1/matches` sugerido no anexo não é o contrato validado. [Enriquecimento oficial](https://docs.apollo.io/reference/people-enrichment), [autenticação](https://docs.apollo.io/reference/authentication).

Hunter documenta `GET https://api.hunter.io/v2/email-finder`, chave como parâmetro, e consumo de crédito quando um e-mail é encontrado. Nunca registrar a URL com essa chave. [API oficial](https://hunter.io/api-documentation/v2/), [regras da API](https://help.hunter.io/en/articles/1970956-hunter-api).

Ambos permanecem opcionais e **desabilitados**. Uma chave cadastrada não autoriza consumir créditos nem ativar cobrança. Nenhum desses provedores é dependência da análise dos dados já cadastrados no CRM.

## LinkedIn

A autenticação OAuth/OIDC e uma sessão capaz de executar automação de navegação são contratos diferentes. Não reutilizar cookies de uma conta global entre vendedores, nem interpretar login OIDC como autorização ou capacidade para mensagens/convites. A próxima etapa exige sessão individual, controle de execução, fluxo aprovado, revogação e validação real da interface escolhida; o SafetyGuard isolado não implementa esse canal e não garante ausência de bloqueio.

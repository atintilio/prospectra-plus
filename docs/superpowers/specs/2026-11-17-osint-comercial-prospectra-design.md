# OSINT Comercial do Prospectra — desenho

## Intenção

Construir um sistema próprio de inteligência comercial, inspirado nas capacidades úteis do OsintHunter, mas integrado ao Prospectra e orientado a prospecção B2B. O sistema deve investigar tanto a pessoa quanto a empresa, preservar evidências e melhorar a preparação da conversa sem inventar dados.

## Objetivos

- Investigar lead individual, empresa, domínio, e-mail e perfil público.
- Coletar sinais públicos de presença digital, cargo, empresa, tecnologia, conteúdo e momento comercial.
- Relacionar pessoa, empresa, domínio, perfis e fontes em um grafo consultável.
- Registrar origem, data, tipo e confiança de cada achado.
- Produzir um resumo comercial revisável, perguntas de descoberta, riscos e próximos passos.
- Estimar uma tendência DISC explicável e convertê-la em recomendações de tom, ritmo, perguntas, faça e evite.
- Alimentar o score de inteligência do Prospectra e o módulo de Inteligência Comercial.
- Executar pesquisas demoradas em fila própria na VPS, com retries, limites, cache e isolamento por organização.
- Usar a identidade visual existente do Prospectra e o logo oficial da Argus Prime.

## Fora do escopo

- Copiar o OsintHunter ou seus módulos integralmente.
- Investigação criminal, vigilância, doxxing ou coleta de dados privados.
- Login automatizado em redes sociais, bypass de bloqueios ou scraping agressivo.
- Tornar Hunter/Apollo obrigatórios.
- Enviar mensagens automaticamente com base apenas no resultado do OSINT.

## Abordagens consideradas

1. Módulo mínimo dentro do Next.js: simples, mas inadequado para o volume e a abrangência desejados.
2. Worker OSINT próprio integrado ao Prospectra: escolhido, pois suporta pipeline amplo, filas, limites e evolução sem sobrecarregar o servidor web.
3. Clone amplo do OsintHunter: descartado porque copiaria capacidades genéricas e manteria uma arquitetura que não foi desenhada para o contexto comercial do Prospectra.

## Arquitetura proposta

- O Prospectra cria uma solicitação de investigação vinculada a organização, usuário e lead.
- Um worker próprio na VPS executa fases independentes: normalização, descoberta de fontes, coleta pública, correlação, validação, scoring e síntese comercial.
- Cada fase grava estado, tentativas, timestamps e evidências; falhas parciais não apagam resultados já confirmados.
- O resultado fica associado ao lead e à empresa, com snapshot histórico e deduplicação por fonte/identificador.
- A interface mostra progresso, fontes, confiança, conflitos e resumo comercial. O usuário pode confirmar ou descartar achados.
- A IA apenas resume e prioriza evidências existentes; não cria contato, cargo ou fato sem fonte.
- DISC é uma estimativa de comunicação baseada em sinais observáveis, nunca um diagnóstico psicológico.

## Fontes e capacidades

- Dados já existentes no Prospectra.
- Site e domínio público: DNS, certificados, páginas institucionais, contatos publicados, tecnologias e sinais de contratação.
- Busca pública na web e páginas públicas de perfil/conteúdo.
- GitHub e fontes públicas equivalentes quando aplicáveis.
- Hunter/Apollo como conectores opcionais, com orçamento, consentimento de configuração e rotulagem explícita.
- Verificação de e-mail separada de descoberta: candidato, provável, verificado e inconclusivo não podem ser tratados como equivalentes.

## Segurança e limites

- Somente fontes públicas e permitidas pelos termos aplicáveis.
- Sem armazenamento de senhas, cookies ou tokens de terceiros no OSINT.
- Rate limit por fonte, backoff e circuit breaker.
- Segredos apenas no ambiente do worker; nunca em logs ou URLs persistidas.
- Isolamento por organização e autorização server-side em toda leitura/escrita.
- Toda afirmação comercial precisa manter sua fonte e o horário da coleta.

## Integrações do Prospectra

- Leads: entidades, evidências, e-mail candidato/verificado, última investigação e histórico.
- Inteligência Comercial: contexto da empresa/pessoa, evidências usadas, perguntas sugeridas, riscos e handoff humano.
- Campanhas/Go LinkedIn: apenas contexto aprovado para personalização; nenhum envio automático novo será habilitado por esta integração.
- Administração: habilitação por organização, limites, conectores e retenção.
- UI: componentes existentes e logo oficial da Argus Prime, sem ícone genérico novo.

## Critério de sucesso

Uma investigação ampla consegue partir de um lead ou empresa, produzir resultados parciais confiáveis com fontes rastreáveis, enriquecer a preparação comercial e continuar funcionando de forma segura quando uma fonte estiver indisponível, sem afirmar que um dado não confirmado é verdadeiro.

## Decisões ainda abertas

- Catálogo inicial exato de fontes e limites por fonte.
- Retenção e exclusão do histórico OSINT.
- Se o primeiro release inclui interface de grafo visual ou começa com timeline/tabela de evidências.
- Modelo padrão de score e pesos comerciais.

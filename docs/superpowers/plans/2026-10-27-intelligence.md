# Prospectra+ — implementação da inteligência

**Objetivo:** incorporar os módulos da especificação PROSPECTRA-X v1.1 sem renomear o produto nem reescrever o CRM.

**Especificação:** arquivo fornecido pelo proprietário `Qwen_markdown_20261027_l0ks2c5bh.md`, confirmado no chat em 27/10/2026. O título técnico do anexo não é uma autorização para renomear a marca.

## Arquitetura e decisões de integração

- O produto permanece **Prospectra+**. Login, identidade visual, usuários, administração, demo, campanhas e WhatsApp existentes são preservados.
- Next.js/Vercel cria trabalhos leves autenticados; Python executa processamento persistente na VPS. Node não pode importar uma façade Python em processo: o contrato é o banco com trabalhos e resultados identificados por operação e vendedor.
- O banco atual e as tabelas existentes são mantidos. Migrações são aditivas. Não criar outro CRM, apagar o Neon antigo ou substituir `leads` por uma tabela sem isolamento por operação.
- Postgres é a fonte durável de trabalho e status. Redis poderá fornecer cache/eventos, mas publicação efêmera não substitui resultados persistentes nem autoriza perder trabalhos.
- Pontuação inicial é heurística, não probabilidade comprovada de compra. Não gerar contatos, verificação de e-mail ou dados pessoais inexistentes para elevar pontuação.
- `DRY_RUN=true` é o padrão. Simulação usa status próprio e nunca gera evento de envio real. Respostas ambíguas a envio real não permitem repetição automática.
- Não ativar integrações pagas, eliminar recursos ou mover credenciais do usuário para o código. Não capturar cookies automaticamente.

## Etapas testáveis

- [x] Fundação Python: pontuação com fatores explicáveis e SafetyGuard com reserva atômica por operação/vendedor/dia, janela local, aquecimento e interrupção. Nove testes Python passaram; nenhuma ação real foi executada.
- [x] Código e testes locais da integração de análise: tabela de trabalhos aditiva, autorização no servidor, análise de dados existentes por worker Python e exibição de resultados no CRM. A instalação/ativação na VPS ainda está bloqueada.
- [ ] Conectores: verificar contratos oficiais e versões de SpiderFoot e linkedin-api; tratar ausência de credenciais, checkpoints, limites e fontes sem dados. Apollo/Hunter opcionais e desligados por padrão.
- [ ] Orquestração: filas persistentes, resultados por organização, tentativas limitadas e cache separado por conta. Automação externa só com conta vinculada e fluxo aprovado.
- [ ] Eventos/campanhas: mapear funções atuais para contratos; preservar execução assistida até comprovação de envio real, impedir duplicidades e separar simulado/enviado/entregue.
- [ ] VPS: instalar e verificar serviços quando o provedor voltar. Não afirmar implantação durante indisponibilidade SSH/painel.

Para cada etapa: teste que reproduz a falha, implementação mínima, validação e commit no GitHub. Testes locais não confirmam sessão LinkedIn nem envio WhatsApp real.

## Bloqueios observados

Em 27/10/2026 o proxy SSH não respondeu e o painel da VPS retornou Cloudflare 523. Deploy e validação dos processos persistentes dependem do restabelecimento do acesso. GLM 4.7 não é pré-requisito para pontuação determinística e permanece desligado enquanto não houver saldo autorizado.

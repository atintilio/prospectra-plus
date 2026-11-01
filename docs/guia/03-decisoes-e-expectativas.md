# Decisões, regras e o que esperamos um do outro

> Este documento é a **constitution** do Prospectra+. Ele traduz, de forma explícita e
> verificável, o que foi pedido e decidido pelo dono do projeto ao longo das sessões.
> Serve para qualquer pessoa — ou agente — que for mexer no Prospectra+: aqui está o
> combinado, o proibido e o porquê.
>
> Regra de ouro: **se algo aqui não bater com a tarefa, ganha a pergunta — nunca a suposição.**

---

## 1. Quem decide o quê

| Decisão | Quem decide | Como registrar |
|---|---|---|
| Visual, navegação, texto de tela | **dono** | PR/commit com print ou descrição do antes/depois |
| Escopo de produto (o que entra no roadmap) | **dono** | PRD |
| Arquitetura, banco, deploy, infra | **Mavis** (técnico) | doc + commit |
| Alteração fora do Prospectra (CRM, Reversa, site) | **dono, por escrito** | escopo doc atualizado |
| Credenciais de terceiros (LinkedIn, e-mail, proxy) | **dono** | variável de ambiente / secret |

## 2. Decisões já tomadas (histórico — não reabrir sem motivo novo)

### Produto
- **Prospectra+** = CRM de prospecção com IA, LinkedIn, WhatsApp, agenda, voz e suporte (Helpin nativo).
- O **design do Manus** (`e214d844`) foi aprovado e é o visual vigente. O design anterior foi
  **rejeitado pelo dono** e revertido — não voltar atrás sem pedido explícito.
- A **agenda nativa** (módulo do próprio app) substituiu o cal.diy: mesma base, mesma sessão,
  mesma operação. O cal.diy self-hosted fica desligado, sem vhost público.
- **LinkedIn**: OIDC **por usuário** (cada um conecta a própria conta), piloto automático
  **por operação** (gate default desligado), execução por worker na VPS.
- **WhatsApp**: gateway WA-AKG na VPS, sessão fixa por instalação, exposto em
  `/whatsapp-gateway`. Nunca enviar mensagem real sem o dono avisado.
- **Voz**: motor **MOSS-TTS-Nano** (licença comercial). **OmniVoice é não comercial — proibido.**
  `VOICE_AUTOMATION_ENABLED=false` até o dono validar a automação ponta a ponta.
- **IA**: fallback por provedor (`glm-4.7` → `glm-4.7-flash` → `glm-4.5-flash`) e heurística
  que garante conclusão mesmo sem saldo.
- **Demonstração**: ambiente **100% simulado** — sem IA, sem WhatsApp, sem e-mail, sem LinkedIn
  reais no seed. Serve para mostrar a suíte inteira a parceiros.
- **Base demo**: 100 leads fictícios (`docs/base-demo.csv`) para importar e demonstrar.
- **Plataforma**: **Cloudflare** é o caminho (app em Worker, Neon via driver WebSocket);
  a Vercel está fora do caminho de produção. A VPS segue como rollback e hospeda os serviços
  auxiliares (WA-AKG, voz, tunnel).

### Processo
- **Merge commit, nunca squash.**
- **Push direto no `main`**, sem branch/PR — *exceção*: quando o `main` remoto foi sobrescrito
  por outra linha, usar branch dedicada e preservar **todas** as linhas em `backup/<data>-<linha>`.
- Antes de qualquer push: **typecheck + testes verdes**.
- Repositório é público → **varrer o diff por segredos** antes de pushar; nunca imprimir segredo.
- Segredo circula por **arquivo temporário** (VPS → sandbox → API) e é apagado depois.
- Tarefa complexa → **fatiar em subtarefas e despachar em paralelo**, com produtor e verificador.
- Mudança de visual que afeta **todas** as telas → **aval do dono antes**.
- Nada de e-mail/telefone real do dono em validação: usar `@demo.invalid` ou contato descartável.

## 3. O que o dono espera de quem mexe no projeto

1. **Português (pt-BR)**, tom direto, sem textão: primeiro o resultado, depois o detalhe.
2. **"Antes de alterar qualquer coisa, me pergunte."** Verificações somente-leitura podem rodar livre.
3. **Factual sobre o estado**: dizer o que está pronto, o que não está e o que está bloqueado.
   Nunca "deve funcionar" — só "funciona, testei assim".
4. **Entregar funcionando**, com validação de ponta a ponta (sessão real, dados reais).
5. **Documentar como parte do trabalho** — hoje este guia é o padrão.
6. **Nada de improviso fora do escopo**: parar e perguntar (ver `ESCOPO-E-TOCABILIDADE.md`).
7. **Bug éportunity de melhoria**: ao corrigir, deixar o caminho testado.

## 4. O que o dono garante (e o que a Mavis precisa dele)

| Item | Para quê | Status |
|---|---|---|
| Token do Cloudflare (device flow) | deploy do Worker, leitura de logs, corte do domínio | ⏳ a cada ~1 h, gera novo quando precisa |
| Token do Vercel **do projeto Prospectra** | desligar o cron e remover o alias | ⏳ o atual só alcança o Reversa |
| `client_id`/`secret` do app OIDC do LinkedIn | conexão real de conta | ⏳ |
| `li_at` + proxy estável | worker de LinkedIn real | ⏳ |
| Decisão sobre a linha que fica no `main` | destino do GitHub | ⏳ |
| Aval das telas que mudam visual global | design | ⏳ |

## 5. Riscos que nunca aceitamos

- **Enviar mensagem, e-mail ou invite real** para dados do dono ou de terceiros sem aviso prévio.
- **Usar motor de voz/IA sem licença comercial.**
- **Deixar gateway do WhatsApp compartilhado entre operações.**
- **Apagar lead, campanha ou dado do cliente sem pedido explícito.**
- **Forçar push em `main` quando há linhas divergentes.**
- **Deixar segredo em log, output de ferramenta, commit ou screenshot.**

## 6. Glossário rápido

| Termo | Significado |
|---|---|
| **Operação** | Um cliente da plataforma (org no banco). Cada uma liga/desliga recursos. |
| **Gate** | Interruptor por operação: `ai_enabled`, `image_enabled`, `call_enabled`, `linkedin_enabled` (default `false`). |
| **Demo** | Ambiente fictício completo, sem rede, para demonstração a parceiros. |
| **Piloto automático** | Agente que trabalha sozinho no LinkedIn (convites, mensagens, comentários). |
| **Fila do dia** | `/fila` — o que o SDR precisa fazer hoje (com modo assistido). |
| **Runbook** | Passo a passo de operação e incidentes. |
| **Tunnel** | Cloudflare Tunnel: expõe serviço local da VPS por HTTPS sem porta aberta. |
| **Bridge** | Worker fino que encaminha o path do WhatsApp para o gateway na VPS. |

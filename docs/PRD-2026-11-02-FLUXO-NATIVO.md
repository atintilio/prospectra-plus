# PRD — Fluxo nativo de blocos (módulo de fluxos arrastáveis)

> Data: **01/11/2026**. Status: **escopo fechado, aguardando integração** (o preview já
> foi entregue e está em `docs/FALTA-IMPLANTAR.md` §3.1 F1).
>
> Iniciativa pedida pelo dono em 01/11/2026: *"eu quero um fluxo nativo da ferramenta"*,
> com **código do próprio repositório como base** e **sem pagar licença para ninguém**.

---

## 1. Objetivo

Dar ao Prospectra+ um **construtor de fluxos nativo**, onde o vendedor monta a
automatização de uma campanha **arrastando blocos**, e o app **executa** esse fluxo com o
motor que já existe (cadência assistida, IA, WhatsApp, voz, imagem, ligação, LinkedIn).

Não é um canvas livre estilo n8n/Make: é a **mesma ideia de fluxo**, com blocos que se
arrastam, que ficam legíveis e que respeitam as mesmas regras de gate que o resto do
produto.

---

## 2. Escopo fechado (padrão pronto — o dono pode corrigir qualquer linha)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Forma | **Lista vertical de blocos**, com alça de arraste e ponto de inserção entre eles. Sem canvas livre. |
| 2 | Onde vive | Tela nova `/fluxos` (lista) e `/fluxos/[id]` (construtor). Item no menu. **Sem tocar no layout global.** |
| 3 | Persistência | Tabelas novas `flows` e `flow_steps` (com `orgId`, posição e `position` inteiro). |
| 4 | Relação com a campanha | `campaigns.flow_id` (nullable). Campanha **sem** fluxo continua usando `campaigns.steps` como hoje. |
| 5 | Motor | **Nenhum motor novo.** O fluxo é um modelo de cadência; a campanha aponta para ele e o motor existente (`src/lib/cadence.ts`) executa. |
| 6 | Gate | O mesmo gate das campanhas (`orgs.*_enabled`) nas **3 camadas**: paleta, cadência e execução automática. |
| 7 | Quem edita | **Admin e owner** da operação editam; qualquer membro vê e executa. |
| 8 | Custo | **Zero licença.** Só o que já existe: drizzle, Tailwind, `lucide-react`, HTML5 drag & drop nativo. |
| 9 | Fora do escopo agora | Canvas livre, gatilhos/condições, ramificações, modelos compartilhados entre operações (fase 2). |

---

## 3. Requisitos funcionais

- **RF1 — Lista de fluxos.** `/fluxos` mostra os fluxos da operação (nome, status, nº de
  etapas, quem usa) e o botão "Novo fluxo". Operation vazia não mostra dado inventado.
- **RF2 — Construtor.** `/fluxos/[id]` mostra a paleta de blocos, o canvas vertical e o
  painel de configuração. Blocos podem ser **arrastados** para qualquer posição,
  adicionados, duplicados, removidos e configurados.
- **RF3 — Blocos disponíveis.** Reusar os tipos que a cadência já suporta: `react`,
  `comment`, `invite`, `message` (LinkedIn), `email`, `whatsapp`, `voice`, `image`,
  `call`. A paleta só oferece os tipos **liberados na operação**.
- **RF4 — Configuração da etapa.** Nome, espera (dias), condição (`sempre` / `só depois
  que aceitar o convite`), texto base, usar IA, assunto (e-mail) e URL de mídia (imagem).
- **RF5 — Prévia do fluxo.** No topo do construtor, a sequência dos blocos com o dia
  acumulado de cada etapa (mesma lógica da prévia do editor de campanha).
- **RF6 — Gate visível.** Etapa de recurso bloqueado aparece na lista com aviso explícito
  e **não age** na cadência enquanto o recurso estiver desligado. A paleta não oferece o
  bloco travado.
- **RF7 — Vínculo com a campanha.** A tela de campanha pode escolher um fluxo da
  operação; ao vincular, as etapas passam a vir do fluxo (em vez de `campaigns.steps`).
  Desvincular volta ao comportamento atual.
- **RF8 — Execução.** Um lead inscrito numa campanha com fluxo gera as ações da mesma
  forma que hoje — inclusive limites diários, IA por lead, WhatsApp, voz, imagem e
  LinkedIn — porque é o **mesmo motor**.
- **RF9 — Isolamento.** Fluxo de uma operação não aparece, não é editável e não é
  executável em outra operação. `orgId` vem da sessão, nunca do cliente.
- **RF10 — Demo.** A demonstração semeia **um fluxo** (com 4 etapas) e **uma campanha
  ligada a ele**, para o roteiro mostrar o módulo funcionando de ponta a ponta.
- **RF11 — Auditoria.** Criar/editar/vincular fluxo registra evento na trilha da
  operação (`events`), como as outras ações sensíveis.
- **RF12 — Acessibilidade.** Arraste **e** botões de subir/descer (funciona sem
  arraste), foco visível, `aria-label` nos botões com ícone, contraste AA.

---

## 4. Modelo de dados

```sql
-- Um fluxo é um modelo de cadência, por operação.
flows (
  id          uuid pk,
  org_id      uuid -> orgs (cascade),
  name        text not null,
  description text not null default '',
  status      text enum('draft','active','paused') not null default 'draft',
  assigned_to uuid -> users (set null),   -- quem executa
  ai_brief    text not null default '',    -- contexto para a IA
  created_by  uuid -> users (set null),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
)

-- Etapa do fluxo. `position` é a ordem (reordenada pelo arraste).
flow_steps (
  id         uuid pk,
  flow_id    uuid -> flows (cascade),
  org_id     uuid -> orgs (cascade),
  position   integer not null,
  type       text enum('react','comment','invite','message','email','whatsapp','voice','image','call') not null,
  name       text not null default '',
  delay_days integer not null default 0,
  condition  text enum('always','accepted') not null default 'always',
  template   text not null default '',
  use_ai     boolean not null default false,
  subject    text not null default '',
  media_url  text not null default '',
  created_at timestamptz not null default now()
)

-- A campanha aponta para um fluxo (nullable: sem fluxo, usa campaigns.steps como hoje).
campaigns.flow_id uuid -> flows (set null)
```

Índices: `flows(org_id, updated_at)`, `flow_steps(flow_id, position)`,
`flow_steps(org_id)` (para o gate e a execução sem depender do join).

**Por que não guardar o fluxo dentro de `campaigns.steps`:** o `steps` da campanha é
JSONB atrelado à campanha — não dá para reutilizar o mesmo fluxo em duas campanhas nem
em duas operações, que é o objetivo do módulo. Tabelas próprias também deixam a ordem
das etapas **transacional** (reordenar = `UPDATE` de `position`), o que o JSONB não dá.

---

## 5. Gate por operação (as três camadas)

Reaproveita `src/lib/campaign-features.ts` **sem mudar a regra**:

| Camada | O que acontece |
|---|---|
| 1. Editor | A paleta só oferece tipos liberados (`stepTypeEnabled`). |
| 2. Cadência | Etapa ainda não alcançada com recurso desligado é **pulada** (não age, não vira tarefa) — a regra que já existe em `runScheduler`. |
| 3. Execução automática | Envio automático exige gate global **e** gate da operação. |

Etapa **já existente** de recurso desligado continua visível (com aviso), igual hoje no
editor de campanha. A fila assistida mantém a ação já criada.

---

## 6. Execução — sem motor novo

O ponto central do desenho: **fluxo é modelo, campanha é a execução**.

1. `campaigns.flow_id` preenchido → o agendador resolve as etapas do fluxo.
2. O resto é o motor de hoje (`runScheduler`, `completeAction`, `markOutcome`): mesmos
   limites diários, mesma IA por lead, mesmos canais (WhatsApp, voz, imagem, e-mail),
   mesmos eventos, mesma parada quando o lead responde.

Mudança pontual no motor: resolver `steps` por fluxo **antes** do laço, em vez de ler
`camp.steps` diretamente — uma função `resolveSteps(db, camp)`.

**Consequência:** não existe "runner de fluxo" novo, não existe segunda fila, não existe
segundo lugar onde o gate possa ser furado. É o mesmo caminho testado.

---

## 7. Critérios de aceite (verificáveis)

| # | Critério | Como se verifica |
|---|---|---|
| AC1 | `/fluxos` lista só os fluxos da operação da sessão | rota + teste de isolamento |
| AC2 | Criar fluxo grava e abre o construtor | ação + teste |
| AC3 | Arrastar um bloco muda a ordem persistida | teste (ordem no banco) |
| AC4 | Botões de subir/descer fazem o mesmo que o arraste (acessibilidade) | teste + inspeção |
| AC5 | A paleta só oferece tipos liberados na operação | teste com `orgs.linkedin_enabled = false` |
| AC6 | Etapa de recurso bloqueado aparece com aviso e **não age** na cadência | `runScheduler` com gate desligado |
| AC7 | Campanha vinculada ao fluxo executa as etapas do fluxo | inscrição + agendador + fila |
| AC8 | Campanha sem fluxo continua funcionando igual (regressão) | suíte de campanhas/cadência |
| AC9 | Fluxo de outra operação não é editável nem executável | teste de `orgId` |
| AC10 | A prévia mostra a sequência com o dia acumulado | inspeção + teste do cálculo |
| AC11 | Demo tem um fluxo com 4 etapas e uma campanha ligada a ele | seed + rota |
| AC12 | Suíte completa verde + smoke com sessão real nas rotas novas | `vitest` + smoke |
| AC13 | Nada de segredo novo; diff sem segredo | varredura do diff |
| AC14 | Fluxo não altera o layout global nem o menu além do item novo | inspeção do diff |

---

## 8. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| **F1** | Schema (`flows`, `flow_steps`, `campaigns.flow_id`) + migration + lib `src/lib/flows/` (tipos, gate, ordenação) + testes | — |
| **F2** | Telas: `/fluxos` (lista) e `/fluxos/[id]` (construtor com arraste, paleta, config, prévia) | F1 |
| **F3** | Vínculo campanha↔fluxo (tela de campanha + action) e resolução no motor (`resolveSteps`) | F1, F2 |
| **F4** | Seed da demo (fluxo + campanha ligada) e roteiro atualizado | F2, F3 |
| **F5** | Doc: parte do guia, PRD atualizado, fila marcada como feita; release na VPS + smoke | F4 |

F1–F2 podem ser feitos em paralelo com F3-F4 depois que o schema existir.

---

## 9. Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Duas fontes de verdade (etapas na campanha **e** no fluxo) | Média | `campaigns.flow_id` decide: com fluxo, vence o fluxo; sem fluxo, `campaigns.steps`. Sem campo que guarde os dois ao mesmo tempo. |
| Arraste quebrado em celular (HTML5 DnD não existe no touch) | Média | Arraste é **complementar**: os botões de subir/deszer são o caminho garantido; o construtor é testado no navegador de verdade. |
| Gate furado pelo caminho novo | Alta | O fluxo **não** tem executor próprio: passa pelo mesmo `runScheduler`, que já aplica o gate. Teste específico (AC6). |
| Colisão de nome com "fluxo" já usado em outro sentido (fluxo de tela, fluxo do Harvey) | Baixa | Nome da tabela e das rotas: `flows` / `/fluxos`. |
| Escopo crescer para canvas livre | Média | Não-objetivo explícito; fase 2 só com pedido do dono. |

---

## 10. Não-objetivos (fase 2, só com pedido explícito)

- Canvas livre com blocos soltos e conexões.
- Gatilhos e condições além de `sempre` / `após aceite`.
- Ramificação (A/B por resposta).
- Modelo de fluxo compartilhado entre operações (`flow_templates`).
- Fluxo do Helpin (as `automation_rules` já cobrem gatilho→condição→ação do suporte).

---

## 11. Preview (gate de aprovação)

Protótipo navegável entregue em 01/11/2026:
`/workspace/output/fluxo/prospectra-construtor-de-fluxo.html`

- HTML único, sem dependência externa, abre no celular.
- Arraste real (verificado em navegador headless: bloco puxado do topo para a 1ª
  posição), adicionar, duplicar, remover, configurar etapa.
- Gate por operação ao vivo: o interruptor no topo simula a operação com os recursos
  liberados e a paleta/avisos reagem na hora.
- Estado salvo em `localStorage` (protótipo não toca no Prospectra).

**A integração só começa com o aval do dono deste preview.**

---

## 12. Definição de pronto

- [ ] AC1..AC14 verificados
- [ ] `tsc --noEmit` limpo e suíte verde
- [ ] Demo mostra o módulo (fluxo + campanha ligada)
- [ ] Doc atualizada (guia, índice, fila, este PRD)
- [ ] Release na VPS com `health=200 login=200` e smoke das rotas novas
- [ ] Diff sem segredo
- [ ] Preview temporário removido do repositório

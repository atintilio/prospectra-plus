# Fluxos nativos — o construtor arrastável

> Entregue em 02/11/2026 (release `0fe9fd7` + release do módulo de fluxos).
> PRD: `docs/PRD-2026-11-02-FLUXO-NATIVO.md`. Fila: `docs/FALTA-IMPLANTAR.md` §3.1 (F1).

---

## 1. O que é um fluxo

Um **fluxo é o modelo** da cadência: a sequência de blocos que você monta uma vez
(reatagir, comentar, convidar, mandar mensagem, e-mail, WhatsApp, voz, imagem,
ligação) e que pode ser usada em quantas campanhas quiser.

Uma **campanha é a execução**: quem roda, para quem, quando. O motor de cadência
que já existia continua sendo o motor — **não há motor novo**.

| | Onde vive | Quem usa |
|---|---|---|
| Modelo | `flows` + `flow_steps` (tabelas próprias) | a operação, em `/fluxos` |
| Execução | `campaigns` (com `campaigns.flow_id`) | o motor de cadência, em `/campanhas` |

Campanha **sem** fluxo → vale `campaigns.steps`, exatamente como antes.
Campanha **com** fluxo → as etapas vêm do fluxo, ordenadas por `position`.

---

## 2. As telas

### `/fluxos` — a lista

Cards com o nome, a situação (rascunho / ativo / pausado), quantos blocos o
fluxo tem e quantas campanhas o usam. O botão **Novo fluxo** cria um fluxo
rascunho e abre o construtor.

### `/fluxos/[id]` — o construtor

Três colunas (empilhadas no celular):

- **Esquerda — Blocos:** a paleta com os blocos liberados na operação. Clique
  para adicionar ao final da sequência. Os blocos **travados** na operação
  aparecem abaixo, com cadeado, e explicam por quê.
- **Centro — a sequência:** a lista vertical de blocos. Cada bloco mostra o
  ícone, o nome, o **dia acumulado** (soma das esperas), a condição e se usa IA.
  Arraste pelo punho para reordenar; ou use as setas. Há botão de **duplicar**,
  **remover** e **configurar**.
- **Direita — Configurar bloco:** nome, espera em dias, condição (sempre / se
  aceitar), texto, IA, assunto do e-mail e link da mídia.

O botão **Salvar** grava nome, situação e a sequência inteira de uma vez
(transação: apaga as etapas do fluxo e regrava na ordem enviada).

### `/campanhas` — o vínculo

No editor da campanha há o seletor **Fluxo da operação**, com **Vincular fluxo**
e **Desvincular**. Vinculado, a campanha executa as etapas do fluxo;
desvinculado, volta a usar as próprias etapas. A troca é auditada
(`campaign.flow_linked` / `campaign.flow_unlinked`).

---

## 3. Modelo de dados

**`flows`** — o modelo: `org_id`, `name`, `description`, `status`
(`draft`/`active`/`paused`), `assigned_to`, `ai_brief`, `created_by`.

**`flow_steps`** — as etapas: `flow_id`, `org_id`, **`position`** (a ordem),
`type` (o mesmo conjunto da cadência: `react`, `comment`, `invite`, `message`,
`email`, `whatsapp`, `voice`, `image`, `call`), `name`, `delay_days`,
`condition` (`always`/`accepted`), `template`, `use_ai`, `subject`, `media_url`.

**`campaigns.flow_id`** — quando preenchido, a campanha usa as etapas do fluxo.

Migration: `drizzle/0026_fluxos.sql`.

---

## 4. O gate (as mesmas três camadas da campanha)

1. **Construtor:** bloco de recurso desligado na operação não entra na paleta.
   Etapa que **já existe** e ficou travada continua salva (com aviso).
2. **Cadência:** passo ainda não alcançado com recurso desligado é pulado —
   não age, não vira tarefa.
3. **Fila:** ação já criada antes da desativação continua pendente; nada
   automático sai.

O gate é o mesmo das campanhas (`orgs.image_enabled`, `orgs.call_enabled`,
`orgs.linkedin_enabled`, default `false`). Na **demonstração** o gate não prende
a construção — lá nada é enviado de verdade, e a paleta mostra todos os blocos
para a apresentação.

A validação do construtor está isolada em `src/lib/flows/validate.ts` (função
pura, testada sem servidor).

---

## 5. Como o motor executa

`src/lib/flows/resolve.ts` → `resolveSteps(db, campanha)`:

- campanha sem `flow_id` → `campaign.steps` (como sempre);
- campanha com `flow_id` → as etapas do fluxo ordenadas por `position`,
  convertidas para o mesmo formato (`CampaignStep`) que o motor já consome.

O motor (`src/lib/cadence.ts`) só mudou **onde** lê as
etapas. Nenhuma regra de execução mudou.

**Isolamento:** toda leitura exige `org_id` da campanha = `org_id` do fluxo. Fluxo
de outra operação não aparece, não vincula e não executa.

---

## 6. Como usar (passo a passo)

1. **Fluxos → Novo fluxo** → dê um nome.
2. Monte a sequência na coluna do meio: clique nos blocos da paleta, configure
   o texto de cada um, arraste para a ordem que quiser.
3. **Salvar**.
4. **Campanhas → (campanha) → Fluxo da operação → Vincular fluxo**.
5. Inscreva os leads e pronto: a cadência usa as etapas do fluxo.

---

## 7. O que **não** existe (de propósito)

- Canvas livre de nós com conexões: a fase 1 é **lista vertical de blocos**.
- Gatilhos, ramificações, esperas condicionais, múltiplos caminhos.
- Fluxo compartilhado entre operações (F3 da fila) e editor visual do fluxo de
  LinkedIn (F2 da fila).
- Motor de execução novo (não existe e não é preciso).

---

## 8. A demonstração

A demo semeia **dois fluxos** (`src/lib/demo-fluxos.ts`) — "Abertura quente" e
"Parterias · escritórios contábeis" — e **uma das campanhas já usa um deles**,
para a tela mostrar o vínculo pronto. A demo nunca envia nada: o executor de
voz ignora operação de demonstração.

---

**Fontes:** `src/app/(app)/fluxos/**`, `src/lib/flows/**`, `src/app/(app)/campanhas/flows.ts`,
`src/app/(app)/actions.ts` (`setCampaignFlowAction`), `src/lib/cadence.ts`,
`drizzle/0026_fluxos.sql`, `docs/PRD-2026-11-02-FLUXO-NATIVO.md`.

# Parte 7 — Processo de entrega (obrigatório)

> Esta parte existe porque a documentação não pode ser decorativa. Ela define **como uma
> funcionalidade entra no Prospectra+**, quem decide cada coisa e o que precisa estar
> pronto em cada etapa. Se qualquer passo for pulado, a entrega está incompleta —
> independentemente do código estar pronto.

> Regra de ouro: **nada de funcionalidade sem escopo fechado, sem preview aprovado e sem
> documentação.** O dono mandou: *"antes de você integrar ao Prospectra, me mostre."*

---

## 1. O pipeline em uma linha

```
Pedido do dono
   → PRD (RF + AC + fases)
   → item na fila (FALTA-IMPLANTAR §3.1)
   → escopo fechado com PADRÃO PRONTO (proposta da Mavis, não lista de perguntas)
   → PREVIEW (protótipo mostrável, fora do app) → aval do dono
   → implementação em fatias
   → typecheck + suíte verde
   → documentação atualizada
   → release na VPS + validação com sessão real
   → varredura de segredos no diff + push
```

**O que não acontece:** pular o PRD, pular o preview, ou integrar no app sem o aval do dono.

---

## 2. Etapa a etapa

### 2.1 PRD — `docs/PRD-<AAAA-MM-DD>-<TEMA>.md`

O PRD é o contrato da iniciativa. Precisa ter:

- **RF** numerados (requisito funcional) — o que o usuário passa a poder fazer.
- **AC** (critérios de aceite) — **verificáveis**, um por linha, com como se verifica.
- **Riscos** e **não-objetivos** (o que fica de fora e por quê).
- **Fases** (F1, F2…) com dependência e bloqueio externo de cada uma.
- **Marca** quando houver integração externa (cor oficial, símbolo, regra de uso).

Modelo: `docs/PRD-2026-11-01-LINKEDIN.md`.

### 2.2 Fila — `docs/FALTA-IMPLANTAR.md` §3.1

Toda funcionalidade pedida e ainda não pronta entra como **F<n>** na tabela "Fila de
construção", com: situação real hoje, o que falta e o que precisa ser fechado. A fila é
a fonte da verdade do backlog — o `main` do GitHub não é.

### 2.3 Escopo fechado com padrão pronto

O dono **não** responde questionário. A Mavis chega com a decisão já tomada e a
justificativa:

| Tema | Padrão que a Mavis assume (e o porquê) |
|---|---|
| Onde a funcionalidade vive | Tela nova (`/fluxos`) + item no menu, sem tocar no layout global |
| Como o dado persiste | Tabela própria, com `orgId` em tudo e índice por operação |
| Quem pode usar | Admin e owner da operação; membro vê e executa |
| O que o gate faz | Bloqueia por operação nas três camadas (editor, cadência, execução) |
| Custo | **Zero licença**: só o que já existe no repo (drizzle, Tailwind, ícones do `lucide-react`) |
| Fora do escopo | O que não foi pedido explicitamente |

O dono corrige o que quiser mudar. Silêncio + aprovação = vai com o padrão.

### 2.4 Preview antes de integrar (gate de aprovação)

"Mostrar" é um **gate**, não um pedido de print:

- O artefato é **navegável** (HTML que abre no navegador/celular do dono), não uma
  imagem estática.
- Ele fica **fora do app**: nada é mergeado, nenhuma rota nova entra em produção antes
  do aval.
- Exemplo entregue: `/workspace/output/fluxo/prospectra-construtor-de-fluxo.html`
  (construtor de fluxo, com drag & drop nativo e gate por operação reage ao vivo).
- Depois do aval: **um arquivo troca** (a página), o resto é commit, e o protótipo é
  removido do repositório.

### 2.5 Implementação em fatias

- Fatia = **um arquivo ou uma tela**, com produtor e verificador (`team`/`plan run`).
- Nada de fatia que edite o mesmo arquivo que outra fatia está editando.
- Se o produtor travar (sem atividade > 10 min e load 0), a Mavis **assume o trabalho
  como owner** — o código no worktree não se perde.
- Regra do `team`: prompts **autocontidos** (o subagente não tem histórico), sem
  comandos bloqueantes em foreground, `timeout_ms` alto.

### 2.6 Typecheck e suíte verde

```bash
./node_modules/.bin/tsc --noEmit        # no sandbox o pnpm não está no PATH
./node_modules/.bin/vitest run tests/a.test.ts tests/b.test.ts   # em lotes de 9 a 15
```

Suíte inteira verde **antes** de qualquer push. Nenhum "deve funcionar".

### 2.7 Documentação

O que mudou é escrito no mesmo commit (ou no commit seguinte):

| Onde | O que entra |
|---|---|
| `docs/guia/0X-*.md` | A parte correspondente do guia oficial |
| `docs/GUIA.md` | O índice (se entrou uma parte nova) |
| `docs/FALTA-IMPLANTAR.md` | O item da fila passa de "F1" para "FEITO", com evidência |
| `docs/PRD-*.md` | AC atualizado com o que foi realmente entregue |
| `docs/ESCOPO-E-TOCABILIDADE.md` | Se entrou ou saiu algum item do escopo |

### 2.8 Release e validação

```bash
# na VPS
/usr/local/bin/prospectra-plus-release <sha>
```

O script migra, compila, troca o symlink, reinicia e valida `health=200 login=200`;
se a validação falhar, ele **volta para a release anterior**. Depois da release:

- **smoke com sessão real** (não só HTTP 200): as rotas do módulo com sessão de verdade;
- se a funcionalidade manda comunicação real: **usar contato descartável** e avisar antes.

### 2.9 Segredos e push

- Repositório público → **varrer o diff** por segredos antes de pushar:
  ```bash
  git diff --cached | grep -inE "(api[_-]?key|secret|token|password|BEGIN .*PRIVATE KEY)[\"' ]*[:=][\"' ]*[A-Za-z0-9_-]{16,}"
  ```
- Segredo **nunca** em log, output de ferramenta, commit, screenshot ou doc.
- Segredo circula por **arquivo temporário** (VPS → sandbox → API) e é apagado depois.

---

## 3. Quem decide o quê

| Decisão | Quem decide | Onde fica registrada |
|---|---|---|
| Escopo de produto (o que entra) | **dono** | PRD |
| Padrão de escopo dentro do PRD | Mavis propõe, dono corrige | PRD + fila |
| Visual que muda **todas** as telas | **dono** (obrigatório) | PR/commit com antes e depois |
| Visual de **uma tela nova** | Mavis decide dentro do design vigente | commit |
| Arquitetura, banco, deploy, infra | Mavis | doc + commit + `infra/` |
| Ativar recurso por operação | **dono** (em `/admin`) | `orgs.*_enabled` |
| Enviar mensagem/e-mail/invite real | **dono**, avisado antes | — |
| Apagar dado de cliente | **dono**, por escrito | `docs/ESCOPO-E-TOCABILIDADE.md` |

---

## 4. Checklist de entrega (copiar e colar)

**Antes de codar**
- [ ] PRD escrito com RF, AC, riscos e fases
- [ ] Item na fila (`FALTA-IMPLANTAR` §3.1)
- [ ] Escopo fechado com padrão pronto, com o dono ciente
- [ ] Preview entregável e **aprovado**

**Antes de publicar**
- [ ] `tsc --noEmit` limpo
- [ ] Suíte verde (em lotes)
- [ ] Doc atualizada (guia + índice + fila + PRD)
- [ ] Diff sem segredo
- [ ] Release na VPS com `health=200 login=200`
- [ ] Smoke com sessão real nas rotas novas
- [ ] Push na branch correta, sem forçar `main`

**Depois de publicar**
- [ ] Projeção (filtro por operação) sem dado falso
- [ ] Fila atualizada com a evidência do que foi entregue
- [ ] PDF do guia regenerado (`build-doc.mjs`)

---

## 5. O que dá errado (e já aconteceu)

| Erro | Como foi | Regra que existe por causa disso |
|---|---|---|
| Vinte e seis commits e nada do que foi pedido no fim | adiar a lista de perguntas em vez de executar | §2.3 — padrão pronto |
| Protótipo integrado no app sem o dono ver | Entendeu "me mostre" como "me conte" | §2.4 — preview é gate |
| Releases em paralelo na VPS | `pnpm install` colidiu (`ENOENT` em `drizzle-kit/bin.cjs`) | Uma release por vez; retry depois de matar processo órfão |
| Produtor do `team` travou em silêncio | Última tool call > 10 min, load 0 | Assumir o trabalho como owner |
| Doc dizendo "31/31 tabelas" quando era 35 de 46 | Número anotado em dia anterior, sem recontar | §2.8 — recontar antes de afirmar |
| Segredo do tunnel visível no `ps` | Token passado na linha de comando | Token em arquivo `600`, lido pelo serviço |

---

**Fontes:** `docs/guia/03-decisoes-e-expectativas.md` (constitution),
`docs/FALTA-IMPLANTAR.md` §3.1, `docs/PRD-2026-11-01-LINKEDIN.md` (modelo de PRD),
`docs/PRD-2026-11-02-FLUXO-NATIVO.md` (exemplo de PRD com preview antes da integração).

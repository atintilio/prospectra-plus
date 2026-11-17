# Argus OSINT e Editor Visual do Prospectra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Substituir a experiência visual atualmente publicada por uma interface Prospectra/Argus coerente, integrar um OSINT comercial amplo e entregar um editor de fluxos visual no estilo n8n sem copiar o OsintHunter.

**Architecture:** O Prospectra continua sendo o sistema de autenticação, organizações, leads, campanhas e Inteligência Comercial. O Argus OSINT será um worker próprio assíncrono na VPS, com contratos HTTP/DB explícitos, evidências rastreáveis e resultados vinculados a leads/empresas. O editor de campanhas usará um canvas de nós com pan/zoom, conexões, painel de propriedades e persistência no `FlowGraph` existente.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, Drizzle/Postgres, Vitest, worker próprio Python ou Node conforme o serviço escolhido, `@xyflow/react` para o editor visual.

**Spec:** `docs/superpowers/specs/2026-11-17-osint-comercial-prospectra-design.md`

## Global Constraints

- O Argus OSINT deve consultar somente fontes públicas e permitidas.
- Hunter/Apollo são conectores opcionais e não podem ser dependências do fluxo principal.
- Não armazenar senhas, cookies ou tokens de terceiros no OSINT.
- Toda evidência precisa guardar fonte, timestamp, tipo e nível de confiança.
- A IA só resume e prioriza evidências existentes; não inventa fatos ou contatos.
- O DISC é uma estimativa explicável de comunicação, não diagnóstico psicológico.
- Usar o logo oficial da Argus Prime existente em `public/argus-prime-logo.png`.
- Não apagar dados existentes nem romper campanhas lineares legadas.
- Não liberar envio automático novo no LinkedIn como efeito colateral da integração.

## Review Focus

- Lead sem domínio ou sem perfil público: investigação deve terminar como parcial, não como erro fatal. Teste no worker de normalização.
- Fonte indisponível ou rate-limited: resultados anteriores devem permanecer e a execução deve registrar retry/indisponibilidade. Teste no pipeline.
- Evidência conflitante entre pessoa e empresa: mostrar conflito e reduzir confiança, sem escolher silenciosamente. Teste de correlação.
- Organização sem permissão ou recurso Argus desativado: nenhuma leitura ou escrita fora do escopo. Teste server-side das actions.
- Fluxo com loop, nó órfão ou campanha legada: rejeitar o inválido e preservar o fluxo válido anterior. Teste de validação e migração.

### Task 1: Fix the current broken baseline

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `drizzle/meta/_journal.json`
- Create/modify: `drizzle/0009_lead_enrichment.sql`
- Test: `tests/schema-and-enrichment.test.ts`

**Interfaces:**
- Produce `LeadEnrichment` and the `enrichmentJobs` table types used by later Argus tasks.

- [ ] Add a typed `LeadEnrichment` contract with source/evidence/confidence fields and a test for valid/invalid shapes.
- [ ] Complete the migration so schema and migration agree, including indexes and organization/lead ownership constraints.
- [ ] Run `pnpm typecheck` and the focused test; no undefined-type or migration-journal errors remain.

### Task 2: Establish the Argus OSINT domain contract

**Files:**
- Create: `src/lib/argus/types.ts`
- Create: `src/lib/argus/normalize.ts`
- Create: `src/lib/argus/policy.ts`
- Test: `tests/argus-normalize.test.ts`

**Interfaces:**
- `normalizeInvestigationInput(input): InvestigationTarget`
- `assertArgusScope(ctx, target): void`
- `Evidence`, `InvestigationRequest`, `InvestigationResult`, `CommercialSignal`

- [ ] Define target types for lead, person, company, domain, email and public profile.
- [ ] Normalize URLs, domains and e-mails without storing credentials or cookies.
- [ ] Add explicit confidence states: `candidate`, `probable`, `confirmed`, `conflict`, `unverified`.
- [ ] Test malformed input, duplicate identifiers and organization scope.

### Task 3: Build the Argus worker pipeline

**Files:**
- Create: `services/argus/README.md`
- Create: `services/argus/worker.*`
- Create: `services/argus/sources/*`
- Create: `services/argus/correlation.*`
- Create: `services/argus/scoring.*`
- Test: `services/argus/tests/*`

**Interfaces:**
- `runInvestigation(request): Promise<InvestigationResult>`
- Source adapters return `Evidence[]`; they never write directly to Prospectra tables.

- [ ] Implement public-domain/site discovery, public search, public company/person pages, DNS/certificate checks and optional public GitHub checks.
- [ ] Add source adapters behind a common interface with per-source timeout, rate limit, retry and circuit-breaker behavior.
- [ ] Correlate person/company/domain/profile findings and preserve conflicts instead of overwriting.
- [ ] Compute a confidence and commercial-signal result only from collected evidence.
- [ ] Add a queue consumer that updates job state transactionally and supports retry after partial failure.
- [ ] Test source failure, retry, partial success, deduplication, conflict and idempotent reprocessing.

### Task 4: Integrate Argus with Prospectra and Inteligência Comercial

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/intelligence/jobs.ts`
- Create: `src/lib/argus/actions.ts`
- Create/modify: `src/app/(app)/inteligencia/argus-panel.tsx`
- Modify: `src/app/(app)/inteligencia/page.tsx`
- Modify: `src/app/(app)/inteligencia/view.tsx`
- Test: `tests/argus-actions.test.ts`, `tests/intelligence-argus.test.ts`

**Interfaces:**
- `queueArgusInvestigation(input): Promise<{ id: string }>`
- `getArgusInvestigation(id): Promise<InvestigationResultView>`
- `generateCommercial` consumes an evidence summary, never raw untrusted instructions.

- [ ] Add server-side actions enforcing user, organization, active account, feature flag and lead ownership.
- [ ] Store investigations, evidence snapshots and commercial signals with retention-safe indexes.
- [ ] Add an Argus panel showing progress, evidence, sources, confidence, conflicts and refresh history.
- [ ] Pass approved evidence into commercial intelligence and label every claim with its source.
- [ ] Add tests proving cross-organization access is rejected and missing/partial results remain usable.
- [ ] Add deterministic DISC estimation from observable lead/evidence signals, showing confidence, recommendations, questions and avoid-list with an explicit disclaimer.

### Task 5: Replace the campaign editor with a real visual flow builder

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Replace: `src/app/(app)/campanhas/flow-editor.tsx`
- Create: `src/app/(app)/campanhas/flow-canvas.tsx`
- Create: `src/app/(app)/campanhas/node-palette.tsx`
- Create: `src/app/(app)/campanhas/node-inspector.tsx`
- Modify: `src/lib/flow.ts`
- Modify: `src/app/(app)/actions.ts`
- Test: `tests/flow.test.ts`, `tests/flow-editor-model.test.ts`

**Interfaces:**
- Keep `FlowGraph`, `FlowNode`, `FlowEdge`, `graphOf`, `validateGraph` compatible with existing campaign execution.
- Add typed node metadata for trigger, action, wait, condition, Argus insight and human approval.

- [ ] Add `@xyflow/react` only for the visual canvas; keep domain validation in `src/lib/flow.ts`.
- [ ] Implement pan, zoom, minimap, grid, selectable nodes, connectable handles, edge labels and keyboard deletion.
- [ ] Implement a left palette, central canvas and right inspector with the official Argus/Prospectra visual language.
- [ ] Add Argus insight and approval nodes without changing the existing LinkedIn execution semantics.
- [ ] Convert legacy linear steps to the new graph and round-trip valid graphs without data loss.
- [ ] Test loop rejection, orphan detection, node limits, legacy conversion and save validation.

### Task 6: Preserve Prospectra identity and clarify Argus Prime positioning

**Files:**
- Modify only where the positioning is shown: `src/app/(auth)/login/page.tsx`, `src/app/(app)/layout.tsx`, Argus/flow surfaces and supporting copy.
- Preserve: `src/components/logo.tsx`, Prospectra colors, typography, navigation and existing brand system.
- Use: `public/argus-prime-logo.png` only as an official partner/solution mark where appropriate.
- Test: `tests/brand-and-navigation.test.ts`

**Interfaces:**
- Any Argus Prime mark uses the official image asset and accessible alt text; it must not replace the Prospectra brand.

- [ ] Preserve the Prospectra visual identity and correct only the broken/ugly presentation currently published.
- [ ] Describe Argus as “uma solução Argus Prime” in the relevant surfaces, using the official Argus Prime logo only as a partner/solution attribution.
- [ ] Preserve all existing routes and responsive behavior while making the flow builder the visual centerpiece.
- [ ] Test logo asset resolution, navigation labels, mobile layout invariants and reduced-motion behavior.

### Task 7: End-to-end verification and staged deployment

**Files:**
- Modify: `docs/DEPLOY-VPS.md`
- Create: `docs/ARGUS-OSINT-OPERATIONS.md`
- Test: full test suite, production build, health checks and browser smoke checks.

- [ ] Run `pnpm typecheck`, focused Argus/flow tests, then `pnpm test`.
- [ ] Run `pnpm build` against a safe database target and verify migration ordering.
- [ ] Deploy a new release without changing `/opt/prospectra-plus-current` until smoke checks pass.
- [ ] Verify `/login`, `/ambiente`, `/inteligencia`, `/campanhas/nova`, Argus investigation creation and flow save in the browser.
- [ ] Switch the current symlink only after health and smoke checks pass; retain the previous release for rollback.

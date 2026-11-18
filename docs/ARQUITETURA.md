# Prospectra+ — Arquitetura e estado (o que conecta com o quê)

Atualizado em 18/11/2026. Legenda: ✅ pronto e testado · 🟡 pronto mas depende de serviço externo/validação · 🔴 ainda não existe.

## Mapa de módulos e conexões

```mermaid
flowchart TB
  subgraph Cliente["Navegador (vendedor / admin)"]
    UI["App Next.js (App Router)"]
  end

  subgraph App["Prospectra+ (Next.js) — VPS"]
    AUTH["Auth / sessão / papéis ✅"]
    LEADS["Leads (import CSV/URL, CRUD) ✅"]
    CAMP["Campanhas + fluxo visual ✅"]
    FILA["Fila do dia + scheduler ✅"]
    HARVEY["Harvey / Inteligência comercial ✅"]
    DISC["DISC contextual (GLM) ✅"]
    ARGUS["Argus OSINT (fila + painel) 🟡"]
    AGENDA["Agenda + .ics ✅"]
    HELPIN["Helpin (inbox interno) 🟡"]
    WA["WhatsApp (envio 1-a-1) 🟡"]
    VOICE["Voice Studio 🟡"]
    ADMIN["Administração / parceiros ✅"]
    PAINEL["Painel / KPIs ✅"]
    CRON["/api/cron ✅"]
    DISPATCH["/api/dispatch (laço do worker) ✅"]
    DB[("Postgres / Drizzle ✅")]
  end

  subgraph Ext["Serviços externos"]
    GLM["GLM 5.3 (Z.AI) / OpenRouter"]
    O365["Office 365 (Graph) e-mail"]
    AKG["WA-AKG gateway WhatsApp"]
    VOICEENG["Motor de voz privado 🔴 (fora do repo)"]
    GO["Worker Go (LinkedIn/Playwright) 🔴 falta /acoes + eventos"]
  end

  UI --> AUTH & LEADS & CAMP & FILA & HARVEY & AGENDA & HELPIN & WA & ADMIN & PAINEL
  LEADS --> CAMP --> FILA
  FILA --> DB
  CAMP -. conta conectada .-> GO
  HARVEY --> DISC --> GLM
  HARVEY --> GLM
  HARVEY -. contexto .-> ARGUS
  ARGUS --> GLM
  AGENDA --> O365
  AUTH --> O365
  WA --> AKG
  VOICE --> VOICEENG
  VOICE --> AKG

  CRON -->|scheduler| FILA
  CRON -->|GO_ENABLED| GO
  GO -->|"webhook: sent/accepted/replied/checkpoint"| DISPATCH
  DISPATCH -->|avança cadência| FILA
  App --- DB
```

## Jornada ponta a ponta (estado atual)

```mermaid
sequenceDiagram
  participant V as Vendedor
  participant P as Prospectra+
  participant H as Harvey+DISC (GLM)
  participant C as Cron/Scheduler
  participant G as Worker Go (LinkedIn)
  V->>P: Seleciona lead
  P->>H: Investiga + recomenda abordagem (DISC contextual)
  Note over H: ✅ pronto (precisa da chave GLM)
  H-->>V: Rascunho + perfil DISC (revisão obrigatória) ✅
  V->>P: Aprova / ativa campanha
  C->>C: Gera ações da cadência ✅
  C->>G: Entrega ação (GO_ENABLED) ✅ lado Prospectra
  Note over G: 🔴 falta POST /acoes no worker Go
  G-->>P: webhook sent/accepted/replied → /api/dispatch ✅ lado Prospectra
  P->>C: Próximo passo automático ✅
  V->>P: Admin consulta resultado (Painel) ✅
```

## O elo que falta para o automático

- **Lado Prospectra: pronto e testado.** `pushDueActionsToGo` (entrega) + `/api/dispatch` (recebe `sent`/`accepted`/`replied`/`meeting`/`checkpoint`).
- **Lado worker Go: a construir.** Precisa expor `POST /acoes` (ação por-lead) e chamar de volta os eventos. Contrato em `docs/GO-INTEGRACAO.md`.
- **Infra:** VPS no ar + Redis + Playwright; `GO_*`, `DISPATCH_SECRET`, chave GLM e `OFFICE365_*` no `.env`.

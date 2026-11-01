# Guia do Prospectra+ — documentação oficial

> Este é o guia de manutenção e evolução do Prospectra+. A partir de 01/11/2026 ele
> passa a ser a referência do projeto: quem for mexer no Prospectra+ (pessoa ou agente)
> começa por aqui.
>
> **Escopo do projeto:** o Prospectra+ é o CRM de prospecção com IA, LinkedIn, WhatsApp,
> agenda, voz e suporte. **Não é** o CRM Argus, **não é** a Reversa/Gov e **não é** o site
> institucional — esses são intocáveis (ver [Escopo e não-intervenção](ESCOPO-E-TOCABILIDADE.md)).

## Índice

| Parte | O que você encontra | Quando abrir |
|---|---|---|
| [1 · Produto, módulos e rotas](guia/01-produto-modulos-rotas.md) | O produto em uma página, o roteiro de **todas** as telas (dados + gate de cada uma), o mapa de APIs e os módulos de domínio | "onde fica o código que faz X?" |
| [2 · Dados, ambiente, deploy e operação](guia/02-dados-ambiente-deploy-operacao.md) | Tabelas por domínio, variáveis de ambiente (onde moram), fluxo de release (com rollback), serviços da VPS, **runbook de incidentes** e checklist | "como deployo? o que faço quando cai?" |
| [3 · Decisões e o que esperamos um do outro](guia/03-decisoes-e-expectativas.md) | As decisões do dono, o que ele espera de quem mexe no projeto, o que ele garante, os riscos que nunca aceitamos | "posso fazer isso? o que o dono quer?" |
| [4 · Marca oficial do LinkedIn](guia/04-marca-linkedin.md) | Cor, símbolo, regras de uso, onde a marca aparece e checklist de conformidade | "como uso o logo do LinkedIn?" |

## Documentos do mesmo tipo

| Documento | Assunto |
|---|---|
| [PRD · LinkedIn](../PRD-2026-11-01-LINKEDIN.md) | Do piloto simulado à automação real: requisitos, fases, critérios de aceite, riscos |
| [Escopo e não-intervenção](../ESCOPO-E-TOCABILIDADE.md) | O que é do Prospectra, o que é intocável, regras operacionais e auditoria |
| [Falta implantar](../FALTA-IMPLANTAR.md) | Estado de cada item implantado, pendente e bloqueado |
| [Agenda nativa](../AGEND-NATIVA.md) | Módulo de agenda: eventos, disponibilidade, reserva, lembretes |
| [Demonstração](../DEMO.md) | Roteiro de apresentação da demo (o que falar em cada tela) |

## Os 5 minutos para quem nunca mexeu aqui

1. **Stack:** Next.js 16 (App Router) + drizzle-orm + Postgres (Neon) + Tailwind.
   Serviços auxiliares na VPS: WA-AKG (WhatsApp) e Voice Studio (MOSS-TTS-Nano).
   Plataforma alvo: Cloudflare Worker (OpenNext) + Neon via driver WebSocket.
2. **Uma operação = um cliente.** Tudo é filtrado por `orgId`; o `orgId` **nunca** vem do cliente.
3. **Recursos são ativados por operação** (`orgs.*_enabled`, default `false`): IA, imagem,
   ligação, LinkedIn. Quem liga é o admin em `/admin`.
4. **Demonstração é simulada por definição:** nenhum dado real, nenhuma chamada de rede no seed.
5. **Antes de mexer:** leia a [Parte 3](guia/03-decisoes-e-expectativas.md) e o
   [escopo](../ESCOPO-E-TOCABILIDADE.md). Depois rode `pnpm exec tsc --noEmit` e `pnpm test`.

# Prospectra 2.0

Prospecção assistida no LinkedIn para parceiros Argus Prime: busca com IA, cadências com mensagens personalizadas, Fila do dia e painel por parceiro e equipe.

Reconstruído do zero (Replica: recon da Prospectme → arquitetura → design LeadFlow + logo azul/roxo).

## Stack
Next.js 16 · React 19 · Tailwind 4 · Postgres (Neon) + Drizzle · login próprio (sessão em cookie httpOnly, senha scrypt) · e-mails pelo Office 365 (Microsoft Graph) · IA via OpenRouter (Qwen).

## Variáveis
Veja `.env.example`. Obrigatórias: `DATABASE_URL`, `PUBLIC_APP_URL`, `MASTER_USER_EMAIL`, `OFFICE365_*`. Opcional: `OPENROUTER_API_KEY`, `AI_MODEL`, `CRON_SECRET`.

## Primeiro acesso
O e-mail em `MASTER_USER_EMAIL` usa "Esqueci minha senha": o sistema cria o admin master e o parceiro "Argus Prime" e envia o link pelo Office 365.

## Desenvolvimento
```bash
pnpm install
DATABASE_URL=pglite://./.data/dev npx tsx scripts/seed-local.ts   # banco local com exemplos
DATABASE_URL=pglite://./.data/dev pnpm dev                        # login: teste@local / senha-de-teste-123
pnpm test                                                         # motor da cadência, isolamento e importação
```

## Como funciona a cadência (modo assistido)
O scheduler transforma inscrições vencidas em ações na Fila do dia de quem executa a campanha (roda ao abrir Painel/Fila e diariamente via `/api/cron`). O usuário abre o LinkedIn com o texto copiado, envia e marca "Feito". Aceite libera passos "só depois que aceitar"; resposta, reunião ou venda encerram a cadência do lead. Nada é enviado automaticamente ao LinkedIn.

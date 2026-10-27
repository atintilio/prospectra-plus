# Plano de execução — Prospectra+ (Leads + Campanhas + Fila)

**Objetivo:** Deploy na VPS francesa focado apenas no controle de leads e flows de campanhas.  
**CRM existente:** FORA do escopo por enquanto.  
**WhatsApp / Voice Studio:** FORA do escopo por enquanto.

## Validações locais (concluídas)

| Validação | Resultado |
|-----------|-----------|
| `pnpm install` (sem `@vercel/blob`) | OK |
| `tsc --noEmit` | Limpo |
| 57 testes TypeScript | ✅ 57/57 passando |
| `next build` | OK — 19 rotas |
| `build:voice-worker` | Não necessário (voz excluída deste escopo) |

## Arquivos alterados para este escopo

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/legacy.ts` | `@vercel/blob` → leitura de arquivo local |
| `scripts/migrate.mjs` | `@vercel/blob` → leitura de arquivo local |
| `package.json` / `pnpm-lock.yaml` | `@vercel/blob` removido |
| `vercel.json` | Removido |
| `docs/DEPLOY-VPS.md` | Guia de deploy na VPS |
| `docs/ESCOPO-LEADS-CAMPANHAS.md` | Escopo focado (este documento) |
| `ecosystem.config.js` | PM2 para `next start` |
| `docs/crontab-exemplo.txt` | Crontab substituto do Vercel Cron |

## Próximos passos (quando houver acesso SSH à VPS)

1. Conectar na VPS-905340 (senha: 3Xiuy4oK — aguardando proxy SSH ou IPv4)
2. Upload do código para `/opt/prospectra-plus/`
3. Criar `.env` com `chmod 600` (apenas variáveis deste escopo)
4. `pnpm install && pnpm run build`
5. `pm2 start ecosystem.config.js && pm2 save`
6. Configurar crontab para `/api/cron`
7. Verificar: `pm2 list` e `curl https://crm.argusprime.com.br/api/health`

## Bloqueio

Sem acesso SSH à VPS. Proxy IPv4 inativo, sem IPv4 alocado, IPv6 sem rota. Ticket #578 aberto no suporte VPS1Euro.

# Plano de execução — Caminho A (Prospectra+ Next.js / Vercel)

**Objetivo:** colocar o incremento de voz em produção, seguindo a ordem do `CONTINUAR.md`.

## Pré-requisitos concluídos localmente (este pacote)

| Item | Status |
|------|--------|
| Extração e conferência SHA-256 do ZIP | ✅ |
| `pnpm install --frozen-lockfile` | ✅ |
| 57 testes TypeScript | ✅ passaram |
| `tsc --noEmit` | ✅ limpo |
| `next build` (produção) | ✅ passou |
| `build:voice-worker` | ✅ `.dist/voice-worker.cjs` gerado |
| Revisão independente do incremento de voz | ✅ `docs/REVISAO-INDEPENDENTE-VOZ.md` |
| Baseline Git local | ✅ 2 commits, árvore limpa |

## Ordem de execução (conforme CONTINUAR.md)

### Fase 1 — GitHub (requer acesso do proprietário)

1. **Integrar PR #27 ao `main` primeiro.** Main atual `710ccc7` ainda não tem a fundação de inteligência. A branch de voz depende do código do PR #27.
2. **Criar PR da branch `feat/voicestudio-audio` sobre `main` já contendo PR #27.**
3. **Gravar o incremento validado** com pendências e instruções de continuidade (não descrever teste simulado como função real concluída).

### Fase 2 — Vercel (bloqueado: HTTP 403 nesta sessão)

1. Obter acesso à equipe `atintilio-5084` / `team_FtOe2aGUEBCClp33AUX3fjb2`, projeto `prospectra` (novo link de autorização temporário via `authorize_team_access`; não reutilizar link expirado).
2. Adicionar segredos server-only a partir dos arquivos privados da VPS:
   - `WA_AKG_BASE_URL`, `WA_AKG_API_KEY`
   - `VOICESTUDIO_BASE_URL`, `VOICESTUDIO_API_KEY`, `VOICESTUDIO_ENGINE`
   - **Não substituir nem apagar variáveis existentes.**
3. Fazer deploy e abrir a tela WhatsApp de produção.

### Fase 3 — VPS da França (acesso root; credenciais em `/etc/prospectra-*`, não no pacote)

1. **Antes de repetir instalação:** consultar processos e serviços na VPS (a interrupção do agente não garante que processo remoto de instalação tenha sido encerrado).
2. Verificar se a instalação Voice Studio terminou: ambiente, dependências, serviço, saúde/OpenAPI/perfis — sem imprimir arquivos `.env`.
3. Validar motor compatível com português, uso comercial e capacidade da VPS (MOSS-TTS-Nano candidato; **não** ativar OmniVoice padrão — pesos não comerciais).
4. Criar `EnvironmentFile` privado do systemd com `/etc/prospectra-voice/integration.env` e `/etc/prospectra-wa-akg/integration.env`; reinício automático; limites de recursos do gerador.
5. Expor somente rotas necessárias do Voice Studio; nunca `/calls`, configurações, histórico ou administração.

### Fase 4 — Ativação de produção (somente após validação real)

1. André faz pareamento do WhatsApp na tela de produção.
2. Validar envio real autorizado, cadastro de voz, geração em português e envio Ogg/Opus.
3. Somente então habilitar `VOICE_AUTOMATION_ENABLED=true` e iniciar o worker persistente na VPS.

### Fase 5 — Próxima fase (não agora)

- Desenhar transporte de chamadas e transferência ao vendedor. Voz sintética, envio de áudio e chamada VoIP são funções diferentes; não marcar chamadas como concluídas sem mídia real.

## O que não fazer (regras permanentes)

- Não usar Twilio, Unipile, APIs pagas obrigatórias nem novas assinaturas.
- Não descrever teste simulado como função real concluída.
- Não ativar `VOICE_AUTOMATION_ENABLED=true` antes de envio real autorizado validado.
- Não apagar banco Neon, CRM anterior ou outros serviços sem decisão concreta do proprietário.
- Não compartilhar sessão WhatsApp/LinkedIn ou perfil de voz entre vendedores.
- Não sobrescrever código mais recente com snapshot antigo de `historico/`.

## Bloqueios atuais (fora do meu alcance sem credenciais)

| Bloqueio | Detalhe |
|----------|---------|
| GitHub | Consulta anônima retorna 404; não consigo criar PR nem integrar PR #27 |
| Vercel | HTTP 403 para a equipe; acesso pendente via link de autorização temporário |
| VPS | Credenciais root e `.env` não estão no pacote; acesso não fornecido nesta sessão |

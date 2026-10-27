# Revisão independente — incremento de voz do Prospectra+

**Objeto:** branch `feat/voicestudio-audio`, commit `291f93e` (base `feat/prospectra-intelligence` `a8ef029`, que já inclui a fundação de inteligência do PR #27).  
**Revisor:** revisão estática do snapshot local do pacote `ProspectraPlus-Codigo-Completo-20261027.zip`.  
**Validações do snapshot:** 57 testes TypeScript OK, `tsc --noEmit` limpo, `next build` de produção OK, `pnpm run build:voice-worker` gerou `.dist/voice-worker.cjs` (510 KB).  
**Limite da revisão:** análise de código local. Não houve acesso ao GitHub, nem à VPS, nem à Vercel. Não comprova instalação do modelo, pareamento real do WhatsApp nem envio em produção.

---

## 1. Escopo revisado

Arquivos do incremento de voz:

- `src/lib/voice/voicestudio.ts` — cliente privado do Voice Studio (perfil, geração WAV, recuperação Ogg/Opus).
- `src/lib/voice/delivery.ts` — autorização, perfil, registro diário, fila de jobs, execução de entrega.
- `scripts/voice-worker.ts` — executor persistente, uma mensagem por vez, sem porta pública.
- `src/lib/whatsapp/akg.ts` — gateway WA-AKG (status, QR, conectar, desvincular, envio de texto e áudio).
- `src/lib/whatsapp/commands.ts` — recibo persistente, idempotência, limite diário serializado.
- `src/app/(app)/whatsapp/voice-actions.ts` — ações de servidor (cadastro, fila, revogação).
- `src/app/(app)/whatsapp/voice-view.tsx` — painel de voz na página WhatsApp.
- `src/app/(app)/whatsapp/page.tsx` — montagem do painel (desabilitado por padrão).
- `src/db/schema.ts` — tabelas `voice_profiles`, `voice_registrations`, `voice_jobs`.
- `drizzle/0005_intelligence_jobs.sql`, `drizzle/0006_voice.sql` — migrações aditivas.
- `tests/voice-studio.test.ts`, `tests/voice-delivery.test.ts` — contratos com respostas simuladas.

---

## 2. Constatações positivas (segurança e contrato)

| Item | Observação |
|------|------------|
| Configuração de voz | `voiceConfig()` exige `VOICESTUDIO_BASE_URL`, `VOICESTUDIO_API_KEY` e `VOICESTUDIO_ENGINE`; ausente → UI desabilitada e worker não inicia. |
| URL do backend | Apenas HTTPS, ou HTTP somente em localhost; sem usuário/senha/query/hash no caminho; prefixo de caminho restrito; nunca expõe o dashboard do estúdio ao navegador. |
| Autenticação upstream | `Authorization: Bearer <chave exata>` em cada chamada; validação de cabeçalho de resposta, não apenas presença. |
| Validação de entrada | Consentimento obrigatório (`consent === true`); referência 1–3 MB com MIME permitido; transcrição 1–4000 chars; texto da mensagem 1–2000 chars; `profileId` de 8 hex. |
| Detecção de geração parcial | WAV deve começar por `RIFF`; `X-Audio-Id` de 8 hex; `Content-Type: audio/wav`; `X-OmniVoice-Dropped-Chunks` deve ser `0` ou ausente. Ogg/Opus validado por magic bytes `OggS` + `OpusHead`. Áudio inválido ou parcial é recusado e a mídia não é buscada. |
| Idioma | Geração restrita a `Portuguese`; nenhum texto livre além do autorizado pelo vendedor. |
| Modelo não comercial | Código não ativa o OmniVoice padrão por conta própria; a escolha do motor vem de `VOICESTUDIO_ENGINE` configurada no servidor. |
| Isolamento | Perfil e job vinculados a `orgId` + `userId`; consulta do worker filia job à operação/vendedor; outro vendedor não executa o job. |
| Consentimento | `saveVoiceProfile` exige `consent === true`; revogação (`enabled = false`) bloqueia futuras entregas; troca de perfil invalida job em execução (`executeVoiceDelivery` revalida perfil antes de enviar). |
| Limite de cadastro | Máximo 5 tentagens de registro por vendedor/dia UTC (`claimVoiceRegistration`), aplicado no servidor antes de qualquer upload. |
| Limite de envio | Compartilha o pool diário do vendedor (`dailyMessages`, teto 100), serializado por transação com `FOR UPDATE`. |
| Recebimento durável | `voiceJobs` persistido antes de contatar o WhatsApp; estado `queued` → `sent` apenas com `providerMessageId` do gateway. |
| Sem reenvio cego | Estado `unknown` (falha ou processo perdido) nunca é reenviado automaticamente pelo worker. |
| Chamadas de voz | `kind === 'call'` resulta em `waiting_transport`; não há geração de áudio, não há chamada VoIP, não há marcação de conclusão sem mídia real. |
| Execução no servidor | `server-only` nos módulos de voz; worker é um executável CJS (`esbuild`, `--platform=node`) rodando na VPS, nunca em função Vercel. |
| UI | `VoicePanel` desabilitada enquanto faltarem serviço, motor e executor validados (`VOICE_AUTOMATION_ENABLED === true` exigido). |
| Demo | Organizações de demonstração não conectam números nem enviam mensagens reais. |

---

## 3. Pontos de atenção (não bloqueantes para o código, relevantes para operação)

1. **Falha do worker:** exceções em `executeVoiceDelivery` marcam o job como `failed` e seguem para o próximo, sem retry automático e sem alerta operacional além de `console.error`. Aceitável pela regra "não reenviar automaticamente", mas sem visibilidade de ops para retry manual.
2. **Tentativa de registro consumida mesmo se o Voice Studio falhar:** `claimVoiceRegistration` é executado antes da chamada upstream; se o cadastro upstream falhar, a tentativa ainda conta nos 5/dia. Isso é intencional (limite de tentativas), mas o usuário não distingue "erro do serviço" de "erro de gravação" — a mensagem de erro é genérica.
3. **Pool compartilhado:** mensagens de voz consomem o mesmo limite diário de mensagens do WhatsApp do vendedor; não há contador separado de voz.
4. **Sem coluna de tentativas em `voice_jobs`:** jobs `failed` não são retomados automaticamente; retomada exige intervenção manual (consistente com as regras do proprietário).
5. **Testes simulados:** `tests/voice-*` usam `fetch` mockado. Não equivalem a modelo instalado, pareamento real ou envio de produção (conforme as próprias validações concluídas do pacote).
6. **Revisão independente ainda não aprovada por terceiros:** este documento é a primeira revisão escrita do incremento; o plano de continuidade lista ainda a conclusão de uma revisão independente antes da integração final.

---

## 4. Veredito

O incremento de voz está **code-complete e validado localmente**: testes, typecheck, build de produção e bundle do executor passam. Não implementa Harvey autônomo, não inicia campanhas espontaneamente, não faz chamadas VoIP e não envia mensagens sem confirmação do gateway.

**Não representa entrada em produção por si só.** A ativação depende de itens operacionais fora deste snapshot (seção 5).

---

## 5. Checklist de entrada em produção (pendentes, por responsável)

**André / proprietário:**
- [ ] Conceder GO explícito para ativação de voz na produção (atenção: especificação consolidada separada `PROSPECTRA_PLUS.md` v1.3 descreve uma arquitetura Python/Docker distinta e declara "Nenhuma linha de código será escrita sem o GO explícito do Andre" — confirmar qual produto recebe codificação).
- [ ] Parear o WhatsApp real na tela de produção após o deploy (apenas conta do vendedor/operador; nenhuma sessão compartilhada).
- [ ] Validar envio real autorizado, cadastro de voz, geração em português e envio Ogg/Opus antes de aprovar `VOICE_AUTOMATION_ENABLED=true`.

**VPS (acesso root necessário; credenciais não estão no pacote):**
- [ ] Verificar se a instalação do Voice Studio terminou (dependências instaladas por `uv`, saúde/OpenAPI/perfis, serviço ativo); checar processos remotos antes de repetir instalação.
- [ ] Validar motor compatível com português, uso comercial e capacidade da VPS (MOSS-TTS-Nano candidato; **não** ativar OmniVoice padrão — pesos não comerciais).
- [ ] Criar `EnvironmentFile` privado do systemd com `/etc/prospectra-voice/integration.env` e `/etc/prospectra-wa-akg/integration.env`; reinício automático; limites de recursos do processo de geração.
- [ ] Expor somente rotas necessárias do Voice Studio; nunca expor `/calls`, configurações, histórico ou administração.

**GitHub (credenciais do proprietário; não acessível nesta sessão):**
- [ ] Integrar PR #27 (fundação de inteligência) ao `main` primeiro (commit `710ccc7` ainda não tem PR #27).
- [ ] Abrir PR da branch `feat/voicestudio-audio` sobre `main` já contendo PR #27; a branch de voz depende do código do PR #27.
- [ ] Gravar o incremento validado no GitHub com pendências e instruções de continuidade.

**Vercel (bloqueio HTTP 403 pendente; não reutilizar link expirado):**
- [ ] Obter acesso à equipe `atintilio-5084` / `team_FtOe2aGUEBCClp33AUX3fjb2`, projeto `prospectra` (`authorize_team_access`).
- [ ] Adicionar segredos server-only (`WA_AKG_BASE_URL`, `WA_AKG_API_KEY`, `VOICESTUDIO_BASE_URL`, `VOICESTUDIO_API_KEY`, `VOICESTUDIO_ENGINE`) a partir dos arquivos privados da VPS; **não substituir nem apagar variáveis existentes**.
- [ ] Fazer deploy e abrir a tela WhatsApp de produção.

**Ativação final (após validação real):**
- [ ] Habilitar `VOICE_AUTOMATION_ENABLED=true` e iniciar o worker persistente na VPS apenas depois de envio real autorizado validado.
- [ ] Transporte de chamadas e transferência ao vendedor ficam para a próxima fase (vazio atual: estado `waiting_transport` sem ligação real).

---

## 6. Conflito de especificações (atentar antes de codificar mais)

O pacote contém `PROSPECTRA_PLUS.md` (Especificação Consolidada v1.3, 28/10/2026): stack Python + Neon + pgvector + Redis + Docker na VPS1EURO, WhatsApp AKG como único canal, "Vercel Nunca", escopo travado aguardando GO. É uma arquitetura diferente do snapshot Next.js/Vercel revisado aqui. Este repositório não foi alterado contra essa especificação, e nenhuma linha dela foi codificada, pois ela própria exige GO explícito do proprietário e não é "onde o trabalho parou" no repositório GitHub.

# Prospectra+ — o que falta implantar (estado real em 27/10/2026)

## Já está NO AR / feito
- **Prospectra+ (web) na Vercel**: `https://prospectra.argusprime.com.br` — `/api/health` = 200, `/login` = 200. Deploy de produção concluído pelo Codex ~19:44.
- **Código integrado ao `main`** no GitHub (`atintilio/prospectra-plus`, head `4f6e0b26`): PR #27 (inteligência) + PRs #28/#29 (voz/WhatsApp) mergeados hoje.
- **Núcleo do Harvey** (ofertas manuais, qualificação, filas persistentes, encaminhamento humano) e **Perfil de comunicação** (base Crystal/personality: cadastro + questionário + orientações automáticas aplicadas pelo Harvey) — no código e publicados.
- **WA-AKG (gateway WhatsApp)** rodando na VPS atrás de auth (`crm.argusprime.com.br/prospectra-whatsapp` responde).

## Falta implantar (e de quem depende)
| # | Item | O que falta | Depende de |
|---|------|-------------|------------|
| 1 | **Helpin integral** | Instalar stack Docker na VPS (script pronto: `install-helpin-vps.sh`) + DNS/HTTPS `helpin.argusprime.com.br` + liberar origem do widget + colar snippet no app | **SSH/console da VPS** |
| 2 | **Voice Studio** | Ativar serviço na VPS, instalar/validar motor PT-BR (MOSS-TTS-Nano candidato; OmniVoice é não-comercial — não usar), subir o `voice-worker`, testar geração+envio Ogg/Opus | **SSH/console da VPS** |
| 3 | **WhatsApp real** | Parear o número e validar envio/recebimento/respostas/encaminhamento | VPS no ar + você fazer o pareamento |
| 4 | **LinkedIn automático** | Implementar/validar convites, mensagens e comentários (hoje é assistido). Codex começou e estourou o limite | Confirmar o que entrou no `main` + concluir |
| 5 | **Agendamento de reuniões** | Integrar calendário + confirmação automática; provedor de e-mail (Gmail/Office365/Zimbra) **você configura manualmente** | Conclusão do código |
| 6 | **Variáveis na Vercel** | Setar `WA_AKG_*`, `VOICESTUDIO_*` server-only a partir dos segredos da VPS, sem apagar os existentes | **Reautorizar acesso Vercel** (meu link) + segredos da VPS |

> `VOICE_AUTOMATION_ENABLED` e `INTELLIGENCE_WORKER_ENABLED` só vão para `true` depois de validação real na VPS. Nada de serviço pago obrigatório.

## O bloqueio principal: acesso à VPS
Esta máquina **não tem** chave/perfil SSH da VPS. O Codex registrou (`status-2026-10-26.md`) que o SSH de `VPS-905340.ssh.vps1euro.fr:9229` dava **timeout** e só o **console web do provedor** (com seu login) funcionava. Ou seja: a instalação na VPS (itens 1, 2 e parte do 3) **não é executável sem o seu acesso**.

## O que preciso de você para eu seguir
1. **Acesso à VPS** — uma das opções:
   - (a) host + usuário + **chave SSH** (ou senha) que eu use daqui; **ou**
   - (b) você abre o **console web do provedor** (vps1euro) e cola o `install-helpin-vps.sh`.
2. **Confirmar a RAM nova** da VPS após o upgrade (Helpin pede ≥ 8 GB).
3. **Reautorizar meu acesso à equipe Vercel** (link que gero — a autorização do Codex não vale para esta conexão) para eu setar as variáveis e confirmar o deploy.

## Arquivos entregues aqui
- `install-helpin-vps.sh` — instalação integral do Helpin, idempotente e não destrutiva (rodar na VPS como root).
- `FALTA-IMPLANTAR.md` — este resumo.

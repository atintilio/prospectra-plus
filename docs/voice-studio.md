# Voz do vendedor — Prospectra+ (Voice Studio na VPS)

Estado real: **29/10/2026**. O serviço de voz está **no ar** e validado ponta a ponta.
Este documento é o procedimento para operar, diagnosticar e — se for preciso — reverter.

---

## 1. O que é

| Item | Valor |
|---|---|
| Serviço | systemd `prospectra-voice` (VoiceStudio 0.5.7) |
| Endereço local | `http://127.0.0.1:3900` (uvicorn, 1 worker, só loopback) |
| Endereço público | `https://voice.argusprime.com.br` |
| Autenticação | `Authorization: Bearer <chave>` — **401 sem chave** |
| Código | `/opt/prospectra-voice` |
| Segredos | `/opt/prospectra-voice/.env` (mode 600) |
| Usuário do processo | `prospectra-voice` |

O nginx publica o serviço: vhost `/etc/nginx/sites-enabled/prospectra-voice` (faz proxy para
`127.0.0.1:3900`) e a checagem da chave Bearer no map de
`/etc/nginx/conf.d/prospectra-voice-auth.conf`. Quem protege é o **nginx**: o backend não
valida requisição vinda do loopback.

A chave é a variável `OMNIVOICE_API_KEY` no `.env` da VPS. No app Prospectra+ ela é
`VOICESTUDIO_API_KEY`, junto de `VOICESTUDIO_BASE_URL` e `VOICESTUDIO_ENGINE`.
**Nunca imprimir valores de segredo — só nomes de variável.**

Limites do unit (para o serviço não derrubar o CRM/WhatsApp na mesma VPS):
`MemoryMax=3000M`, `CPUQuota=80%`, `TasksMax=128`, `Nice=15`, `Restart=on-failure` (10 s),
`TimeoutStopSec=30`.

Rodar `systemctl cat prospectra-voice` para ver o unit real.

---

## 2. Motor: MOSS-TTS-Nano

| | |
|---|---|
| Motor em produção | **MOSS-TTS-Nano** — `OpenMOSS-Team/MOSS-TTS-Nano-100M` |
| Licença | **Apache-2.0** — uso comercial OK |
| Tamanho | ~238 MB (0,4 GB em disco) |
| Execução | CPU (`"device":"cpu"`), sem GPU |
| Descartado | **OmniVoice** (`k2-fsa/OmniVoice`) — licença CC-BY-NC, **não comercial** |

O OmniVoice é o modelo default do VoiceStudio e foi descartado por causa da licença:
pesos com restrição **não comercial** (CC-BY-NC) não podem entrar numa operação
comercial. Não ativar. Ele continua `installed=false` no catálogo.

Ver o catálogo:

```bash
curl -s -H "Authorization: Bearer $OMNIVOICE_API_KEY" http://127.0.0.1:3900/models
```

MOSS-TTS-Nano aparece com `installed: true`, `size_gb: 0.4`, licença `apache-2.0` e
`engines: ["moss-tts-nano"]`.

> O upstream do `moss-tts-nano` **não funciona** com o backend do VoiceStudio sem os
> patches da seção 4. Se alguém reinstalar o pacote ou limpar o cache do HF, a voz
> quebra — e o sintoma é sempre o mesmo: o modelo não gera nada.

---

## 3. Como verificar

### 3.1 Serviço e saúde

```bash
systemctl is-active prospectra-voice          # esperado: active
curl -s http://127.0.0.1:3900/health
# {"status":"ok","device":"cpu","version":"0.5.7"}

# a borda exige a chave
curl -s -o /dev/null -w '%{http_code}\n' https://voice.argusprime.com.br/profiles   # 401
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $OMNIVOICE_API_KEY" https://voice.argusprime.com.br/profiles  # 200
```

Log do motor (o marcador de que a voz está viva):

```bash
journalctl -u prospectra-voice --since "-5 min" | grep "moss-adapter"
# [moss-adapter] OK waveform=(2, 1152000) sample_rate=48000
```

### 3.2 Contrato da API (o erro comum)

| Chamada | Resposta |
|---|---|
| `POST /profiles` | **JSON** com o campo `id` do profile criado |
| `POST /generate` | **WAV binário** no corpo + id no header `X-Audio-Id` (`Content-Type: audio/wav`) — **não devolve JSON** |
| `GET /audio/{audioId}.ogg` | **Ogg/Opus** (binário) |

Quem tenta ler o `/generate` com `jq` ou espera JSON no corpo trava e acha que a voz
quebrou. Guarde o corpo com `-o arquivo.wav` e leia o id do header.

### 3.3 Ponta a ponta (curl)

Rodar **dentro da VPS** (a chave está no `.env`; nunca ecoe o valor):

```bash
KEY=$(grep -E "^OMNIVOICE_API_KEY=" /opt/prospectra-voice/.env | cut -d= -f2-)
B=http://127.0.0.1:3900

# 1) health
curl -s $B/health
# {"status":"ok","device":"cpu","version":"0.5.7"}

# 2) cria um profile (multipart) -> JSON com id
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -F "name=Voz Prospectra PT-BR" \
  -F "kind=clone" \
  -F "engine=moss-tts-nano" \
  -F "ref_text=Hey. I'm the VoiceStudio demo voice. I was made right here, on your machine: private, local, and ready whenever you are." \
  -F "language=Portuguese" \
  -F "ref_audio=@/opt/prospectra-voice/data/voices/demo0001.wav;type=audio/wav" \
  $B/profiles
# {"id":"70b1a89f","name":"Voz Prospectra PT-BR", ...}

# 3) gera -> WAV binário + X-Audio-Id no header
curl -s -D /tmp/gen.h -o /tmp/gen.wav -X POST \
  -H "Authorization: Bearer $KEY" \
  -F "profile_id=70b1a89f" \
  -F "text=Ola, este e um teste de voz em portugues do Prospectra." \
  -F "engine=moss-tts-nano" \
  -F "language=Portuguese" \
  -F "stream=false" \
  $B/generate
AID=$(grep -i "^x-audio-id" /tmp/gen.h | tr -d '\r' | awk '{print $2}')
echo "audio_id=$AID"; file /tmp/gen.wav     # RIFF WAVE

# 4) baixa o Opus
curl -s -o /tmp/audio.ogg -H "Authorization: Bearer $KEY" $B/audio/$AID.ogg
file /tmp/audio.ogg                          # Ogg data
```

Pela URL pública é o mesmo, trocando `$B` por `https://voice.argusprime.com.br`
(o nginx devolve 401 sem a chave).

Tempos medidos no e2e validado: `/profiles` **45 s**, `/generate` **2 min 59 s**.

---

## 4. Os 4+1 patches do pacote MOSS (fora do upstream)

Todos aplicados **no pacote pip** do MOSS — sem mexer no código do app do VoiceStudio.
O pacote está instalado em modo editável (`pip install -e .`) a partir de
`/opt/prospectra-voice/MOSS-TTS-Nano`, então o `__init__.py` corrigido é o que roda.

| # | Patch | Onde | Por quê |
|---|---|---|---|
| 1 | `HF_HUB_OFFLINE=0` (e `TRANSFORMERS_OFFLINE=0`) | `.env` da VPS | Com offline=1 o download do modelo é recusado ("offline mode is enabled"). O modelo fica em cache, então o offline pode voltar depois da instalação. |
| 2 | Exposição da classe `MossTTSNanoForCausalLM` via `get_class_from_dynamic_module` + **adapter** que traduz a API real (`inference(text=, output_audio_path=, mode=...)`) para a que o backend chama (`generate(text=, prompt_audio_path=...)`) | `MOSS-TTS-Nano/moss_tts_nano/__init__.py` | O upstream só exporta `__version__`; o backend procura uma classe com `from_pretrained`. |
| 3 | `_keys_to_ignore_on_load_unexpected` virou **set** (era lista) | snapshot do modelo (`modeling_moss_tts_nano.py`) | O transformers 5.15 faz `lista \| set` → `TypeError` no load. |
| 4 | **`_fix_rotary_buffers`** — recria o `inv_freq` do rotary embedding | mesmo `__init__.py` | **Causa raiz do NaN** (detalhe abaixo). |
| +1 | Atenção `eager` forçada + **softmax em float64** | mesmo `__init__.py` | O `config.json` pede `flash_attention_2` (exige CUDA + `flash_attn`); e o softmax em float32 estoura (`exp`) quando a diferença entre os scores passa de ~88, o que produz NaN. |

### 4.1 Causa raiz do NaN: `inv_freq` corrompido no checkpoint

Sintoma (100% dos logits de texto viram NaN):

```
RuntimeError: Non-finite text logits during generation: dtype=torch.float32
shape=(1, 16384) finite=0/16384
```

Causa: o buffer `inv_freq` do rotary embedding **vem corrompido do checkpoint**.

| | esperado | recebido |
|---|---|---|
| `inv_freq` (32 valores) | positivos, `1/(10000^(arange(0,64,2)/64))` | **17 zeros** e `min=-6.4e27` |

Com `-6.4e27` o rotary calcula `cos(positions * -6.4e27)` → cos de um número gigante →
**NaN** → o residual stream inteiro vira NaN → propaga para todo o output.

O buffer é registrado como `persistent=False` (não deveria vir do checkpoint), mas o
`from_pretrained` do transformers 5.15 sobrescreve assim mesmo. Correção aplicada
**depois do load**:

```python
dim = attn.head_dim
base = float(config.gpt2_config.rope_base)          # 10000.0
inv = 1.0 / (base ** (torch.arange(0, dim, 2, dtype=torch.float32) / dim))
attn.rotary_emb.inv_freq = inv
```

> Comentário antigo no código dizia que o problema era o matmul multithread. **Está
> errado**: a causa é o `inv_freq` corrompido. Corrigido o `inv_freq`, mais threads não
> quebram a estabilidade.

### 4.2 SIGILL (status=4/ILL): a CPU não tem AVX2

`Intel Xeon E5-2470 v2` (Sandy Bridge) tem `sse4_1 sse4_2 avx f16c` — **sem AVX2**.
Os kernels AVX2 (torch 2.8 e a extensão Rust do `pedalboard`) estouravam com **SIGILL**
dentro do import.

Mitigação aplicada no unit:

```ini
Environment=ONEDNN_MAX_CPU_ISA=SSE4_2
Environment=DNNL_MAX_CPU_ISA=SSE4_2
Environment=OMP_NUM_THREADS=1
Environment=MKL_NUM_THREADS=1
```

E o pacote `pedalboard` foi **neutralizado por renomeação** no venv
(`pedalboard` → `pedalboard.disabled-avx2`, `pedalboard_native*.so` →
`*.so.disabled-avx2`), porque o código de DSP degrada com elegância quando o import
falha. Se o SIGILL voltar, é sinal de que entrou algum kernel que não respeita o
oneDNN: o caminho é recompilar o torch com flags de ISA ou manter
`torch.set_num_threads(1)` e evitar os kernels problemáticos.

---

## 5. Masterização e velocidade

### 5.1 Masterização em numpy/scipy (bug corrigido em 29/10)

O código de DSP (`backend/services/audio_dsp.py`) **capturava o `ImportError` do
`pedalboard` e pulava** os estágios de highpass, compressor e EQ. Como o `pedalboard`
está neutralizado nesta CPU, **a masterização não acontecia** — e nada avisava: o áudio
saía sem nenhum tratamento.

Correção: existem `pure_highpass`, `pure_compressor` e `pure_eq` (numpy/scipy),
registrados em `_NUMPY_STAGES`. Medido antes/depois:

| | antes (`.bak`) | depois (numpy) |
|---|---|---|
| `apply_mastering` devolvia | áudio **idêntico** à entrada | áudio processado |
| grave (40 Hz) | sem atenuação | **cai 6,3 dB** |
| pico | 0,68 | **0,48** |

Nenhum efeito do preset `broadcast` nem da `MASTERING_CHAIN` depende mais do
`pedalboard`. Isso não significa que o `pedalboard` volte a funcionar: ele continua
inutilizável nesta CPU (SIGILL).

### 5.2 Env vars de velocidade (`MOSS_TTS_*`)

Lidas pelo adapter, em `/opt/prospectra-voice/.env`, **com fallback no código**
(não quebram se sumirem).

| Variável | Valor na VPS | Default | O que faz |
|---|---|---|---|
| `MOSS_TTS_THREADS` | `2` | 2 | threads do torch. Antes era 1 fixo. |
| `MOSS_TTS_MAX_NEW_FRAMES` | `150` | 150 | Limite de frames gerados (~12 s de áudio). O upstream para em 300 frames (~24 s). |
| `MOSS_TTS_DO_SAMPLE` | `1` | 1 | `1` = amostragem, o modelo **emite o token de fim**. `0` = greedy: **nunca** termina e a fala sempre ocupa o limite inteiro. |

Antes: 300 frames fixos, greedy, 1 thread → ~160-200 s de CPU e áudio de 24 s truncado.
Depois (e2e):

| | antes | depois |
|---|---|---|
| `POST /profiles` | 6,5 min | **45 s** |
| `POST /generate` | ~5 min | **2 min 59 s** |
| áudio entregue | 24,0 s (truncado) | **5,29 s** (parou no token de fim, não truncou) |

Mudou a variável? Reinicie o serviço: `systemctl restart prospectra-voice`.

---

## 6. Como reverter cada patch

Todos os backups estão **na VPS**, no lugar. Antes de reverter, anote o que você está
undo e por quê — reverter o patch 2 sem o 3 (ou vice-versa) deixa o motor quebrado
de outro jeito.

| Patch | Arquivo na VPS | Backup | Como reverter |
|---|---|---|---|
| 1 — HF offline | `/opt/prospectra-voice/.env` | — (é uma linha) | voltar `HF_HUB_OFFLINE=1` e `TRANSFORMERS_OFFLINE=1` (o modelo já está em cache) |
| 2, 4 e +1 — classe/adapter, `inv_freq`, atenção float64 | `/opt/prospectra-voice/MOSS-TTS-Nano/moss_tts_nano/__init__.py` | `__init__.py.orig` (upstream, 49 B) e `__init__.py.v1bak` (patch v1, antes do patch v2 de velocidade) | `cd /opt/prospectra-voice/MOSS-TTS-Nano/moss_tts_nano && cp __init__.py.orig __init__.py` — **isso remove o adapter inteiro**: o backend volta a não achar a classe `from_pretrained` e a voz para. Use `__init__.py.v1bak` se quiser só voltar à versão anterior (sem as env vars de velocidade) |
| 3 — `_keys_to_ignore_on_load_unexpected` | blob do snapshot HF (apontado por `snapshots/*/modeling_moss_tts_nano.py`) | `snapshots/*/modeling_moss_tts_nano.py.pre5x` (com a **lista** original) | restaurar o blob (o symlink continua apontando para ele) — comando na tabela abaixo |
| Masterização numpy | `/opt/prospectra-voice/backend/services/audio_dsp.py` | `audio_dsp.py.bak` (com o caminho do `pedalboard`) | `cp audio_dsp.py.bak audio_dsp.py` |
| SIGILL / `pedalboard` | `/opt/prospectra-voice/.venv/lib/python3.12/site-packages/` | — | `mv pedalboard.disabled-avx2 pedalboard` e `mv pedalboard_native.cpython-312-x86_64-linux-gnu.so.disabled-avx2 pedalboard_native.cpython-312-x86_64-linux-gnu.so` — **só faça isso se tiver uma CPU com AVX2**; caso contrário o SIGILL volta |

Depois de qualquer reversão: `systemctl restart prospectra-voice` e
`curl -s http://127.0.0.1:3900/health`.

Reverter o patch 3 (blob do snapshot do HF):

```bash
SNAP=$(ls -d /opt/prospectra-voice/data/huggingface/hub/models--OpenMOSS-Team--MOSS-TTS-Nano-100M/snapshots/*/ | head -1)
cp "$SNAP/modeling_moss_tts_nano.py.pre5x" "$(readlink -f "$SNAP/modeling_moss_tts_nano.py")"
```

Scripts de aplicação guardados em `/root/` na VPS: `install-moss.py`,
`moss-expose-patch-v2.py`, `apply-moss-patch-v2.py`, `dsp-numpy-patch.py`.

> **Os patches 2, 3, 4 e +1 se perdem** se o pacote MOSS for reinstalado
> (`pip install -e .`) ou se o cache do HF for limpo. Reaplicar antes de qualquer coisa.

---

## 7. Profile de produção

| | |
|---|---|
| id | **`70b1a89f`** |
| nome | `Voz Prospectra PT-BR` |
| kind | `clone` |
| engine | `moss-tts-nano` |
| language | `Portuguese` |
| ref_audio | `demo0001.wav` |

Existe também `af31c82d`, criado no mesmo e2e (mesmos parâmetros). Para listar:

```bash
curl -s -H "Authorization: Bearer $OMNIVOICE_API_KEY" http://127.0.0.1:3900/profiles
```

Os WAVs ficam em `/opt/prospectra-voice/data/voices/` (`demo0001.wav`,
`70b1a89f.wav`, `af31c82d.wav`).

### Como criar outro profile

`POST /profiles` é **multipart**. Campos: `name`, `kind=clone`, `engine`, `ref_text`,
`language`, `ref_audio`.

- `ref_text` = **transcrição exata** do áudio de referência (o modelo usa isso para
  alinhar a prosódia).
- `ref_audio` = arquivo WAV de referência do locutor, com `type=audio/wav`.
- `language` = `Portuguese`.

```bash
curl -s -X POST -H "Authorization: Bearer $KEY" \
  -F "name=Nome do Locutor" \
  -F "kind=clone" \
  -F "engine=moss-tts-nano" \
  -F "ref_text=Transcricao exata do que e dito no audio de referencia." \
  -F "language=Portuguese" \
  -F "ref_audio=@/caminho/da/referencia.wav;type=audio/wav" \
  http://127.0.0.1:3900/profiles
```

A referência ideal: 10-20 s, português, voz limpa, sem música nem ruído.

---

## 8. Riscos e pendências

- **`VOICE_AUTOMATION_ENABLED=false` na Vercel** até o usuário validar a voz a mão.
  O serviço está no ar e testado, mas a automação (gerar e enviar pelo número do
  vendedor) só liga depois dessa validação. Não ativar por conta própria.
- **A referência `demo0001.wav` é a voz de demonstração do VoiceStudio, em inglês**
  (o `ref_text` do profile está em inglês). O profile `70b1a89f` clona essa voz: fala
  português com o timbre de uma demo em inglês. **Para produção em pt-BR grave uma
  referência do locutor** e recrie o profile apontando para o novo `ref_audio`.
- **Geração é pesada**: ~3 min de CPU por take em 2 vCPU. Não rodar em Vercel
  Functions; o serviço fica na VPS.
- **Patches se perdem** ao reinstalar o pacote MOSS ou limpar o cache do HF.
- **SIGILL volta** se o `pedalboard` for reativado nesta CPU.
- **Não mexer no CRM**: o gateway WA-AKG mora **dentro** do vhost `argus-crm`
  (`location ^~ /prospectra-whatsapp/api/`); um re-deploy do CRM pode apagar o proxy
  e o check de `x-api-key`. Mova o WA-AKG para um vhost próprio antes.

---

## 9. Escopo do produto (primeira fase)

Geração e mensagens automáticas com a voz autorizada do vendedor. O desenho do
transporte das chamadas e a transferência ao humano ficam para a fase seguinte, conforme
orientação expressa do proprietário. Intenção de chamada usa estado `waiting_transport`;
isso **não** representa ligação efetuada. O nome permanece Prospectra+ e o agente não
aparece como um vendedor separado.

- O cadastro de voz fica na página WhatsApp, vinculado à operação e ao vendedor
  autenticado. Referência e transcrição exata são enviadas por conexão privada ao
  Voice Studio. Perfis externos nunca são aceitos do formulário e o segredo do serviço
  nunca vai ao navegador.
- Consentimento de uso obrigatório; cinco tentativas de cadastro por vendedor/dia UTC,
  referência até 3 MB. Desativar voz bloqueia futuros envios. Trocar perfil invalida
  mensagens preparadas com a identidade anterior.
- O texto autorizado e o telefone entram em uma fila durável. O executor da VPS gera a
  voz e envia o áudio automaticamente pelo número do vendedor. A solicitação individual
  da interface não significa que Harvey ou as campanhas já estejam autorizados a criar
  mensagens espontaneamente; essa integração ainda depende do fluxo comercial aprovado.
- O executor confirma novamente conta, operação, IA habilitada e perfil antes do envio.
  Compartilha o limite de mensagens e o registro de idempotência do WhatsApp. Após
  resultado ambíguo ou perda do processo, não repete o envio automaticamente.
- A geração pode durar minutos. Não executar em Vercel Functions. `npm run
  build:voice-worker` gera um executável para a VPS; `npm run start:voice-worker`
  inicia o processo persistente com uma mensagem por vez e sem porta pública.

### Configuração e ativação

As migrações 0005/0006 são aditivas; não substituem banco, usuários ou CRM. O worker
usa o mesmo `DATABASE_URL` do Prospectra+. Configure `WA_AKG_BASE_URL`,
`WA_AKG_API_KEY`, `VOICESTUDIO_BASE_URL`, `VOICESTUDIO_API_KEY`, `VOICESTUDIO_ENGINE`
somente no servidor. A aplicação aceita prefixos HTTPS para reutilizar o domínio
existente; o worker pode acessar o serviço de voz pelo endereço local.

`VOICE_AUTOMATION_ENABLED=false` é o padrão. Ativar somente após comprovar motor
instalado, criação de perfil, geração em português e envio real autorizado. A interface
não fica habilitada só porque existe código.

O daemon precisa de um `EnvironmentFile` privado no systemd e reinício automático. Não
copiar segredos para o Git nem para logs. Erros de configuração são reportados sem
chave, transcrição ou número do destinatário. Processos de geração e seus recursos
devem ser limitados para preservar WhatsApp e CRM.

### Reuso do anexo

VoiceStudio 0.5.7, arquivo `VoiceStudio-main (1).zip`, SHA256
`5ccc93d8231c4dd951eba7385dcfa2a02ab6e4cc30a67c0c587aeb9ec4d81fdc`.
`infra/voice-studio/prepare.py` prepara o arquivo original sem sobrescrever um destino
existente. A fonte gerada fica fora do Git; os avisos AGPL e as licenças próprias dos
modelos devem ser preservados. O backend é usado como serviço; Electron e aplicativos
móveis não substituem o frontend do Prospectra+.

O código upstream marca áudio sintético; a integração preserva esse caminho. O modelo
padrão OmniVoice tem pesos com restrição não comercial, segundo o próprio
LICENSE-NOTICE do anexo — por isso o motor em produção é o MOSS-TTS-Nano
(Apache-2.0, uso comercial ok), já instalado e validado.

### Chamadas

A rota upstream `/calls` usa Twilio e não é utilizada. Voice Studio gera voz; não
transporta chamadas WhatsApp sozinho. Existem implementações abertas de VoIP, como
[whatsapp-rust](https://github.com/oxidezap/whatsapp-rust) e
[meowcaller](https://github.com/purpshell/meowcaller), que exigem adaptação e teste de
mídia. Nenhuma foi instalada como se fosse uma chamada já funcional; escolha e
transferência ficam para a fase de transporte solicitada pelo proprietário.

### Limites atuais

Os testes de contrato usam respostas simuladas. Não equivalem a clonagem ou envio real.
Registro de voz, fila e executor estão implementados, mas o fluxo depende do backend,
modelo e WhatsApp pareados. Geração livre de textos, respostas a áudio recebido e
conversação telefônica contínua não são fornecidas por esta integração de
síntese/envio.

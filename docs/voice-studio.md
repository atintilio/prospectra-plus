# Voz do vendedor — Prospectra+

## Escopo confirmado em 27/10/2026

Primeira fase: geração e mensagens automáticas com a voz autorizada do vendedor. O desenho do transporte das chamadas e a transferência ao humano ficam para a fase seguinte, conforme orientação expressa do proprietário. Intenção de chamada usa estado `waiting_transport`; isso não representa ligação efetuada. O nome permanece Prospectra+ e o agente não aparece como um vendedor separado.

## Implementação

- O cadastro de voz fica na página WhatsApp, vinculado à operação e ao vendedor autenticado. Referência e transcrição exata são enviadas por conexão privada ao Voice Studio. Perfis externos nunca são aceitos do formulário e o segredo do serviço nunca vai ao navegador.
- Consentimento de uso obrigatório; cinco tentativas de cadastro por vendedor/dia UTC, referência até 3 MB. Desativar voz bloqueia futuros envios. Trocar perfil invalida mensagens preparadas com a identidade anterior.
- O texto autorizado e o telefone entram em uma fila durável. O executor da VPS gera a voz e envia o áudio automaticamente pelo número do vendedor. A solicitação individual da interface não significa que Harvey ou as campanhas já estejam autorizados a criar mensagens espontaneamente; essa integração ainda depende do fluxo comercial aprovado.
- O executor confirma novamente conta, operação, IA habilitada e perfil antes do envio. Compartilha o limite de mensagens e o registro de idempotência do WhatsApp. Após resultado ambíguo ou perda do processo, não repete o envio automaticamente.
- O contrato revisado é `POST /profiles` multipart para referência; `POST /generate` multipart retorna WAV com `X-Audio-Id`; `GET /audio/{id}.ogg` retorna Opus. Áudio parcial e formato inesperado são recusados. O upload WA-AKG usa multipart `type=voice`; o preparo do gateway corrige o MIME Ogg/Opus que o código original marcava como MP4.
- A geração pode durar minutos. Não executar em Vercel Functions. `npm run build:voice-worker` gera um executável para a VPS; `npm run start:voice-worker` inicia o processo persistente com uma mensagem por vez e sem porta pública.

## Configuração e ativação

As migrações 0005/0006 são aditivas; não substituem banco, usuários ou CRM. O worker usa o mesmo DATABASE_URL do Prospectra+. Configure `WA_AKG_BASE_URL`, `WA_AKG_API_KEY`, `VOICESTUDIO_BASE_URL`, `VOICESTUDIO_API_KEY`, `VOICESTUDIO_ENGINE` somente no servidor. A aplicação aceita prefixos HTTPS para reutilizar o domínio existente; o worker pode acessar o serviço de voz pelo endereço local.

`VOICE_AUTOMATION_ENABLED=false` é o padrão. Ativar somente após comprovar motor instalado, criação de perfil, geração em português e envio real autorizado. A interface não fica habilitada só porque existe código.

O daemon precisa de um EnvironmentFile privado no systemd e reinício automático. Não copiar segredos para o Git nem para logs. Erros de configuração são reportados sem chave, transcrição ou número do destinatário. Processos de geração e seus recursos devem ser limitados para preservar WhatsApp e CRM.

## Reuso do anexo

VoiceStudio 0.5.7, arquivo `VoiceStudio-main (1).zip`, SHA256 `5ccc93d8231c4dd951eba7385dcfa2a02ab6e4cc30a67c0c587aeb9ec4d81fdc`. `infra/voice-studio/prepare.py` prepara o arquivo original sem sobrescrever um destino existente. A fonte gerada fica fora do Git; os avisos AGPL e as licenças próprias dos modelos devem ser preservados. O backend é usado como serviço; Electron e aplicativos móveis não substituem o frontend do Prospectra+.

O código upstream marca áudio sintético; a integração preserva esse caminho. O modelo padrão OmniVoice tem pesos com restrição não comercial, segundo o próprio LICENSE-NOTICE do anexo: não ativá-lo como padrão de uma operação comercial. O candidato leve MOSS-TTS-Nano anuncia português e execução em CPU na [fonte do modelo](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M); a revisão instalada, tokenizer, licença e desempenho na VPS ainda precisam de validação. Metadados de licença ou um catálogo de motores não comprovam instalação nem desempenho em tempo real.

## Chamadas

A rota upstream `/calls` usa Twilio e não é utilizada. Voice Studio gera voz; não transporta chamadas WhatsApp sozinho. Existem implementações abertas de VoIP, como [whatsapp-rust](https://github.com/oxidezap/whatsapp-rust) e [meowcaller](https://github.com/purpshell/meowcaller), que exigem adaptação e teste de mídia. Nenhuma foi instalada como se fosse uma chamada já funcional; escolha e transferência ficam para a fase de transporte solicitada pelo proprietário.

## Limites atuais

Os testes de contrato usam respostas simuladas. Não equivalem a clonagem ou envio real. Registro de voz, fila e executor estão implementados, mas o fluxo depende do backend, modelo e WhatsApp pareados. Geração livre de textos, respostas a áudio recebido e conversação telefônica contínua não são fornecidas por esta integração de síntese/envio.

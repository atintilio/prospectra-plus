'use client';

import { useActionState } from 'react';
import { Mic, Wand2 } from 'lucide-react';
import { VoiceRecorder } from '@/components/voice-recorder';
import { registrarVozAction } from './voice-actions';
import { useVoiceTranscript } from './use-voice-transcript';

export function VoiceCloneForm({ available, hasProfile }: { available: boolean; hasProfile: boolean }) {
  const { recording, transcript, setTranscript, error, transcribing, onRecording, transcribe } = useVoiceTranscript();
  const [state, action, pending] = useActionState((previous: Parameters<typeof registrarVozAction>[0], data: FormData) => {
    if (!recording) return Promise.resolve({ error: 'Grave sua voz antes de salvar.' });
    data.set('reference', recording);
    return registrarVozAction(previous, data);
  }, undefined);
  return (
    <form action={action} className="space-y-4">
      <VoiceRecorder onChange={onRecording} disabled={!available || pending} />

      <label className="block text-sm">
        <span className="mb-1 flex flex-wrap items-center gap-2 font-medium">
          O que foi dito na gravação
          {error && <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs"
            onClick={() => recording && void transcribe(recording)}
            disabled={!available || !recording || transcribing}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Tentar transcrever novamente
          </button>}
        </span>
        <textarea
          className="input mt-1 w-full"
          name="transcript"
          rows={3}
          maxLength={4000}
          required
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          disabled={!available || pending}
          readOnly={transcribing}
          placeholder="Escreva o que foi dito na gravação."
        />
        {transcribing && <span role="status" className="mt-1 block text-xs text-muted">Transcrevendo gravação…</span>}
        {error && <span role="alert" className="mt-1 block text-xs text-danger">{error}</span>}
      </label>

      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="voiceConsent" required disabled={!available || pending} />
        Esta gravação é minha ou tenho autorização para usar esta voz nas mensagens desta operação.
      </label>

      {available ? (
        <button className="btn-primary" disabled={pending || transcribing || !recording}>
          <span className="inline-flex items-center gap-1.5">
            <Mic className="h-4 w-4" />
            {pending ? 'Criando o perfil…' : hasProfile ? 'Substituir minha voz' : 'Criar meu perfil de voz'}
          </span>
        </button>
      ) : (
        <p className="text-xs text-muted">O serviço de voz está indisponível para esta operação agora.</p>
      )}

      {state?.ok && <p className="text-xs text-muted" role="status">{state.ok}</p>}
      {state?.error && <p className="text-xs text-danger" role="status">{state.error}</p>}
    </form>
  );
}

export function VoiceDropzoneHint() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted">
      Dica: grave em silêncio, sem música de fundo, falando em português do Brasil.
    </p>
  );
}

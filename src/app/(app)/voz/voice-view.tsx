'use client';

import { useActionState, useState, useTransition } from 'react';
import { Mic, Wand2 } from 'lucide-react';
import { VoiceRecorder } from '@/components/voice-recorder';
import { registrarVozAction, transcreverVozAction } from './voice-actions';

export function VoiceCloneForm({ available, hasProfile }: { available: boolean; hasProfile: boolean }) {
  const [recording, setRecording] = useState<File | null>(null);
  const [state, action, pending] = useActionState((previous: Parameters<typeof registrarVozAction>[0], data: FormData) => {
    if (!recording) return Promise.resolve({ error: 'Grave sua voz antes de salvar.' });
    data.set('reference', recording);
    return registrarVozAction(previous, data);
  }, undefined);
  const [transcript, setTranscript] = useState('');
  const [transcribing, startTranscribing] = useTransition();
  const [transcriptError, setTranscriptError] = useState('');
  const transcrever = () => {
    setTranscriptError('');
    if (!recording) {
      setTranscriptError('Grave sua voz primeiro.');
      return;
    }
    const data = new FormData();
    data.set('reference', recording);
    startTranscribing(async () => {
      try {
        const text = await transcreverVozAction(data);
        setTranscript(text);
      } catch (err) {
        setTranscriptError(err instanceof Error ? err.message : 'Não foi possível transcrever.');
      }
    });
  };

  return (
    <form action={action} className="space-y-4">
      <VoiceRecorder onChange={(file) => { setRecording(file); setTranscript(''); setTranscriptError(''); }} disabled={!available || pending} />

      <label className="block text-sm">
        <span className="mb-1 flex flex-wrap items-center gap-2 font-medium">
          O que foi dito na gravação
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs"
            onClick={transcrever}
            disabled={!available || !recording || transcribing}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {transcribing ? 'Transcrevendo…' : 'Transcrever automaticamente'}
          </button>
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
          placeholder="Escreva o que foi dito na gravação."
        />
        {transcriptError && <span className="mt-1 block text-xs text-danger">{transcriptError}</span>}
      </label>

      <label className="flex gap-2 text-sm">
        <input type="checkbox" name="voiceConsent" required disabled={!available || pending} />
        Esta gravação é minha ou tenho autorização para usar esta voz nas mensagens desta operação.
      </label>

      {available ? (
        <button className="btn-primary" disabled={pending || !recording}>
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

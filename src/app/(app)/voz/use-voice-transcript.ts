'use client';

import { useRef, useState } from 'react';
import { transcreverVozAction } from './voice-actions';

export function useVoiceTranscript() {
  const [recording, setRecording] = useState<File | null>(null);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const requestId = useRef(0);

  async function transcribe(file: File) {
    const id = ++requestId.current;
    setError('');
    setTranscribing(true);
    const form = new FormData();
    form.set('reference', file);
    try {
      const result = await transcreverVozAction(form);
      if (id !== requestId.current) return;
      if ('error' in result) setError(result.error);
      else setTranscript(result.transcript);
    } catch {
      if (id === requestId.current) setError('Não foi possível transcrever esta gravação. Tente novamente.');
    } finally {
      if (id === requestId.current) setTranscribing(false);
    }
  }

  function onRecording(file: File | null) {
    requestId.current++;
    setRecording(file);
    setTranscript('');
    setError('');
    setTranscribing(false);
    if (file) void transcribe(file);
  }

  return { recording, transcript, setTranscript, error, transcribing, onRecording, transcribe };
}

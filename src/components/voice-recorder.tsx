'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_BYTES = 3_000_000;
const MAX_DURATION_MS = 120_000;
const formats = [
  ['audio/mp4', 'm4a'],
  ['audio/webm', 'webm'],
  ['audio/ogg', 'ogg'],
] as const;

export function releaseVoiceCapture(recorder: MediaRecorder | null, stream: MediaStream | null, url: string | null) {
  if (recorder?.state !== 'inactive') recorder?.stop();
  stream?.getTracks().forEach((track) => track.stop());
  if (url) URL.revokeObjectURL(url);
}

export function VoiceRecorder({ onChange, disabled = false }: { onChange: (file: File | null) => void; disabled?: boolean }) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);
  const startingRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder) recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
      releaseVoiceCapture(recorder, streamRef.current, urlRef.current);
    };
  }, []);

  const stop = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const start = async () => {
    if (startingRef.current || recorderRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError('');
    setFile(null);
    onChange(null);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setUrl(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Este navegador não oferece gravação pelo microfone.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const format = formats.find(([mime]) => MediaRecorder.isTypeSupported(mime));
      if (!format) throw new Error('Este navegador não oferece um formato de áudio compatível.');
      const recorder = new MediaRecorder(stream, { mimeType: format[0] });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      let tooLarge = false;
      let failed = false;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        bytes += event.data.size;
        if (bytes > MAX_BYTES) {
          tooLarge = true;
          setError('A gravação passou de 3 MB. Grave uma amostra mais curta.');
          stop();
        } else chunks.push(event.data);
      };
      recorder.onerror = () => {
        failed = true;
        setError('A gravação falhou. Tente novamente.');
        stop();
      };
      recorder.onstop = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (!activeRef.current || tooLarge || failed || !bytes) return;
        const captured = new File(chunks, `voz.${format[1]}`, { type: format[0] });
        const nextUrl = URL.createObjectURL(captured);
        urlRef.current = nextUrl;
        setUrl(nextUrl);
        setFile(captured);
        onChange(captured);
      };
      recorder.start(1000);
      setRecording(true);
      timerRef.current = setTimeout(stop, MAX_DURATION_MS);
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (activeRef.current) setError(err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Permita o acesso ao microfone no navegador para gravar sua voz.'
        : err instanceof Error ? err.message : 'Não foi possível iniciar a gravação.');
    } finally {
      startingRef.current = false;
      if (activeRef.current) setStarting(false);
    }
  };

  return <div className="space-y-2">
    <p className="text-sm font-medium">Gravação da sua voz</p>
    <p className="text-xs text-muted">Grave em um ambiente silencioso por até 2 minutos. Limite de 3 MB.</p>
    <button type="button" className="btn-outline" onClick={recording ? stop : start} disabled={disabled || starting}>
      {starting ? 'Abrindo microfone…' : recording ? 'Parar gravação' : file ? 'Regravar' : 'Iniciar gravação'}
    </button>
    {recording && <p role="status" className="text-xs text-muted">Gravando…</p>}
    {url && <audio controls src={url} className="w-full" aria-label="Ouvir sua gravação" />}
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}

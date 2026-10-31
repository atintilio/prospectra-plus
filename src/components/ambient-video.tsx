'use client';

import { useEffect, useRef } from 'react';
import type HlsInstance from 'hls.js';

const STREAM_URL = 'https://stream.mux.com/kimF2ha9zLrX64H00UgLGPflCzNtl1T0215MlAmeOztv8.m3u8';

export function AmbientVideo({ className }: { className: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let active = true;
    let hls: HlsInstance | null = null;
    const play = () => { if (active) void video.play().catch(() => undefined); };

    const start = async () => {
      const { default: Hls } = await import('hls.js');
      if (!active) return;
      if (Hls.isSupported()) {
        hls = new Hls({ capLevelToPlayerSize: true, enableWorker: true, maxBufferLength: 24 });
        hls.loadSource(STREAM_URL);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        return;
      }
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = STREAM_URL;
        video.addEventListener('loadedmetadata', play, { once: true });
      }
    };

    void start().catch(() => undefined);
    return () => {
      active = false;
      hls?.destroy();
      video.removeEventListener('loadedmetadata', play);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster="/prospectra-hero-poster.webp"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

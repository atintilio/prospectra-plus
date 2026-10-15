'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const ANIMATION_PATH = '/animations/prospectra-logo.json';

/** Logo animado (Lottie). Se o JSON não existir ou falhar, mostra o logo estático. */
export function AnimatedLogo({ className = 'h-40 w-40 md:h-48 md:w-48' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let destroy: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ANIMATION_PATH, { method: 'HEAD' });
        if (!res.ok) throw new Error('sem animação');
        // import dinâmico: lottie-web acessa `document` e quebra no SSR
        const { default: lottie } = await import('lottie-web');
        if (cancelled || !ref.current) return;
        const anim = lottie.loadAnimation({ container: ref.current, renderer: 'svg', loop: true, autoplay: true, path: ANIMATION_PATH });
        anim.setSpeed(0.8);
        destroy = () => anim.destroy();
      } catch {
        if (!cancelled) setFallback(true);
      }
    })();
    return () => { cancelled = true; destroy?.(); };
  }, []);

  return (
    <div className="flex w-full items-center justify-center">
      {fallback ? (
        <Image src="/logo.png" alt="Prospectra" width={192} height={192} priority className={`${className} rounded-3xl object-contain`} />
      ) : (
        <div ref={ref} className={`${className} drop-shadow-[0_0_25px_rgba(59,130,246,0.3)]`} aria-label="Logo Prospectra animado" />
      )}
    </div>
  );
}

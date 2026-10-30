import Image from 'next/image';

/** Logo fixo no canto esquerdo: sem moldura e com sombra discreta. */
export function AnimatedLogo({ className = 'h-40 w-40' }: { className?: string }) {
  return (
    <div className={`fixed left-4 top-4 z-40 ${className}`} aria-label="Logo Prospectra">
      <Image
        src="/argus-prime-logo-negativo.png"
        alt="Argus Prime"
        width={900}
        height={900}
        priority
        className="relative z-10 h-full w-full select-none object-contain drop-shadow-[0_0_24px_rgba(59,100,255,.35)]"
      />
      <div className="pointer-events-none absolute -bottom-1 left-1/2 h-3 w-3/5 -translate-x-1/2 rounded-[50%] bg-[#0b2f8a]/25 blur-lg" />
    </div>
  );
}

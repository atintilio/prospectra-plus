import Image from 'next/image';

/** Símbolo Prospectra+ transparente para fundos claros ou escuros. */
export function AnimatedLogo({ className = 'h-40 w-40' }: { className?: string }) {
  return (
    <div className={`fixed left-4 top-4 z-40 ${className}`} role="img" aria-label="Símbolo Prospectra+">
      <Image
        src="/prospectra-mark-optimized.webp"
        alt=""
        width={900}
        height={986}
        priority
        className="relative z-10 h-full w-full select-none object-contain drop-shadow-[0_0_28px_rgba(74,127,255,.38)]"
      />
      <div className="pointer-events-none absolute -bottom-1 left-1/2 h-3 w-3/5 -translate-x-1/2 rounded-[50%] bg-[#0b2f8a]/25 blur-lg" />
    </div>
  );
}

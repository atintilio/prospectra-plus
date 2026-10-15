import Image from 'next/image';

/** Logo 3D flutuante: sem moldura, fundo transparente, com sombra suave no "chão". */
export function AnimatedLogo({ className = 'h-40 w-40' }: { className?: string }) {
  return (
    <div className={`mx-auto lg:mx-0 ${className}`} aria-label="Logo Prospectra">
      <Image
        src="/logo-hero.png"
        alt="Prospectra"
        width={900}
        height={900}
        priority
        className="logo-float relative z-10 h-full w-full select-none object-contain drop-shadow-[0_0_40px_rgba(59,100,255,.45)] [animation:logo-float_7s_ease-in-out_infinite]"
      />
      <div className="logo-shadow pointer-events-none absolute -bottom-3 left-1/2 h-5 w-3/5 -translate-x-1/2 rounded-[50%] bg-[#0b2f8a]/40 blur-xl [animation:logo-shadow_7s_ease-in-out_infinite]" />
    </div>
  );
}

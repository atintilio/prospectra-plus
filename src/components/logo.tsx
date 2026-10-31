import Image from 'next/image';

type LogoMotion = 'none' | 'navigation';

export function LogoMark({ size = 44, motion = 'none' }: { size?: number; dark?: boolean; motion?: LogoMotion }) {
  const markSize = size + 8;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-visible ${motion === 'navigation' ? 'prospectra-logo-nav' : ''}`}
      style={{ width: markSize, height: markSize }}
    >
      <Image
        src="/prospectra-mark-optimized.webp"
        alt="Símbolo Prospectra+"
        width={900}
        height={986}
        priority
        className={`h-full w-full object-contain drop-shadow-[0_6px_20px_rgba(39,91,190,.28)] ${motion === 'navigation' ? 'prospectra-logo-nav-image' : ''}`}
      />
    </span>
  );
}

export function Logo({ size = 44, dark = false, motion = 'none' }: { size?: number; dark?: boolean; motion?: LogoMotion }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} motion={motion} />
      <span className={`text-xl font-semibold tracking-tight ${dark ? 'text-white' : 'text-text'}`}>Prospectra+</span>
    </span>
  );
}

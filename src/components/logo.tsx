import Image from 'next/image';

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <Image src="/logo.png" alt="" width={size} height={size} priority />
    </span>
  );
}

export function Logo({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`text-lg font-semibold tracking-tight ${dark ? 'text-white' : 'text-text'}`}>Prospectra</span>
    </span>
  );
}


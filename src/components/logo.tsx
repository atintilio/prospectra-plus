import Image from 'next/image';

export function LogoMark({ size = 36 }: { size?: number }) {
  return <Image src="/argus-prime-logo.png" alt="Argus Prime" width={size * 2} height={size} priority className="h-auto w-auto max-w-[150px] object-contain" />;
}

export function Logo({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`text-lg font-semibold tracking-tight ${dark ? 'text-white' : 'text-text'}`}>Prospectra</span>
    </span>
  );
}


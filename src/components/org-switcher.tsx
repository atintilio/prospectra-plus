'use client';

import Image from 'next/image';
import { useTransition } from 'react';
import { switchOrgAction } from '@/app/(app)/actions';

// Ícone oficial Argus Prime (ouro velho).
const ArgusMark = () => <Image src="/argus-prime-logo.png" alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 object-contain" />;
// Nome em ouro velho, com elegância (mesma fonte da interface, peso e tracking refinados).
const GOLD = '#b0894c';
const Wordmark = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[15px] font-semibold tracking-[.06em]" style={{ color: GOLD }}>{children}</span>
);

export function OrgSwitcher({ orgs, current }: { orgs: { id: string; name: string }[]; current: string | null }) {
  const [pending, start] = useTransition();
  if (orgs.length === 0) return null;
  if (orgs.length === 1) {
    return <span className="flex items-center gap-2.5"><ArgusMark /><Wordmark>{orgs[0].name}</Wordmark></span>;
  }
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <ArgusMark />
      <select
        className="rounded-lg border border-border bg-white px-2 py-1.5 text-[15px] font-semibold tracking-[.06em] focus:border-accent focus:outline-none"
        style={{ color: GOLD }}
        value={current ?? ''} disabled={pending} aria-label="Parceiro"
        onChange={(e) => start(() => switchOrgAction(e.target.value))}>
        {!current && <option value="">Escolha um parceiro</option>}
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

'use client';

import Image from 'next/image';
import { useTransition } from 'react';
import { switchOrgAction } from '@/app/(app)/actions';

// Ícone oficial Argus Prime (ouro velho) no lugar do ícone genérico.
const ArgusMark = () => <Image src="/argus-prime-logo.png" alt="" width={22} height={22} className="h-[22px] w-[22px] shrink-0 object-contain" />;

export function OrgSwitcher({ orgs, current }: { orgs: { id: string; name: string }[]; current: string | null }) {
  const [pending, start] = useTransition();
  if (orgs.length === 0) return null;
  if (orgs.length === 1) {
    return <span className="flex items-center gap-2 text-sm font-medium"><ArgusMark />{orgs[0].name}</span>;
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <ArgusMark />
      <select
        className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm font-medium focus:border-accent focus:outline-none"
        value={current ?? ''} disabled={pending} aria-label="Parceiro"
        onChange={(e) => start(() => switchOrgAction(e.target.value))}>
        {!current && <option value="">Escolha um parceiro</option>}
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

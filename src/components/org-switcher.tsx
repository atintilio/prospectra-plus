'use client';

import Image from 'next/image';
import { useTransition } from 'react';
import { switchOrgAction } from '@/app/(app)/actions';

// Ícone oficial Argus Prime (ouro velho).
const ArgusMark = () => <Image src="/argus-prime-logo.png" alt="" width={60} height={60} className="h-[60px] w-[60px] shrink-0 object-contain" />;
// Nome em ouro velho — serifado, leve e em caixa alta espaçada: refinado e discreto,
// alinhado ao emblema, sem competir com ele.
const GOLD = '#a9824a';
const WORD_STYLE: React.CSSProperties = { color: GOLD, fontFamily: "ui-serif, Georgia, 'Times New Roman', serif", fontWeight: 400, letterSpacing: '.22em', textTransform: 'uppercase' };
const Wordmark = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px]" style={WORD_STYLE}>{children}</span>
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
        className="rounded-lg border border-border bg-white px-2 py-1.5 text-[11px] focus:border-accent focus:outline-none"
        style={WORD_STYLE}
        value={current ?? ''} disabled={pending} aria-label="Parceiro"
        onChange={(e) => start(() => switchOrgAction(e.target.value))}>
        {!current && <option value="">Escolha um parceiro</option>}
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

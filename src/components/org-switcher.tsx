'use client';

import { Building2 } from 'lucide-react';
import { useTransition } from 'react';
import { switchOrgAction } from '@/app/(app)/actions';

export function OrgSwitcher({ orgs, current }: { orgs: { id: string; name: string }[]; current: string | null }) {
  const [pending, start] = useTransition();
  if (orgs.length === 0) return null;
  if (orgs.length === 1) {
    return <span className="flex items-center gap-2 text-sm font-medium"><Building2 className="h-4 w-4 text-muted" />{orgs[0].name}</span>;
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <Building2 className="h-4 w-4 text-muted" />
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

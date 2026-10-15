import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function PageHeader({ title, subtitle, eyebrow, children }: { title: string; subtitle?: string; eyebrow?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-sm font-medium text-accent">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function KpiCard({ icon: Icon, label, value, hint, delta, tone = 'accent' }: {
  icon: LucideIcon; label: string; value: string | number; hint?: string; delta?: number | null; tone?: 'accent' | 'violet';
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${tone === 'violet' ? 'bg-violet-soft text-violet' : 'bg-surface-accent text-accent'}`}>
          <Icon className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium text-muted">{label}</p>
      </div>
      <p className="mt-4 text-[32px] font-semibold leading-none tracking-tight">{value}</p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {delta != null && (
          <span className={`inline-flex items-center gap-0.5 font-medium ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(delta)}%
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </div>
  );
}

export function Card({ title, icon: Icon, action, children, className = '' }: { title?: string; icon?: LucideIcon; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">{Icon && <Icon className="h-[18px] w-[18px] text-accent" />}{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Empty({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-accent text-accent"><Icon className="h-6 w-6" /></span>
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
      {children && <div className="mt-5 flex gap-2">{children}</div>}
    </div>
  );
}

export const STAGE_LABEL: Record<string, string> = {
  new: 'Novo', invited: 'Convidado', connected: 'Conectado', replied: 'Respondeu', meeting: 'Reunião', won: 'Venda', lost: 'Perdido', do_not_contact: 'Não contatar',
};
const STAGE_CLASS: Record<string, string> = {
  new: 'bg-surface text-muted', invited: 'bg-surface-accent text-accent', connected: 'bg-violet-soft text-violet', replied: 'bg-success-soft text-success',
  meeting: 'bg-warning-soft text-warning', won: 'bg-success text-white', lost: 'bg-red-50 text-danger', do_not_contact: 'bg-red-50 text-danger',
};
export function StagePill({ stage }: { stage: string }) {
  return <span className={`pill ${STAGE_CLASS[stage] ?? 'bg-surface text-muted'}`}>{STAGE_LABEL[stage] ?? stage}</span>;
}

const AVATAR = ['bg-accent', 'bg-violet', 'bg-[#0e7490]', 'bg-[#be185d]', 'bg-secondary'];
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '?';
  const color = AVATAR[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${color}`} style={{ width: size, height: size }}>{initials}</span>;
}

/** Gráfico de linhas em SVG (2 séries), sem dependências. */
export function LineChart({ labels, series }: { labels: string[]; series: { name: string; values: number[]; color: string; area?: boolean }[] }) {
  const W = 640, H = 220, P = { l: 32, r: 12, t: 12, b: 28 };
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const nice = Math.ceil(max / 4) * 4;
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / Math.max(1, labels.length - 1);
  const y = (v: number) => H - P.b - (v / nice) * (H - P.t - P.b);
  const step = Math.ceil(labels.length / 7);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evolução diária">
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.22" /><stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (nice / 4) * k;
          return (
            <g key={k}>
              <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeDasharray={k ? '3 3' : undefined} />
              <text x={P.l - 8} y={y(v) + 4} fontSize="10" textAnchor="end" fill="#5c5f66">{v}</text>
            </g>
          );
        })}
        {labels.map((l, i) => (i % step === 0 || i === labels.length - 1) && (
          <text key={i} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#5c5f66">{l}</text>
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <g key={si}>
              {s.area && <polygon points={`${x(0)},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}`} fill={`url(#g${si})`} />}
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(s.values.length - 1)} cy={y(s.values.at(-1) ?? 0)} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4 text-xs text-muted">
        {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  );
}

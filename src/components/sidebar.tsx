'use client';

import { Bot, Building2, CalendarDays, FileText, LayoutDashboard, LifeBuoy, Linkedin, ListChecks, LogOut, Megaphone, Mic, Settings, Sparkles, UserSearch, Users, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/(auth)/actions';
import { LogoMark } from './logo';

// Menu organizado pelas áreas do benchmark (recon do Prospectra):
// CRM · Operações · Inteligência/Enriquecimento · Automação · Equipes/Owner/Configurações.
export function Sidebar({ isAdmin, canManage, isDemo = false }: { isAdmin: boolean; canManage: boolean; isDemo?: boolean }) {
  const path = usePathname();
  const groups: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
    {
      label: 'CRM',
      items: [
        { href: '/painel', label: 'Painel', icon: LayoutDashboard },
        { href: '/leads', label: 'Leads', icon: UserSearch },
        { href: '/fila', label: 'Fila do dia', icon: ListChecks },
        { href: '/agenda', label: 'Agenda', icon: CalendarDays },
      ],
    },
    {
      label: 'Operações',
      items: [
        { href: '/campanhas', label: 'Campanhas', icon: Megaphone },
        { href: '/golinkedin', label: 'Go LinkedIn', icon: Linkedin },
        { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
        { href: '/helpin', label: 'Helpin', icon: LifeBuoy },
        { href: '/documentos', label: 'Documentos', icon: FileText },
      ],
    },
    {
      label: 'Inteligência',
      items: [
        { href: '/inteligencia', label: 'Inteligência comercial', icon: Sparkles },
        ...(isDemo ? [
          { href: '/automacao', label: 'Piloto automático', icon: Bot },
          { href: '/simulador', label: 'Simulador', icon: Mic },
        ] : []),
      ],
    },
    {
      label: 'Administração',
      items: [
        ...(canManage || isAdmin ? [{ href: '/equipe', label: 'Equipe', icon: Users }] : []),
        ...(isAdmin ? [{ href: '/admin', label: 'Administração de parceiros', icon: Building2 }, { href: '/admin/argus', label: 'Relatórios Argus', icon: Sparkles }] : []),
        { href: '/conta', label: 'Minha conta', icon: Settings },
      ],
    },
  ];
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <>
      <aside className="sidebar-glow sticky top-0 hidden h-dvh w-[244px] shrink-0 flex-col overflow-y-auto border-r border-border px-3 py-5 md:flex">
        <Link href="/painel" className="flex items-center gap-2.5 px-3">
          <LogoMark size={34} className="logo-float" />
          <span className="text-lg font-semibold tracking-tight text-text">Prospectra</span>
        </Link>
        <nav className="mt-6 flex flex-col gap-4">
          {groups.map(({ label, items }) => (
            <div key={label}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">{label}</p>
              <div className="flex flex-col gap-1">
                {items.map(({ href, label: itemLabel, icon: Icon }) => (
                  <Link key={href} href={href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active(href) ? 'bg-surface-accent text-accent' : 'text-muted hover:bg-surface hover:text-text'}`}>
                    <Icon className="h-[18px] w-[18px]" /> {itemLabel}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-border bg-white/80 p-4">
          <p className="text-sm font-semibold">{isDemo ? 'Piloto automático (simulado)' : 'Modo assistido'}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{isDemo ? 'Prévia de como o agente enviará convites, responderá leads e comentará publicações sozinho.' : 'O Prospectra prepara cada ação; o envio é seu, com um clique. Sua conta do LinkedIn fica protegida.'}</p>
          <p className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Image src="/argus-prime-logo.png" alt="Argus Prime" width={32} height={32} className="argus-mark" />
            <span className="text-[10px] font-medium uppercase tracking-[.08em] text-muted">Uma ferramenta Argus Prime</span>
          </p>
        </div>
        <form action={logoutAction} className="mt-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface hover:text-text">
            <LogOut className="h-[18px] w-[18px]" /> Sair
          </button>
        </form>
      </aside>
      {/* Navegação no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-border bg-white md:hidden">
        {groups.flatMap((g) => g.items).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex min-w-20 shrink-0 flex-col items-center gap-1 px-2 py-2 text-[11px] ${active(href) ? 'text-accent' : 'text-muted'}`}>
            <Icon className="h-5 w-5" /> {label.split(' ')[0]}
          </Link>
        ))}
      </nav>
    </>
  );
}

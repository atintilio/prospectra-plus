'use client';

import { Bot, Building2, CalendarDays, FileText, LayoutDashboard, LifeBuoy, Linkedin, ListChecks, LogOut, Megaphone, Settings, Users, UserSearch, MessageCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/(auth)/actions';
import { Logo } from './logo';

export function Sidebar({ isAdmin, canManage, isDemo = false }: { isAdmin: boolean; canManage: boolean; isDemo?: boolean }) {
  const path = usePathname();
  const items = [
    { href: '/painel', label: 'Painel', icon: LayoutDashboard },
    { href: '/fila', label: 'Fila do dia', icon: ListChecks },
    { href: '/leads', label: 'Leads', icon: UserSearch },
    { href: '/campanhas', label: 'Campanhas', icon: Megaphone },
    { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { href: '/golinkedin', label: 'Go LinkedIn', icon: Linkedin },
    { href: '/helpin', label: 'Helpin', icon: LifeBuoy },
    { href: '/agenda', label: 'Agenda', icon: CalendarDays },
    { href: '/documentos', label: 'Documentos', icon: FileText },
    { href: '/inteligencia', label: 'Inteligência comercial', icon: Sparkles },
    ...(isDemo ? [{ href: '/automacao', label: 'Piloto automático', icon: Bot }] : []),
    ...(canManage || isAdmin ? [{ href: '/equipe', label: 'Equipe', icon: Users }] : []),
    { href: '/conta', label: 'Minha conta', icon: Settings },
    ...(isAdmin ? [{ href: '/admin', label: 'Administração de parceiros', icon: Building2 }] : []),
  ];
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[244px] shrink-0 flex-col border-r border-border bg-white px-3 py-5 md:flex">
        <Link href="/painel" className="px-3"><Logo size={34} /></Link>
        <nav className="mt-8 flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active(href) ? 'bg-surface-accent text-accent' : 'text-muted hover:bg-surface hover:text-text'}`}>
              <Icon className="h-[18px] w-[18px]" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-border bg-gradient-to-br from-surface-accent to-violet-soft p-4">
          <p className="text-sm font-semibold">{isDemo ? 'Piloto automático (simulado)' : 'Modo assistido'}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{isDemo ? 'Prévia de como o agente enviará convites, responderá leads e comentará publicações sozinho.' : 'O Prospectra prepara cada ação; o envio é seu, com um clique. Sua conta do LinkedIn fica protegida.'}</p>
        </div>
        <form action={logoutAction} className="mt-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface hover:text-text">
            <LogOut className="h-[18px] w-[18px]" /> Sair
          </button>
        </form>
      </aside>
      {/* Navegação no celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-border bg-white md:hidden">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex min-w-20 shrink-0 flex-col items-center gap-1 px-2 py-2 text-[11px] ${active(href) ? 'text-accent' : 'text-muted'}`}>
            <Icon className="h-5 w-5" /> {label.split(' ')[0]}
          </Link>
        ))}
      </nav>
    </>
  );
}


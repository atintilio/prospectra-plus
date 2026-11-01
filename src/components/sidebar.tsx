'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BarChart3, BookOpen, Bot, Building2, CalendarDays, ChevronDown, FileText, FolderKanban, Headset,
  LayoutDashboard, LifeBuoy, ListChecks, LogOut, Megaphone, MessageCircle, Mic,
  MoreHorizontal, Settings, Share2, SlidersHorizontal, Sparkles, Timer, Users, UserSearch, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/(auth)/actions';
import { Logo, LogoMark } from './logo';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

export function Sidebar({ isAdmin, canManage, isDemo = false }: { isAdmin: boolean; canManage: boolean; isDemo?: boolean }) {
  const path = usePathname();
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const primary: NavItem[] = [
    { href: '/painel', label: 'Painel', icon: LayoutDashboard },
    { href: '/fila', label: 'Fila do dia', icon: ListChecks },
    { href: '/leads', label: 'Leads', icon: UserSearch },
    { href: '/campanhas', label: 'Campanhas', icon: Megaphone },
  ];
  const groups: NavGroup[] = [
    {
      id: 'prospecting', label: 'Prospecção', icon: Sparkles,
      items: [
        { href: '/inteligencia', label: 'Inteligência comercial', icon: Sparkles },
        { href: '/comunicacao', label: 'Perfil de comunicação', icon: MessageCircle },
        { href: '/linkedin', label: 'LinkedIn', icon: Share2 },
        { href: '/leads/atributos', label: 'Campos', icon: SlidersHorizontal },
        ...(isDemo ? [{ href: '/automacao', label: 'Piloto automático', icon: Bot }] : []),
      ],
    },
    {
      id: 'relationship', label: 'Relacionamento', icon: MessageCircle,
      items: [
        { href: '/agenda', label: 'Agenda', icon: CalendarDays },
        { href: '/atendimento', label: 'Atendimento', icon: Timer },
        { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
        { href: '/voz', label: 'Minha voz', icon: Mic },
        { href: '/suporte', label: 'Suporte', icon: LifeBuoy },
        { href: '/ajuda', label: 'Central de ajuda', icon: BookOpen },
      ],
    },
    {
      id: 'workspace', label: 'Gestão e equipe', icon: FolderKanban,
      items: [
        { href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
        { href: '/projetos', label: 'Projetos', icon: FolderKanban },
        { href: '/docs', label: 'Documentos', icon: FileText },
        ...(canManage || isAdmin ? [{ href: '/equipe', label: 'Equipe', icon: Users }] : []),
        { href: '/conta', label: 'Minha conta', icon: Settings },
      ],
    },
    ...(isAdmin ? [{
      id: 'administration', label: 'Administração', icon: Building2,
      items: [
        { href: '/argus', label: 'Suporte interno', icon: Headset },
        { href: '/admin', label: 'Administração de parceiros', icon: Building2 },
      ],
    }] : []),
  ];
  const active = (href: string) => path === href || path.startsWith(`${href}/`);
  const activeGroup = groups.find((group) => group.items.some((item) => active(item.href)))?.id ?? null;

  useEffect(() => {
    setOpenGroups(activeGroup ? [activeGroup] : []);
    setMobileOpen(false);
  }, [path, activeGroup]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = drawerRef.current;
    const first = dialog?.querySelector<HTMLElement>('button:not([disabled]), a[href]');
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMobileOpen(false); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
      const firstItem = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem?.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem?.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [mobileOpen]);

  const toggleGroup = (id: string) => setOpenGroups((current) => current.includes(id)
    ? current.filter((openId) => openId !== id)
    : [...current, id]);

  const desktopLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined}
        className="prospectra-nav-item flex items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 text-sm font-medium">
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const drawerLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined}
        onClick={() => setMobileOpen(false)} className="prospectra-mobile-menu-link flex items-center gap-3 px-3 py-2.5 text-sm">
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /><span className="flex-1">{item.label}</span>
        {active(item.href) && <span className="text-xs text-blue-200">Atual</span>}
      </Link>
    );
  };

  return (
    <>
      <aside className="prospectra-sidebar sticky top-0 hidden h-dvh w-[256px] shrink-0 flex-col border-r px-3 py-5 md:flex">
        <Link href="/painel" className="px-2" aria-label="Prospectra+ — Painel"><Logo size={50} motion="navigation" /></Link>
        <nav className="mt-7 flex min-h-0 flex-1 flex-col overflow-y-auto pb-3" aria-label="Navegação principal">
          <p className="px-3 pb-2 font-mono text-[9px] uppercase tracking-[.18em] text-white/38">Atalhos</p>
          <div className="grid gap-1">{primary.map(desktopLink)}</div>
          <p className="px-3 pb-2 pt-6 font-mono text-[9px] uppercase tracking-[.18em] text-white/38">Módulos</p>
          <div className="grid gap-1">
            {groups.map((group) => {
              const Icon = group.icon;
              const isOpen = openGroups.includes(group.id);
              const isCurrentGroup = group.items.some((item) => active(item.href));
              return (
                <section key={group.id}>
                  <button type="button" className="prospectra-section-toggle flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium"
                    aria-expanded={isOpen} aria-controls={`prospectra-nav-${group.id}`} onClick={() => toggleGroup(group.id)}>
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${isCurrentGroup ? 'text-blue-300' : ''}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {isOpen && <div id={`prospectra-nav-${group.id}`} className="prospectra-section-panel">{group.items.map(desktopLink)}</div>}
                </section>
              );
            })}
          </div>
        </nav>
        <div className="prospectra-sidebar-status mt-3">
          <p className="flex items-center gap-2 text-[11px] font-semibold"><span className={`h-1.5 w-1.5 rounded-full ${isDemo ? 'bg-violet-300' : 'bg-emerald-300'}`} />{isDemo ? 'Simulação ativa' : 'Modo assistido'}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">{isDemo ? 'Nada é enviado neste ambiente.' : 'Você revisa e aprova cada envio.'}</p>
        </div>
        <form action={logoutAction} className="mt-2">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/58 hover:bg-white/[.07] hover:text-white">
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" /> Sair
          </button>
        </form>
      </aside>

      <nav className="prospectra-mobile-nav fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around gap-1 px-2 pt-2 md:hidden" aria-label="Navegação rápida">
        {primary.map((item) => {
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium ${active(item.href) ? 'text-blue-200' : 'text-white/60'}`}>
            <Icon className="h-[19px] w-[19px]" aria-hidden="true" /><span className="truncate">{item.label}</span>
          </Link>;
        })}
        <button type="button" aria-expanded={mobileOpen} aria-controls="prospectra-mobile-drawer" aria-label={mobileOpen ? 'Fechar módulos' : 'Mais módulos'}
          onClick={() => setMobileOpen((open) => !open)} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium text-white/60 hover:text-white">
          {mobileOpen ? <X className="h-[19px] w-[19px]" aria-hidden="true" /> : <MoreHorizontal className="h-[19px] w-[19px]" aria-hidden="true" />}
          <span>{mobileOpen ? 'Fechar' : 'Mais'}</span>
        </button>
      </nav>

      {mobileOpen && (
        <div className="prospectra-mobile-drawer fixed inset-0 z-40 md:hidden">
          <button type="button" className="prospectra-mobile-backdrop absolute inset-0 h-full w-full" onClick={() => setMobileOpen(false)} aria-label="Fechar menu de módulos" />
          <section ref={drawerRef} id="prospectra-mobile-drawer" role="dialog" aria-modal="true" aria-labelledby="prospectra-mobile-title"
            className="absolute inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] max-h-[76dvh] overflow-y-auto rounded-t-[24px] border border-white/10 px-5 pb-5 pt-4 shadow-2xl">
            <header className="mb-3 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3"><LogoMark size={26} motion="navigation" /><div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-[.18em] text-blue-200/70">Navegação</p><h2 id="prospectra-mobile-title" className="mt-1 text-lg font-semibold text-white">Todas as áreas</h2></div></div>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" className="rounded-full border border-white/10 p-2 text-white/70 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </header>
            <div className="grid gap-5">
              {groups.map((group) => {
                const Icon = group.icon;
                return <section key={group.id} aria-labelledby={`mobile-group-${group.id}`}>
                  <h3 id={`mobile-group-${group.id}`} className="mb-1 flex items-center gap-2 px-3 font-mono text-[10px] uppercase tracking-[.12em] text-white/45"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{group.label}</h3>
                  <div className="grid gap-1">{group.items.map(drawerLink)}</div>
                </section>;
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

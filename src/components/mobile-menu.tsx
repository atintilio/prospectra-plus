'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const LINKS = [
  { href: '/', label: 'Início' },
  { href: '/login', label: 'Entrar' },
  { href: '/recuperar-senha', label: 'Recuperar senha' },
];

/** Menu circular mobile do hero de autenticação (hamburger + overlay clip-path). */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Trava o scroll do body enquanto aberto
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('menu-open');
    return () => document.body.classList.remove('menu-open');
  }, [open]);

  // Devolve o foco ao hamburger ao fechar (exceto no carregamento inicial)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (!open) btnRef.current?.focus({ preventScroll: true });
  }, [open]);

  // Fecha automaticamente quando a viewport volta ao desktop
  useEffect(() => {
    if (window.matchMedia('(min-width: 901px)').matches) return;
    const mq = window.matchMedia('(min-width: 901px)');
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) close(); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [close]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="auth-burger"
        aria-expanded={open}
        aria-controls="auth-menu"
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <i /><i /><i />
      </button>
      <div
        id="auth-menu"
        className="auth-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        data-open={open}
        aria-hidden={!open}
        inert={!open}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      >
        {LINKS.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            style={{ '--i': i } as React.CSSProperties}
            onClick={close}
            tabIndex={open ? 0 : -1}
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/login"
          data-cta="true"
          style={{ '--i': LINKS.length } as React.CSSProperties}
          onClick={close}
          tabIndex={open ? 0 : -1}
        >
          Entrar
        </Link>
      </div>
    </>
  );
}

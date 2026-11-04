'use client';
import {useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {logoutAction, touchSessionAction} from '@/app/(auth)/actions';
import {AVISO_MINUTOS_PADRAO, INTERVALO_PING_MS, MINUTOS_INATIVIDADE_PADRAO, segundosRestantes} from '@/lib/session-idle';

/**
 * Guarda de sessao:encerra o Prospectra depois de 15 minutos sem uso.
 *
 * Como funciona:
 * - o navegador conta o tempo de inatividade (teclado, mouse, rolagem, toque);
 * - enquanto a pessoa usa, ele manda uma "batida" para o servidor renovar a
 *   sessao (no maximo uma vez a cada 2 minutos);
 * - 2 minutos antes do prazo aparece um aviso discreto;
 * -ao estourar o prazo, a sessao e destruida no servidor (banco + cookie) e a
 *   pessoa volta para a tela de login.
 *
 * O servidor tambem enforce: a sessao sem batida expira sozinha.
 */
const ATIVIDADES = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'focus'] as const;

export function GuardaSessao({ minutos = MINUTOS_INATIVIDADE_PADRAO, avisoEmMinutos = AVISO_MINUTOS_PADRAO }: { minutos?: number; avisoEmMinutos?: number }) {
  const [restam, setRestam] = useState<number | null>(null);
  const ultimoUso = useRef(Date.now());
  const ultimoPing = useRef(0);
  const encerrando = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const limite = minutos * 60_000;
    const aviso = avisoEmMinutos * 60_000;
    const agora = () => Date.now();
    const marcar = () => { ultimoUso.current = agora(); };
    const ping = () => {
      const t = agora();
      if (t - ultimoPing.current < INTERVALO_PING_MS) return;
      ultimoPing.current = t;
      void touchSessionAction().catch(() => undefined);
    };
    const registrar = () => { marcar(); ping(); };
    for (const evento of ATIVIDADES) window.addEventListener(evento, registrar, { passive: true });
    const intervalo = window.setInterval(() => {
      const parado = agora() - ultimoUso.current;
      if (parado >= limite) {
        if (encerrando.current) return;
        encerrando.current = true;
        setRestam(0);
        void logoutAction().catch(() => router.replace('/login'));
        return;
      }
      setRestam(segundosRestantes(parado, limite, aviso));
    }, 1000);
    return () => {
      for (const evento of ATIVIDADES) window.removeEventListener(evento, registrar);
      window.clearInterval(intervalo);
    };
  }, [minutos, avisoEmMinutos, router]);

  if (restam === null) return null;
  const mm = String(Math.floor(restam / 60)).padStart(2, '0');
  const ss = String(restam % 60).padStart(2, '0');
  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl border border-border bg-white px-4 py-3 text-sm shadow-lg">
      <p className="font-medium text-text">Sua sessao encerra em {mm}:{ss}</p>
      <p className="mt-1 text-xs text-muted">Mexa em qualquer lugar para continuar com sessao aberta.</p>
    </div>
  );
}

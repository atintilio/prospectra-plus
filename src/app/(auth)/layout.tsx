import Image from 'next/image';
import Link from 'next/link';
import { MobileMenu } from '@/components/mobile-menu';

// Mídia cinematográfica (URLs exatas do design aprovado)
const VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260806_133255_956f653f-5d80-4b06-abd5-0f46c98b60fa.mp4';
const POSTER = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260806_132328_5f9029c8-218f-4489-82b6-29ff2849920e.png';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-hero">
      <link rel="preconnect" href="https://d8j0ntlcm91z4.cloudfront.net" />

      {/* Vídeo full-bleed + scrim (reduced-motion: poster via CSS) */}
      <div className="auth-hero__media" aria-hidden="true">
        <video autoPlay muted loop playsInline preload="auto" poster={POSTER} src={VIDEO} />
      </div>
      <div className="auth-hero__scrim" aria-hidden="true" />

      {/* Nav: símbolo + Prospectra abaixo (novo logo), chip original à direita, hamburger no mobile */}
      <header className="auth-nav">
        <Link href="/" className="auth-brand">
          <Image src="/logo-hero.png" alt="Prospectra" width={46} height={46} priority />
          <span className="auth-brand__word">Prospectra</span>
        </Link>
        <span className="auth-chip auth-chip--nav">
          <Image src="/argus-prime-logo.png" alt="Argus Prime" width={30} height={30} className="auth-chip__logo" />
          Uma ferramenta Argus Prime
        </span>
        <MobileMenu />
      </header>

      {/* Painel direito (central no mobile) — textos atuais preservados */}
      <section className="auth-body">
        <div className="auth-panel">
          <span className="auth-chip">
            Prospecção assistida por IA
          </span>
          <div className="auth-mark">
            <h1 className="auth-h1">
              Conexões que viram{' '}
              <span className="bg-gradient-to-r from-[#4f8bff] via-[#155dfc] to-[#7c3aed] bg-clip-text font-serif font-normal italic text-transparent">negócios</span>
            </h1>
          </div>
          <p className="auth-lede">
            Busca com IA, cadências no LinkedIn com mensagens personalizadas e um painel que mostra de onde vêm suas reuniões.
          </p>

          <div className="auth-formzone">{children}</div>
        </div>
      </section>

      {/* Rodapé legal — texto atual */}
      <footer className="auth-legal">
        <Image src="/argus-prime-logo.png" alt="" width={26} height={26} className="auth-legal__logo" aria-hidden="true" />
        © Argus Prime · Prospectra
      </footer>
    </main>
  );
}

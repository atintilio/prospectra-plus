import { Logo } from '@/components/logo';
import { AmbientVideo } from '@/components/ambient-video';
import { ProspectingMotion } from '@/components/prospecting-motion';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page auth-page-glass">
      <section className="auth-hero" id="home">
        <div className="auth-visual">
          <AmbientVideo className="auth-hero-video" />
          <div className="auth-visual-content">
            <header className="auth-nav">
              <a className="auth-brand" href="#home" aria-label="Prospectra+ — início"><Logo size={56} dark /></a>
              <span className="auth-brand-chip">Prospecção consultiva com IA</span>
            </header>
            <div className="auth-hero-layout">
              <div className="auth-hero-copy">
                <p className="auth-kicker">O sinal vem primeiro. A relação, sempre humana.</p>
                <h1>A próxima conversa começa antes do primeiro <span>“oi”.</span></h1>
                <p>O Prospectra+ transforma sinais de mercado em contexto e timing para uma abordagem relevante — sem scripts genéricos. Sua equipe conduz a relação.</p>
              </div>
              <ProspectingMotion />
            </div>
          </div>
        </div>
        <div className="auth-login-panel">
          <div className="auth-login-card">{children}</div>
        </div>
      </section>
      <footer id="contact" className="auth-footer">© Argus Prime · Prospectra+</footer>
    </main>
  );
}

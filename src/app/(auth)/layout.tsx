'use client';

import { useEffect, useState } from 'react';

const heroVideo = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260823_050407_500d0339-ab28-41c1-9688-132a74a3b5aa.mp4';
const aboutVideo = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260823_063501_2e2c8971-de1e-473a-8611-a0c9ae7ee186.mp4';

function useVideoRetry() {
  useEffect(() => {
    const play = () => document.querySelectorAll<HTMLVideoElement>('[data-autoplay]').forEach((video) => { video.muted = true; void video.play().catch(() => undefined); });
    play();
    const timer = window.setInterval(play, 1000);
    document.addEventListener('click', play, { once: true });
    document.addEventListener('touchstart', play, { once: true });
    return () => { window.clearInterval(timer); document.removeEventListener('click', play); document.removeEventListener('touchstart', play); };
  }, []);
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useVideoRetry();
  const closeMenu = () => setMenuOpen(false);
  return <main className="auth-page">
    <section className="auth-hero" id="home">
      <video className="auth-hero-video" data-autoplay autoPlay muted loop playsInline preload="auto" src={heroVideo} aria-hidden="true" />
      <div className="auth-hero-scrim" aria-hidden="true" />
      <header className="auth-nav">
        <a className="auth-brand" href="#home"><span className="auth-brand-mark"><i /></span><span>prospectra</span></a>
        <nav className={menuOpen ? 'auth-links auth-links-open' : 'auth-links'} aria-label="Navegação principal"><a href="#home" onClick={closeMenu}>HOME</a><a href="#about" onClick={closeMenu}>ABOUT</a><a href="#contact" onClick={closeMenu}>CONTACT US</a></nav>
        <button className="auth-menu-toggle" type="button" aria-expanded={menuOpen} aria-label="Abrir menu" onClick={() => setMenuOpen((open) => !open)}><span /><span /><span /></button>
        <a className="auth-contact" href="#contact">CONTACT US <span aria-hidden="true">↗</span></a>
      </header>
      <div className="auth-hero-grid"><div className="auth-hero-copy"><p className="auth-kicker">PROSPECÇÃO ASSISTIDA POR IA</p><h1>SCALING<br />THE<br />PLATFORM<br /><span>FOR</span><br /><span>YOUR</span><br /><span className="auth-accent">BUSINESS</span></h1><a className="auth-cta" href="#about">GET STARTED <b aria-hidden="true" /></a></div><div className="auth-login-card">{children}</div></div>
    </section>
    <section className="auth-about" id="about"><div className="auth-about-copy"><h2>ABOUT<br /><span>PROSPECTRA</span></h2><p>O Prospectra transforma relacionamento em oportunidade. Da busca inteligente às cadências personalizadas, sua equipe encontra os contatos certos, entende o contexto e conduz cada conversa até a reunião.</p><a className="auth-cta" href="#contact">LEARN MORE <b aria-hidden="true" /></a></div><div className="auth-about-media"><video data-autoplay autoPlay muted loop playsInline preload="auto" src={aboutVideo} aria-label="Demonstração visual do Prospectra" /><div aria-hidden="true" /></div></section>
    <footer id="contact" className="auth-footer">© Argus Prime · Prospectra</footer>
  </main>;
}

import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Sora, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Tipografia do redesign (variável = todos os pesos):
// Sora nos títulos · JetBrains Mono nos rótulos/chips — em todas as páginas
const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Prospectra', template: '%s · Prospectra' },
  description: 'Prospecção inteligente no LinkedIn para parceiros Argus Prime.',
  icons: { icon: '/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable} ${sora.variable} ${jbMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

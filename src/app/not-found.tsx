import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <Link href="/painel" className="btn-primary mt-4">Voltar ao painel</Link>
    </main>
  );
}

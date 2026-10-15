import Link from 'next/link';
import { Logo } from '@/components/logo';
import { logoutAction } from '../(auth)/actions';

export default function SemEquipe() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold">Você ainda não faz parte de uma equipe</h1>
      <p className="max-w-sm text-sm text-muted">Peça ao responsável do seu parceiro, ou à Argus Prime, para adicionar seu e-mail.</p>
      <form action={logoutAction}><button className="btn-outline">Sair</button></form>
      <Link href="/painel" className="text-sm text-accent">Tentar de novo</Link>
    </main>
  );
}

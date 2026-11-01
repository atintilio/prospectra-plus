import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { LinkedInMark } from '@/components/linkedin-mark';
import { AccountForm } from './form';

export const metadata = { title: 'Minha conta' };

export default async function ContaPage() {
  const { user } = await requireUser();
  return (
    <>
      <PageHeader title="Minha conta" subtitle="Seus dados e os limites que protegem sua conta do LinkedIn." />
      <AccountForm me={{ name: user.name, email: user.email, linkedinUrl: user.linkedinUrl, dailyInvites: user.dailyInvites, dailyMessages: user.dailyMessages }} />
      <section className="card mt-6 max-w-2xl p-6" aria-labelledby="integracoes">
        <h2 id="integracoes" className="text-base font-semibold">Integrações</h2>
        <Link href="/linkedin" className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 hover:border-accent/40">
          <LinkedInMark size={36} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">LinkedIn</span>
            <span className="block text-xs text-muted">Conecte a sua conta para o piloto automático escrever com a sua identidade.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}

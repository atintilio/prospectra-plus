import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { AccountForm } from './form';
import { LinkedInShortcut } from './linkedin-shortcut';
import { WhatsAppShortcut } from './whatsapp-shortcut';

export const metadata = { title: 'Minha conta' };

export default async function ContaPage() {
  const { user } = await requireUser();
  return (
    <>
      <PageHeader title="Minha conta" subtitle="Seus dados e os limites que protegem sua conta do LinkedIn." />
      <AccountForm me={{ name: user.name, email: user.email, linkedinUrl: user.linkedinUrl, dailyInvites: user.dailyInvites, dailyMessages: user.dailyMessages }} />
      <section className="card mt-6 max-w-2xl p-6" aria-labelledby="integracoes">
        <h2 id="integracoes" className="text-base font-semibold">Integrações</h2>
        <LinkedInShortcut />
        <WhatsAppShortcut />
      </section>
    </>
  );
}

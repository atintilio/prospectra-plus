import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { AccountForm } from './form';

export const metadata = { title: 'Minha conta' };

export default async function ContaPage() {
  const { user } = await requireUser();
  return (
    <>
      <PageHeader title="Minha conta" subtitle="Seus dados e os limites que protegem sua conta do LinkedIn." />
      <AccountForm me={{ name: user.name, email: user.email, linkedinUrl: user.linkedinUrl, dailyInvites: user.dailyInvites, dailyMessages: user.dailyMessages }} />
    </>
  );
}

import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { LinkedInView } from './linkedin-view';

export const metadata = { title: 'LinkedIn' };

export default async function LinkedInPage() {
  const { org } = await requireOrg();
  return (
    <>
      <PageHeader
        eyebrow="Integrações"
        title="LinkedIn"
        subtitle="Conecte a sua conta do LinkedIn para o piloto automático escrever com a sua identidade."
      />
      <LinkedInView demo={org.isDemo} />
    </>
  );
}

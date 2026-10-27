import { getDb } from '@/db';
import { PageHeader } from '@/components/ui';
import { requireOrg } from '@/lib/auth';
import { listLeadCommunicationProfiles } from '@/lib/communication';
import { CommunicationView } from './view';

export const metadata = { title: 'Perfil de comunicação' };

export default async function CommunicationPage() {
  const ctx = await requireOrg();
  if (!ctx.org.active) return <p className="text-danger">Esta operação está inativa.</p>;
  const leads = await listLeadCommunicationProfiles(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id });
  return <>
    <PageHeader title="Perfil de comunicação" subtitle="Registre preferências e prepare abordagens com base no que você observou ou no que foi informado." />
    <CommunicationView leads={leads.map((lead) => ({
      ...lead,
      profile: lead.profile ? { ...lead.profile, assessedAt: lead.profile.assessedAt.toISOString() } : null,
    }))} />
  </>;
}

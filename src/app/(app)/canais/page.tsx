import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { akgConfig } from '@/lib/whatsapp/akg';
import { LinkedInView } from '../linkedin/linkedin-view';
import { WhatsAppView } from '../whatsapp/view';

export const metadata = { title: 'Canais linkados' };

export default async function CanaisPage() {
  const { org, user } = await requireOrg();
  const whatsappEnabled = org.active && (!!akgConfig() || org.isDemo);
  return (
    <>
      <PageHeader title="Canais linkados" subtitle="Conecte e gerencie suas contas em um só lugar." />
      <nav aria-label="Escolha um canal" className="mb-8 grid gap-3 sm:grid-cols-3">
        {['LinkedIn', 'WhatsApp', 'Office 365'].map((name, index) => (
          <a key={name} href={`#canal-${index}`} className="btn-primary min-h-16 justify-center text-base">{name}</a>
        ))}
      </nav>
      <section id="canal-0" className="scroll-mt-6 mb-10" aria-labelledby="linkedin-title">
        <h2 id="linkedin-title" className="mb-4 text-xl font-semibold">LinkedIn</h2>
        <LinkedInView demo={org.isDemo} />
      </section>
      <section id="canal-1" className="scroll-mt-6 mb-10" aria-labelledby="whatsapp-title">
        <h2 id="whatsapp-title" className="mb-4 text-xl font-semibold">WhatsApp</h2>
        <WhatsAppView enabled={whatsappEnabled} seller={user.name || user.email}
          reason={org.isDemo ? 'Conexão simulada: nenhum número real é conectado.' : !org.active ? 'Esta operação está inativa.' : !whatsappEnabled ? 'Conexão temporariamente indisponível. Entre em contato com o administrador.' : undefined} />
      </section>
      <section id="canal-2" className="card scroll-mt-6 p-6" aria-labelledby="office-title">
        <h2 id="office-title" className="text-xl font-semibold">Office 365</h2>
        <p className="mt-3 text-sm text-muted">O vínculo individual da sua conta de e-mail ainda não está disponível.</p>
      </section>
    </>
  );
}

import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { akgConfig } from '@/lib/whatsapp/akg';
import { LinkedInView } from '../linkedin/linkedin-view';
import { WhatsAppView } from '../whatsapp/view';
import { Office365Connection } from '@/components/office365-connection';

export const metadata = { title: 'Canais linkados' };

export default async function CanaisPage() {
  const { org, user } = await requireOrg();
  const whatsappEnabled = org.active && (!!akgConfig() || org.isDemo);
  return (
    <>
      <PageHeader title="Canais linkados" subtitle="Conecte e gerencie suas contas em um só lugar." />
      <nav aria-label="Escolha um canal" className="mb-8 grid gap-3 sm:grid-cols-3">
        {[
          { name: 'LinkedIn', id: 'canal-0' },
          { name: 'WhatsApp', id: 'canal-1' },
          { name: 'Office 365', id: 'canal-2' },
        ].map(({ name, id }) => (
          <a key={id} href={`#${id}`} className="btn-primary min-h-16 justify-center text-base">{name}</a>
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
      <div id="canal-2" className="scroll-mt-6 mb-10">
        <Office365Connection />
      </div>
    </>
  );
}

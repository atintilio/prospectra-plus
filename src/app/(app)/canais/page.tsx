import { requireOrg } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { akgConfig } from '@/lib/whatsapp/akg';
import { LinkedInView } from '../linkedin/linkedin-view';
import { WhatsAppView } from '../whatsapp/view';
import { Office365Connection } from '@/components/office365-connection';
import { LinkedInMark, LINKEDIN_BRAND_BUTTON_CLASS } from '@/components/linkedin-mark';
import { WhatsAppMark } from '@/components/whatsapp-mark';
import { Office365Mark } from '@/components/office365-mark';

export const metadata = { title: 'Canais linkados' };

export default async function CanaisPage() {
  const { org, user } = await requireOrg();
  const whatsappEnabled = org.active && (!!akgConfig() || org.isDemo);
  return (
    <>
      <PageHeader title="Canais linkados" subtitle="Conecte e gerencie suas contas em um só lugar." />
      <nav aria-label="Escolha um canal" className="mb-8 grid gap-3 sm:grid-cols-3">
        <a href="#canal-0" className={`${LINKEDIN_BRAND_BUTTON_CLASS} min-h-16 text-base`}><LinkedInMark size={22} decorative />LinkedIn</a>
        <a href="#canal-1" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl bg-[#075E54] px-4 py-2 text-base font-medium text-white shadow-sm transition-colors hover:bg-[#064E46] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#075E54] focus-visible:ring-2 focus-visible:ring-white"><span aria-hidden="true"><WhatsAppMark size={22} /></span>WhatsApp</a>
        <a href="#canal-2" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl bg-[#D83B01] px-4 py-2 text-base font-medium text-white shadow-sm transition-colors hover:bg-[#B73201] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D83B01] focus-visible:ring-2 focus-visible:ring-white"><Office365Mark size={22} />Office 365</a>
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

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

const groups = [
  {
    title: 'Encontrar',
    links: [
      { href: '/leads', label: 'Leads' },
      { href: '/inteligencia', label: 'Inteligência comercial' },
      { href: '/projetos', label: 'Projetos' },
    ],
  },
  {
    title: 'Conversar',
    links: [
      { href: '/campanhas', label: 'Campanhas' },
      { href: '/comunicacao', label: 'Perfil de comunicação' },
      { href: '/whatsapp', label: 'WhatsApp' },
    ],
  },
  {
    title: 'Acompanhar',
    links: [
      { href: '/fila', label: 'Fila do dia' },
      { href: '/suporte', label: 'Suporte' },
      { href: '/ajuda', label: 'Central de ajuda' },
    ],
  },
];

export function SuiteExplorer() {
  return (
    <section className="suite-explorer mt-8" aria-labelledby="suite-explorer-title">
      <div className="suite-explorer-intro">
        <p className="suite-explorer-eyebrow">Uma trilha, da descoberta à relação</p>
        <h2 id="suite-explorer-title">Chegue com contexto. Saia com um próximo passo.</h2>
        <p>Pesquisa, abordagem e acompanhamento no mesmo fluxo. A IA amplia o contexto; sua equipe conduz a conversa.</p>
        <Link href="/inteligencia" className="btn-primary mt-5 inline-flex items-center gap-2">
          Abrir Inteligência Comercial <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="suite-explorer-links">
        {groups.map((group) => (
          <section key={group.title} className="suite-explorer-group" aria-labelledby={`suite-group-${group.title.toLowerCase()}`}>
            <h3 id={`suite-group-${group.title.toLowerCase()}`}>{group.title}</h3>
            <ul>
              {group.links.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}><span>{item.label}</span><ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

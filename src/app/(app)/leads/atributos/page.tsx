import { SlidersHorizontal } from 'lucide-react';
import { requireOrg } from '@/lib/auth';
import { listAttributeDefs } from '@/lib/lead-attributes';
import { PageHeader, Card } from '@/components/ui';
import { AttributeForm, AttributeList } from './forms';

export const metadata = { title: 'Campos personalizados' };

export default async function AtributosPage() {
  const ctx = await requireOrg();
  const defs = await listAttributeDefs(ctx.org.id);

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Campos personalizados"
        subtitle="Crie os campos que a sua operação usa além do padrão — e segmente os leads por eles."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Novo campo" icon={SlidersHorizontal}>
          <AttributeForm />
        </Card>
        <Card title="Campos da operação">
          <AttributeList
            defs={defs.map((d) => ({
              id: d.id,
              name: d.name,
              key: d.key,
              type: d.type,
              options: d.options as string[],
              required: d.required,
            }))}
          />
        </Card>
      </div>
    </>
  );
}

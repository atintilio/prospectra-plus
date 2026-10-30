import { Mic, ShieldCheck, Waves } from 'lucide-react';
import { requireOrg } from '@/lib/auth';
import { getDb, schema } from '@/db';
import { and, eq } from 'drizzle-orm';
import { voiceConfig } from '@/lib/voice/voicestudio';
import { PageHeader, Card, Empty } from '@/components/ui';
import { VoiceCloneForm, VoiceDropzoneHint } from './voice-view';

export const metadata = { title: 'Minha voz' };

export default async function VozPage() {
  const ctx = await requireOrg();
  const db = await getDb();
  const config = voiceConfig();
  const available = !!config && ctx.org.active && ctx.org.aiEnabled && !ctx.org.isDemo;
  const [profile] = await db.select().from(schema.voiceProfiles)
    .where(and(eq(schema.voiceProfiles.orgId, ctx.org.id), eq(schema.voiceProfiles.userId, ctx.user.id)));

  return (
    <>
      <PageHeader
        eyebrow="Voz"
        title="Minha voz clonada"
        subtitle="Grave uma amostra e crie um perfil de voz com a sua timbre. Ele fica vinculado só à sua conta, nesta operação."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Criar o perfil de voz" icon={Mic}>
          <VoiceCloneForm available={available} hasProfile={profile?.enabled === true} />
          <div className="mt-4 border-t border-border pt-4">
            <VoiceDropzoneHint />
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Situação" icon={Waves}>
            {profile?.enabled ? (
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  Perfil ativo e vinculado a esta conta
                </li>
                <li className="text-xs text-muted">Motor: {profile.engine}</li>
                <li className="text-xs text-muted">
                  Autorização registrada em {new Date(profile.consentAt).toLocaleString('pt-BR')}
                </li>
              </ul>
            ) : (
              <Empty
                icon={Mic}
                title="Nenhum perfil de voz ainda"
                text="Envie uma gravação sua e o Prospectra cria o perfil. Você pode substituir quando quiser."
              />
            )}
          </Card>

          <Card title="Como o envio funciona" icon={ShieldCheck}>
            <ul className="space-y-2 text-sm text-muted">
              <li>1. Você grava e autoriza o uso da sua voz.</li>
              <li>2. O motor cria o perfil (clonagem) na sua conta.</li>
              <li>3. Ao pedir um áudio na aba WhatsApp, a mensagem entra na fila.</li>
              <li>4. O executor gera o áudio com a sua voz e envia pelo seu WhatsApp.</li>
            </ul>
            <p className="mt-3 text-xs text-muted">
              O envio automático continua desligado até você validar a voz à mão.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

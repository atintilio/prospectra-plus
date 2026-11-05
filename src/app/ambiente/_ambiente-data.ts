// Dados da tela de escolha de ambiente.
//
// Leitura real do banco: nada aqui é inventado. Se um ambiente ainda não
// existe para a conta (a demonstração é criada só quando o usuário entra),
// as métricas vêm zeradas e a interface diz isso.
//
// Este módulo é compartilhado pelas três variações da tela
// (`_variante-a.tsx`, `_variante-b.tsx`, `_variante-c.tsx`): as variações
// mudam a apresentação, nunca os dados.

import 'server-only';

import { and, count, eq } from 'drizzle-orm';
import { getReadDb, schema, type DB } from '@/db';
import type { Ctx } from '@/lib/auth';
import { akgConfig, AkgGateway } from '@/lib/whatsapp/akg';
import { voiceConfig } from '@/lib/voice/voicestudio';
import { isLinkedInConfigured } from '@/lib/linkedin/connection';
import { displayOrgName } from '@/lib/demo-name';

export type EnvKey = 'prod' | 'demo';
export type IntegrationKey = 'whatsapp' | 'linkedin' | 'voz';

/** Estado de uma integração. `simulado` = a demo nunca chama serviço real. */
export type IntegrationState = {
  key: IntegrationKey;
  state: 'ligado' | 'desligado' | 'simulado' | 'sem-conta' | 'nao-configurado' | 'indisponivel';
  label: string;
  detail: string;
};

export type EnvMetrics = {
  leads: number;
  campaigns: number;
  meetings: number;
  team: number;
};

export type EnvInfo = {
  key: EnvKey;
  title: string;
  tagline: string;
  /** null = ainda não existe uma operação deste ambiente para esta conta. */
  orgId: string | null;
  orgName: string | null;
  exists: boolean;
  metrics: EnvMetrics;
  integrations: IntegrationState[];
};

export type AmbienteData = {
  /** Ambiente da sessão agora (null = nenhum ambiente selecionado). */
  currentEnv: EnvKey | null;
  currentOrgName: string | null;
  firstName: string;
  prod: EnvInfo;
  demo: EnvInfo;
};

type OrgRow = {
  id: string;
  name: string;
  isDemo: boolean;
  active: boolean;
  aiEnabled: boolean;
  linkedinEnabled: boolean;
};

const PROD_TAGLINE = 'Sua operação real: leads, cadências e a fila do dia de verdade.';
const DEMO_TAGLINE = 'Um caso fictício completo para mostrar a parceiros. Nada é enviado de verdade.';

/** Operação de produção visível para a conta (admin vê a primeira; usuário, a sua). */
async function findProdOrg(db: DB, ctx: Ctx): Promise<OrgRow | null> {
  const cols = {
    id: schema.orgs.id,
    name: schema.orgs.name,
    isDemo: schema.orgs.isDemo,
    active: schema.orgs.active,
    aiEnabled: schema.orgs.aiEnabled,
    linkedinEnabled: schema.orgs.linkedinEnabled,
  };
  if (ctx.user.platformRole === 'admin') {
    const rows = await db
      .select(cols)
      .from(schema.orgs)
      .where(eq(schema.orgs.isDemo, false))
      .orderBy(schema.orgs.createdAt)
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .select(cols)
    .from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(
      and(
        eq(schema.memberships.userId, ctx.user.id),
        eq(schema.orgs.isDemo, false),
        eq(schema.orgs.active, true),
      ),
    )
    .orderBy(schema.memberships.createdAt)
    .limit(1);
  return rows[0] ?? null;
}

/** Demonstração desta conta (pode ainda não existir: ela nasce ao entrar). */
async function findDemoOrg(db: DB, ctx: Ctx): Promise<OrgRow | null> {
  const rows = await db
    .select({
      id: schema.orgs.id,
      name: schema.orgs.name,
      isDemo: schema.orgs.isDemo,
      active: schema.orgs.active,
      aiEnabled: schema.orgs.aiEnabled,
      linkedinEnabled: schema.orgs.linkedinEnabled,
    })
    .from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(and(eq(schema.memberships.userId, ctx.user.id), eq(schema.orgs.isDemo, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** Contadores reais da operação. Sem operação = tudo zero. */
async function metricsOf(db: DB, orgId: string): Promise<EnvMetrics> {
  const [leads, campaigns, meetings, team] = await Promise.all([
    db.select({ n: count() }).from(schema.leads).where(eq(schema.leads.orgId, orgId)),
    db.select({ n: count() }).from(schema.campaigns).where(eq(schema.campaigns.orgId, orgId)),
    db.select({ n: count() }).from(schema.meetings).where(eq(schema.meetings.orgId, orgId)),
    db.select({ n: count() }).from(schema.memberships).where(eq(schema.memberships.orgId, orgId)),
  ]);
  return {
    leads: leads[0]?.n ?? 0,
    campaigns: campaigns[0]?.n ?? 0,
    meetings: meetings[0]?.n ?? 0,
    team: team[0]?.n ?? 0,
  };
}

/** Não deixa a tela de ambiente pendurar esperando o gateway. */
async function withTimeout<T>(pending: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function whatsappIntegration(ctx: Ctx, org: OrgRow | null): Promise<IntegrationState> {
  if (!org) {
    return {
      key: 'whatsapp',
      state: 'desligado',
      label: 'Sem operação',
      detail: 'Nenhuma operação de produção vinculada a esta conta.',
    };
  }
  if (org.isDemo) {
    return {
      key: 'whatsapp',
      state: 'simulado',
      label: 'Simulado',
      detail: 'A demonstração não pareia números reais: nenhuma mensagem é enviada.',
    };
  }
  if (!org.active) {
    return { key: 'whatsapp', state: 'desligado', label: 'Inativo', detail: 'Esta operação está inativa.' };
  }
  const cfg = akgConfig();
  if (!cfg) {
    return {
      key: 'whatsapp',
      state: 'nao-configurado',
      label: 'Não configurado',
      detail: 'O gateway WA-AKG ainda não foi configurado pelo administrador.',
    };
  }
  try {
    const status = await withTimeout(
      new AkgGateway(cfg).status({ orgId: org.id, userId: ctx.user.id }),
      4000,
    );
    if (status.state === 'connected') {
      return {
        key: 'whatsapp',
        state: 'ligado',
        label: 'Ligado',
        detail: status.phone ? `Número +${status.phone} conectado.` : 'Número conectado.',
      };
    }
    if (status.state === 'connecting' || status.state === 'qr_ready') {
      return {
        key: 'whatsapp',
        state: 'desligado',
        label: 'Aguardando pareamento',
        detail: 'O pareamento do número ainda não foi concluído.',
      };
    }
    return {
      key: 'whatsapp',
      state: 'desligado',
      label: 'Desligado',
      detail: 'Nenhum número conectado nesta operação.',
    };
  } catch {
    return {
      key: 'whatsapp',
      state: 'indisponivel',
      label: 'Indisponível',
      detail: 'O gateway WA-AKG não respondeu agora.',
    };
  }
}

async function linkedinIntegration(db: DB, org: OrgRow | null): Promise<IntegrationState> {
  if (!org) {
    return {
      key: 'linkedin',
      state: 'desligado',
      label: 'Sem operação',
      detail: 'Nenhuma operação de produção vinculada a esta conta.',
    };
  }
  const [connection] = await db
    .select({ status: schema.linkedinConnections.status, profileName: schema.linkedinConnections.profileName })
    .from(schema.linkedinConnections)
    .where(eq(schema.linkedinConnections.orgId, org.id))
    .limit(1);
  if (org.isDemo) {
    return {
      key: 'linkedin',
      state: 'simulado',
      label: 'Simulado',
      detail: connection?.profileName
        ? `Conta simulada de ${connection.profileName}: nada é enviado ao LinkedIn.`
        : 'Conta simulada: nada é enviado ao LinkedIn.',
    };
  }
  if (!org.linkedinEnabled) {
    return {
      key: 'linkedin',
      state: 'desligado',
      label: 'Desligado',
      detail: 'O piloto automático de LinkedIn não foi liberado nesta operação.',
    };
  }
  if (!isLinkedInConfigured()) {
    return {
      key: 'linkedin',
      state: 'nao-configurado',
      label: 'Configuração pendente',
      detail: 'O aplicativo do LinkedIn ainda não cadastrou as credenciais.',
    };
  }
  if (!connection || connection.status !== 'connected') {
    return {
      key: 'linkedin',
      state: 'sem-conta',
      label: 'Sem conta',
      detail: 'Nenhum vendedor conectou a conta do LinkedIn nesta operação.',
    };
  }
  return {
    key: 'linkedin',
    state: 'ligado',
    label: 'Ligado',
    detail: `Conta de ${connection.profileName || 'um vendedor'} conectada.`,
  };
}

async function voiceIntegration(db: DB, ctx: Ctx, org: OrgRow | null): Promise<IntegrationState> {
  if (!org) {
    return {
      key: 'voz',
      state: 'desligado',
      label: 'Sem operação',
      detail: 'Nenhuma operação de produção vinculada a esta conta.',
    };
  }
  if (org.isDemo) {
    return {
      key: 'voz',
      state: 'simulado',
      label: 'Simulado',
      detail: 'A voz da demonstração é simulada: nenhum áudio real é gerado.',
    };
  }
  if (!voiceConfig()) {
    return {
      key: 'voz',
      state: 'nao-configurado',
      label: 'Não configurado',
      detail: 'O motor de voz ainda não foi instalado pelo administrador.',
    };
  }
  if (process.env.VOICE_AUTOMATION_ENABLED !== 'true') {
    return {
      key: 'voz',
      state: 'desligado',
      label: 'Desligado',
      detail: 'O envio automático de voz está desligado nesta instalação.',
    };
  }
  if (!org.aiEnabled) {
    return { key: 'voz', state: 'desligado', label: 'Desligado', detail: 'A IA está desligada nesta operação.' };
  }
  if (!org.active) {
    return { key: 'voz', state: 'desligado', label: 'Desligado', detail: 'Esta operação está inativa.' };
  }
  const [profile] = await db
    .select({ enabled: schema.voiceProfiles.enabled })
    .from(schema.voiceProfiles)
    .where(and(eq(schema.voiceProfiles.orgId, org.id), eq(schema.voiceProfiles.userId, ctx.user.id)))
    .limit(1);
  return {
    key: 'voz',
    state: 'ligado',
    label: 'Ligado',
    detail: profile?.enabled
      ? 'Motor ativo e perfil de voz do dono cadastrado.'
      : 'Motor ativo; falta o perfil de voz do dono.',
  };
}

async function buildEnv(db: DB, ctx: Ctx, key: EnvKey, org: OrgRow | null): Promise<EnvInfo> {
  const isDemo = key === 'demo';
  // Métricas e integrações não se dependem uma da outra (só do `org`), então
  // saem na mesma leva: o driver HTTP de leitura as roda em paralelo real.
  const [whatsapp, linkedin, voz, metrics] = await Promise.all([
    whatsappIntegration(ctx, org),
    linkedinIntegration(db, org),
    voiceIntegration(db, ctx, org),
    org ? metricsOf(db, org.id) : Promise.resolve<EnvMetrics>({ leads: 0, campaigns: 0, meetings: 0, team: 0 }),
  ]);
  return {
    key,
    title: isDemo ? 'Demonstração' : 'Produção',
    tagline: isDemo ? DEMO_TAGLINE : PROD_TAGLINE,
    orgId: org?.id ?? null,
    // Na demonstração o nome exibido é o rótulo genérico: o nome fictício da
    // empresa fica no banco, mas não aparece para a pessoa.
    orgName: org ? displayOrgName(org) : null,
    exists: Boolean(org),
    metrics,
    integrations: [whatsapp, linkedin, voz],
  };
}

/** Carrega tudo que a tela de ambiente mostra, a partir da sessão e do banco. */
export async function loadAmbiente(ctx: Ctx): Promise<AmbienteData> {
  const db = await getReadDb();
  const [prodOrg, demoOrg] = await Promise.all([findProdOrg(db, ctx), findDemoOrg(db, ctx)]);
  const [prod, demo] = await Promise.all([
    buildEnv(db, ctx, 'prod', prodOrg),
    buildEnv(db, ctx, 'demo', demoOrg),
  ]);
  const currentEnv: EnvKey | null = ctx.org ? (ctx.org.isDemo ? 'demo' : 'prod') : null;
  return {
    currentEnv,
    currentOrgName: ctx.org ? displayOrgName(ctx.org) : null,
    firstName: (ctx.user.name || '').split(' ')[0] ?? '',
    prod,
    demo,
  };
}

// Estado da conexão do LinkedIn por usuário.
//
// O app só orquestra: o segredo do OIDC fica no servidor. A tela precisa
// explicar, em português, o que cada status significa para o vendedor — por isso
// o mapeamento (status -> rótulo/tom) vive aqui, compartilhado entre a UI e os
// testes.

export const LINKEDIN_STATUSES = ['disconnected', 'authenticated', 'configuration_required', 'unavailable'] as const;
export type LinkedInStatus = (typeof LINKEDIN_STATUSES)[number];

export type LinkedInTone = 'neutral' | 'good' | 'warn' | 'danger';

export type LinkedInProfile = {
  name: string;
  email?: string | null;
  connectedAt?: string | null;
};

export type LinkedInConnection = {
  status: LinkedInStatus;
  profile?: LinkedInProfile | null;
  /** Mensagem do servidor (ex.: o que falta na configuração). */
  message?: string | null;
  /** Itens de configuração ausentes, quando o servidor informa. */
  missing?: string[] | null;
};

export type LinkedInStatusView = {
  status: LinkedInStatus;
  label: string;
  tone: LinkedInTone;
  hint: string;
};

/**
 * Símbolo do selo de estado: a marca oficial do LinkedIn (o quadrado azul
 * #0A66C2). O azul da marca identifica a fonte externa em qualquer tom.
 */
export type LinkedInStatusSymbol = 'linkedin';

/**
 * Vista do selo de estado (view pura, sem JSX): rótulo + tom + símbolo.
 * Usada pela tela e pelos selos (mesma fonte de verdade em toda a interface).
 */
export type LinkedInStatusBadgeView = LinkedInStatusView & {
  /** Símbolo do selo (a marca oficial). */
  symbol: LinkedInStatusSymbol;
  /** Classes do selo: fundo/texto do tom + moldura na cor oficial da marca. */
  className: string;
};

/** Rótulo, tom e explicação de cada estado. */
export const LINKEDIN_STATUS_VIEW: Record<LinkedInStatus, { label: string; tone: LinkedInTone; hint: string }> = {
  disconnected: {
    label: 'Não conectado',
    tone: 'neutral',
    hint: 'Conecte a sua conta do LinkedIn para o piloto automático escrever com a sua identidade.',
  },
  authenticated: {
    label: 'Conta conectada',
    tone: 'good',
    hint: 'Esta conta do LinkedIn está conectada ao Prospectra.',
  },
  configuration_required: {
    label: 'Configuração pendente',
    tone: 'warn',
    hint: 'O aplicativo do LinkedIn ainda não foi liberado nesta instalação. Fale com o administrador.',
  },
  unavailable: {
    label: 'Indisponível',
    tone: 'danger',
    hint: 'Não foi possível falar com o LinkedIn agora. Tente de novo em alguns minutos.',
  },
};

/** O que falta para a conexão OIDC funcionar (nunca mostra valores, só nomes). */
export const LINKEDIN_CONFIG_ITEMS = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'];

/** Classe do selo de status, por tom. */
export const LINKEDIN_TONE_CLASS: Record<LinkedInTone, string> = {
  neutral: 'bg-surface text-muted',
  good: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  danger: 'bg-red-50 text-danger',
};

const isStatus = (value: unknown): value is LinkedInStatus =>
  typeof value === 'string' && (LINKEDIN_STATUSES as readonly string[]).includes(value);

/** Normaliza o que veio da API (status desconhecido vira "indisponível"). */
export function normalizeLinkedInStatus(value: unknown): LinkedInStatus {
  return isStatus(value) ? value : 'unavailable';
}

/**
 * Estado da conexão pronto para a tela: status normalizado + rótulo, tom e
 * explicação. Status desconhecido nunca "finge" estar conectado.
 */
export function describeLinkedInStatus(value: unknown): LinkedInStatusView {
  const status = normalizeLinkedInStatus(value);
  const view = LINKEDIN_STATUS_VIEW[status];
  return { status, label: view.label, tone: view.tone, hint: view.hint };
}

/**
 * Selo reutilizável de estado: rótulo, tom e símbolo.
 *
 * O símbolo é sempre a marca oficial do LinkedIn — o azul #0A66C2 identifica a
 * fonte externa, mesmo quando o tom do estado pede atenção (pendente) ou erro
 * (indisponível).
 */
export function linkedInStatusBadge(value: unknown): LinkedInStatusBadgeView {
  const view = describeLinkedInStatus(value);
  return {
    ...view,
    symbol: 'linkedin',
    className: `${LINKEDIN_TONE_CLASS[view.tone]} border border-[#0A66C2]/25`,
  };
}

/** Normaliza a resposta da API de conexão. */
export function normalizeLinkedInConnection(data: unknown): LinkedInConnection {
  const raw = (data ?? {}) as Partial<LinkedInConnection> & { profile?: Partial<LinkedInProfile> | null };
  const profile = raw.profile
    ? {
        name: String(raw.profile.name ?? ''),
        email: raw.profile.email ?? null,
        connectedAt: raw.profile.connectedAt ?? null,
      }
    : null;
  return {
    status: normalizeLinkedInStatus(raw.status),
    profile,
    message: raw.message ?? null,
    missing: raw.missing ?? null,
  };
}

/** Data da conexão em português (aceita ISO ou Date). */
export function formatLinkedInDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

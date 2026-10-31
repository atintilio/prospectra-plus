import type { IntegrationPill } from '@/app/(app)/admin/actions';

export type { IntegrationPill };

// Painel de integrações da Administração. Segredos ficam no ambiente do servidor,
// nunca no banco, em respostas de API ou logs — aqui vai apenas o booleano "configurado".
export function integrationStatuses(): IntegrationPill[] {
  const env = (...names: string[]): boolean => names.some((n) => (process.env[n] ?? '').trim() !== '');
  return [
    { name: 'Office 365', ok: env('OFFICE365_TENANT_ID', 'MS_TENANT_ID') && env('OFFICE365_CLIENT_ID', 'MS_CLIENT_ID') && env('OFFICE365_CLIENT_SECRET', 'MS_CLIENT_SECRET'), hint: 'Envio de e-mail (Graph)' },
    { name: 'IA / OpenRouter', ok: env('OPENROUTER_API_KEY'), hint: 'Personalização de mensagens e buscas' },
    { name: 'WhatsApp AKG', ok: env('WA_AKG_BASE_URL'), hint: 'Gateway de WhatsApp' },
    { name: 'Worker inteligência', ok: process.env.INTELLIGENCE_WORKER_ENABLED?.trim() === 'true', hint: 'Análises assíncronas' },
    { name: 'Voice Studio', ok: env('VOICESTUDIO_BASE_URL'), hint: 'Áudio/ligações' },
    { name: 'Worker dispatch', ok: env('DISPATCH_SECRET'), hint: 'POST /api/dispatch (sent/unknown)' },
    { name: 'Agendador externo', ok: env('MEETING_SCHEDULER_URL'), hint: 'MEETING_SCHEDULER_URL (opcional)' },
    { name: 'Chave de segredos', ok: env('SECRETS_KEY', 'AUTH_SECRET'), hint: 'Cifragem da sessão do LinkedIn' },
  ];
}

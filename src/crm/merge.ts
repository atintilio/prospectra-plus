import type { ProspectraState, Contact, Channel } from '../types';

export type FieldValue = string | number | boolean | null;
export interface CustomField { id: string; label: string; entity: 'account' | 'contact' | 'opportunity'; type: 'text' | 'number' | 'boolean'; }
export interface EnrichmentProposal { id: string; contactId: string; field: 'email' | 'phone' | 'role' | 'linkedin'; value: string; sourceUrl: string; observedAt: string; evidence: string; status: 'proposed' | 'applied' | 'dismissed'; }
export interface ChannelEvent { id: string; provider: string; providerEventId: string; accountId: string; channel: Channel; kind: 'sent' | 'failed' | 'reply' | 'meeting' | 'conversion'; occurredAt: string; }
export interface UnifiedCRM { version: 1; legacy: ProspectraState; fields: CustomField[]; values: Record<string, Record<string, FieldValue>>; proposals: EnrichmentProposal[]; events: ChannelEvent[]; }

// Additive migration: preserve the complete legacy payload and its identifiers.
export function migrateWorkspace(state: ProspectraState): UnifiedCRM {
  const ids = state.accounts.map(a => a.id);
  if (new Set(ids).size !== ids.length) throw new Error('Contas com IDs duplicados');
  const contacts = state.accounts.flatMap(a => a.contacts.map(c => c.id));
  if (new Set(contacts).size !== contacts.length) throw new Error('Contatos com IDs duplicados');
  return { version: 1, legacy: structuredClone(state), fields: [], values: {}, proposals: [], events: [] };
}
export function setCustomValue(crm: UnifiedCRM, fieldId: string, recordId: string, value: FieldValue): UnifiedCRM {
  const field = crm.fields.find(f => f.id === fieldId);
  if (!field) throw new Error('Campo inexistente');
  const records = field.entity === 'account' ? crm.legacy.accounts : field.entity === 'contact' ? crm.legacy.accounts.flatMap(a => a.contacts) : crm.legacy.opportunities;
  if (!records.some(r => r.id === recordId)) throw new Error('Registro inexistente');
  const expected = field.type === 'text' ? 'string' : field.type;
  if (value !== null && (typeof value !== expected || (typeof value === 'number' && !Number.isFinite(value)))) throw new Error('Valor incompatível');
  return { ...crm, values: { ...crm.values, [recordId]: { ...crm.values[recordId], [fieldId]: value } } };
}
export function reviewProposal(crm: UnifiedCRM, proposalId: string, decision: 'applied' | 'dismissed'): UnifiedCRM {
  const proposal = crm.proposals.find(p => p.id === proposalId);
  if (!proposal || proposal.status !== 'proposed') throw new Error('Proposta indisponível');
  if (!crm.legacy.accounts.some(a => a.contacts.some(c => c.id === proposal.contactId))) throw new Error('Contato inexistente');
  if (decision === 'applied') {
    const url = new URL(proposal.sourceUrl);
    if (!['https:', 'http:'].includes(url.protocol) || !proposal.evidence.trim() || !proposal.value.trim() || !Number.isFinite(Date.parse(proposal.observedAt))) throw new Error('Evidência incompleta');
  }
  return { ...crm, proposals: crm.proposals.map(p => p.id === proposalId ? { ...p, status: decision } : p), legacy: decision === 'dismissed' ? crm.legacy : { ...crm.legacy, campaigns: crm.legacy.campaigns.map(c => ({ ...c, tasks: c.tasks.map(t => t.contactId === proposal.contactId && t.state !== 'Concluído' ? { ...t, state: 'Aguardando revisão' as const, approval: undefined } : t) })), accounts: crm.legacy.accounts.map(a => ({ ...a, contacts: a.contacts.map((c): Contact => c.id === proposal.contactId ? { ...c, [proposal.field]: proposal.value, status: 'A revisar' } : c) })) } };
}
export function recordChannelEvent(crm: UnifiedCRM, event: ChannelEvent): UnifiedCRM {
  if (!event.provider.trim() || !event.providerEventId.trim() || !Number.isFinite(Date.parse(event.occurredAt))) throw new Error('Evento inválido');
  if (!crm.legacy.accounts.some(a => a.id === event.accountId)) throw new Error('Conta inexistente');
  if (crm.events.some(e => e.provider === event.provider && e.providerEventId === event.providerEventId)) return crm;
  // Preserve existing approval/suppression policies; a reply pauses outstanding work.
  const legacy = event.kind !== 'reply' ? crm.legacy : { ...crm.legacy, accounts: crm.legacy.accounts.map(a => a.id === event.accountId ? { ...a, paused: true } : a), campaigns: crm.legacy.campaigns.map(c => ({ ...c, tasks: c.tasks.map(t => t.accountId === event.accountId && t.state !== 'Concluído' ? { ...t, state: 'Pausado' as const } : t) })) };
  return { ...crm, legacy, events: [...crm.events, event] };
}

export type CRMExtension = Omit<UnifiedCRM, 'legacy'>;
export function openCRM(state: ProspectraState): UnifiedCRM {
 return { ...migrateWorkspace(state), ...state.crmExtension, legacy: state };
}
export function saveCRM(crm: UnifiedCRM): ProspectraState {
 const { legacy, ...extension } = crm; return { ...legacy, crmExtension: extension };
}
export function addCustomField(crm: UnifiedCRM, field: CustomField): UnifiedCRM {
 if (!field.id.trim() || !field.label.trim() || crm.fields.some(f => f.id === field.id || (f.entity === field.entity && f.label.toLowerCase() === field.label.toLowerCase()))) throw new Error('Campo vazio ou duplicado');
 return { ...crm, fields: [...crm.fields, field] };
}

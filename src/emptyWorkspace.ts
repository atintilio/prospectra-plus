import { seedState } from './data';
import type { ProspectraState } from './types';

/** Configuration defaults only; customer and demonstration records are never copied. */
export function emptyWorkspace(): ProspectraState {
  return { accounts: [], campaigns: [], signals: [], teams: [], members: [], opportunities: [], diagnoses: [],
    selectedAccountId: '', selectedCampaignId: '', channels: structuredClone(seedState.channels),
    agent: { ...seedState.agent, enabled: false }, playbook: [],
    crmExtension: { version: 1, fields: [], values: {}, proposals: [], events: [] } };
}

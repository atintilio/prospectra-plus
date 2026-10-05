import type { IntegrationResult } from './scrapegraph';

function config() {
  return {
    baseUrl: (process.env.CRM_BASE_URL ?? '').replace(/\/$/, ''),
    apiKey: process.env.CRM_API_KEY,
    healthPath: process.env.CRM_HEALTH_PATH ?? '/health',
    accountsPath: process.env.CRM_ACCOUNTS_PATH ?? '/api/companies',
    contactsPath: process.env.CRM_CONTACTS_PATH ?? '/api/contacts',
  };
}

function headers(apiKey?: string): Record<string, string> {
  return { Accept: 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
}

export async function crmHealth(): Promise<IntegrationResult> {
  const current = config();
  if (!current.baseUrl || !current.apiKey) return { status: 'not_configured', detail: 'CRM_BASE_URL ou CRM_API_KEY ausente.' };
  const response = await fetch(`${current.baseUrl}${current.healthPath}`, { headers: headers(current.apiKey) });
  return response.ok ? { status: 'ok', detail: 'CRM respondeu ao health check.' } : { status: 'error', detail: `CRM retornou HTTP ${response.status}.` };
}

export async function listCrmAccounts(): Promise<IntegrationResult> {
  const current = config();
  if (!current.baseUrl || !current.apiKey) return { status: 'not_configured', detail: 'CRM_BASE_URL ou CRM_API_KEY ausente.' };
  const response = await fetch(`${current.baseUrl}${current.accountsPath}`, { headers: headers(current.apiKey) });
  const body = await response.json().catch(() => ({}));
  return response.ok ? { status: 'ok', data: body } : { status: 'error', detail: `CRM retornou HTTP ${response.status}.`, data: body };
}

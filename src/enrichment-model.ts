import type { Account, Contact, Evidence } from './types';

export interface ContactCandidate {
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  sourceUrl: string;
  sourceUrls?: string[];
}
export interface CompanyExtraction {
  provider: 'ScrapeGraphAI';
  requestId?: string;
  sourceUrl: string;
  extractedAt: string;
  data: Record<string, unknown>;
  contacts: ContactCandidate[];
}
export interface PeopleDiscovery {
  provider: 'ScrapeGraphAI';
  requestId?: string;
  searchedAt: string;
  company: string;
  pages: { url: string; title: string; excerpt: string }[];
  contacts: ContactCandidate[];
}

function clean(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function domainOf(value: string) {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}
function evidenceKey(evidence: Evidence) { return `${evidence.title.toLowerCase()}|${evidence.url.toLowerCase()}`; }
function contactKey(contact: Pick<Contact, 'name' | 'email' | 'phone' | 'linkedin'>) {
  return contact.linkedin?.toLowerCase() || contact.email?.toLowerCase() || `${contact.name.toLowerCase()}|${contact.phone || ''}`;
}
export function applyEnrichmentToAccount(account: Account, extraction: CompanyExtraction | PeopleDiscovery, selected: ContactCandidate[], actor: string): Account {
  const sourceUrl = 'sourceUrl' in extraction ? extraction.sourceUrl : extraction.pages[0]?.url || '';
  const extractedAt = 'extractedAt' in extraction ? extraction.extractedAt : extraction.searchedAt;
  const data = 'data' in extraction ? extraction.data : {};
  const evidence: Evidence[] = [];
  const description = clean(data.description, 1500);
  if (description && sourceUrl) evidence.push({ id: crypto.randomUUID(), title: `Contexto público · ${clean(data.companyName, 100) || account.name}`, url: sourceUrl, excerpt: description, source: 'Web pública', provider: 'ScrapeGraphAI', requestId: extraction.requestId, collectedAt: extractedAt, verified: false });
  for (const candidate of selected) {
    if (!candidate.name?.trim() || !candidate.sourceUrl) continue;
    for (const url of new Set(candidate.sourceUrls?.length ? candidate.sourceUrls : [candidate.sourceUrl])) {
      evidence.push({ id: crypto.randomUUID(), title: `Pessoa identificada · ${candidate.name.trim()}`, url, excerpt: `${candidate.role || 'Cargo não informado'} · ${candidate.email || 'email não encontrado'} · ${candidate.phone || 'telefone não encontrado'} · ${candidate.linkedin || 'LinkedIn não encontrado'}`, source: 'Web pública', provider: 'ScrapeGraphAI', requestId: extraction.requestId, collectedAt: extractedAt, verified: false });
    }
  }
  const signals = Array.isArray(data.signals) ? data.signals : [];
  for (const item of signals.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const signal = item as Record<string, unknown>;
    const title = clean(signal.title, 140);
    const signalUrl = clean(signal.sourceUrl, 2048);
    if (title && /^https?:\/\//i.test(signalUrl)) evidence.push({ id: crypto.randomUUID(), title: `Sinal · ${title}`, url: signalUrl, excerpt: clean(signal.detail, 500), source: 'Web pública', provider: 'ScrapeGraphAI', requestId: extraction.requestId, collectedAt: extractedAt, verified: false });
  }
  const seenEvidence = new Set(account.evidence.map(evidenceKey));
  const newEvidence = evidence.filter((entry) => { const key = evidenceKey(entry); if (seenEvidence.has(key)) return false; seenEvidence.add(key); return true; });
  const seenContacts = new Set(account.contacts.map(contactKey));
  const newContacts: Contact[] = selected.filter((entry) => {
    const key = contactKey(entry);
    if (!entry.name?.trim() || seenContacts.has(key)) return false;
    seenContacts.add(key); return true;
  }).map((entry) => ({
    id: `contact-${crypto.randomUUID()}`, name: entry.name.trim(), role: entry.role || 'Cargo a confirmar',
    email: entry.email || '', phone: entry.phone || undefined, linkedin: entry.linkedin || '',
    sourceUrl: entry.sourceUrl, sourceProvider: 'ScrapeGraphAI', discoveredAt: extractedAt,
    reviewedAt: '', status: 'A revisar' as const, optIn: false,
  }));
  const nextSector = clean(data.sector, 140);
  const nextEmployees = clean(data.employees, 140);
  const context = `Pesquisa ${extraction.requestId || 'sem ID'}: ${newContacts.length} contato(s) e ${newEvidence.length} evidência(s) incluídos para revisão. Telefones/URLs não são presumidos; opt-in não é concedido automaticamente.`;
  return {
    ...account,
    sector: (!account.sector || account.sector === 'Não informado') && nextSector ? nextSector : account.sector,
    employees: (!account.employees || account.employees === 'Não informado') && nextEmployees ? nextEmployees : account.employees,
    contacts: [...newContacts, ...account.contacts], evidence: [...newEvidence, ...account.evidence],
    activities: [{ id: crypto.randomUUID(), kind: 'Evidência', actor, createdAt: new Date().toISOString(), text: context }, ...account.activities],
  };
}
export function applyBatchEnrichment(accounts: Account[], results: { row: { index: number; values: Record<string, string> }; extraction: CompanyExtraction }[], owner: string): { accounts: Account[]; created: number; updated: number } {
  const updatedAccounts = [...accounts];
  let created = 0; let updated = 0;
  for (const { row, extraction } of results) {
    const domain = domainOf(extraction.sourceUrl);
    if (!domain) continue;
    const name = clean(extraction.data.companyName, 120) || Object.entries(row.values).find(([key]) => /empresa|company|raz[aã]o|nome/i.test(key))?.[1] || domain;
    let index = updatedAccounts.findIndex((account) => domainOf(account.domain) === domain || account.name.toLowerCase() === name.toLowerCase());
    if (index < 0) {
      const account: Account = {
        id: `a-${crypto.randomUUID()}`, name, domain, sector: '', employees: '', tier: 'Tier 2', journey: 'Aquisição', relationship: 'Prospect', owner,
        score: 50, scoreReason: 'Conta pesquisada; revisar evidências antes de abordar', stage: 'A revisar', paused: false, suppressed: false,
        contacts: [], evidence: [], activities: [],
      };
      updatedAccounts.unshift(account); index = 0; created++;
    } else updated++;
    updatedAccounts[index] = applyEnrichmentToAccount(updatedAccounts[index], extraction, extraction.contacts || [], owner);
  }
  return { accounts: updatedAccounts, created, updated };
}

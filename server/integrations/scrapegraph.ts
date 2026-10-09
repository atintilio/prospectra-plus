import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_BASE_URL = 'https://scraper.prospectra.argusprime.com.br';
const REQUEST_TIMEOUT_MS = 50_000;
const HEALTH_TIMEOUT_MS = 5_000;

export interface ScrapeGraphExtraction {
  provider: 'Prospectra Web Scraper';
  requestId?: string;
  sourceUrl: string;
  extractedAt: string;
  data: Record<string, unknown>;
  raw?: string;
}

export interface PublicProfessionalContact {
  name: string;
  role: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  sourceUrl: string;
  confidence: number;
  observedAt: string;
}

const genericMailbox = /^(info|contato|contact|comercial|sales|vendas|suporte|support|hello|oi|admin|financeiro|rh|marketing|atendimento|sac)@/i;
const contactKeys = ['contacts', 'people', 'persons', 'team', 'leadership', 'executives', 'decisors', 'profiles'];
function cleanString(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''; }
function publicEmail(value: unknown) { const email = cleanString(value, 254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !genericMailbox.test(email) ? email : undefined; }
function publicPhone(value: unknown) { const phone = cleanString(value, 40); const digits = phone.replace(/\D/g, ''); return digits.length >= 10 && digits.length <= 15 ? phone : undefined; }
function publicLinkedIn(value: unknown) { const url = cleanString(value, 500); try { const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); return parsed.hostname.toLowerCase().endsWith('linkedin.com') && parsed.pathname.startsWith('/in/') ? parsed.toString() : undefined; } catch { return undefined; } }
function contactCandidate(value: unknown, sourceUrl: string, observedAt: string): PublicProfessionalContact | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const name = cleanString(item.name ?? item.fullName ?? item.personName ?? item.contactName, 120);
  const role = cleanString(item.role ?? item.title ?? item.position ?? item.jobTitle ?? item.cargo, 160);
  const email = publicEmail(item.email ?? item.workEmail ?? item.emailAddress);
  const phone = publicPhone(item.phone ?? item.mobile ?? item.cellphone ?? item.telefone);
  const linkedin = publicLinkedIn(item.linkedin ?? item.linkedIn ?? item.linkedinUrl ?? item.profileUrl);
  if (!name || !role || (!email && !phone && !linkedin)) return null;
  return { name, role, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(linkedin ? { linkedin } : {}), sourceUrl, confidence: Math.min(100, 45 + (email ? 20 : 0) + (phone ? 15 : 0) + (linkedin ? 20 : 0)), observedAt };
}
export function normalizeProfessionalContacts(data: Record<string, unknown>, sourceUrl: string, observedAt = new Date().toISOString()): PublicProfessionalContact[] {
  const candidates: unknown[] = [];
  for (const key of contactKeys) if (Array.isArray(data[key])) candidates.push(...data[key] as unknown[]);
  if (data.contact && typeof data.contact === 'object') candidates.push(data.contact);
  if (data.person && typeof data.person === 'object') candidates.push(data.person);
  const unique = new Map<string, PublicProfessionalContact>();
  for (const candidate of candidates) { const contact = contactCandidate(candidate, sourceUrl, observedAt); if (!contact) continue; const key = contact.linkedin ?? contact.email ?? `${contact.name.toLowerCase()}|${contact.role.toLowerCase()}`; if (!unique.has(key)) unique.set(key, contact); }
  return [...unique.values()].slice(0, 100);
}

/**
 * O nome público das rotas permanece `scrapegraph` para não quebrar links salvos,
 * mas o provider de produção é o website-email-contact-scraper hospedado na VM.
 * `SGAI_*` fica apenas como fallback de migração para deployments antigos.
 */
export function scrapeGraphBaseUrl() {
  return (process.env.SCRAPER_BASE_URL?.trim() || process.env.SGAI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
}

export function scrapeGraphApiKey() {
  return process.env.SCRAPER_API_KEY?.trim() || process.env.SGAI_API_KEY?.trim() || '';
}

export function scrapeGraphConfigured() {
  return Boolean(scrapeGraphApiKey());
}

export interface ScrapeGraphHealth {
  provider: 'Prospectra Web Scraper';
  baseUrl: string;
  configured: boolean;
  reachable: boolean;
  status: 'ready' | 'awaiting_api_key' | 'unreachable' | 'provider_failed';
  engine?: string;
  commit?: string;
}

export async function scrapeGraphHealth(): Promise<ScrapeGraphHealth> {
  const baseUrl = scrapeGraphBaseUrl();
  const configured = scrapeGraphConfigured();
  if (!configured) {
    return { provider: 'Prospectra Web Scraper', baseUrl, configured: false, reachable: false, status: 'awaiting_api_key' };
  }
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const body = await response.json().catch(() => ({})) as { engine?: unknown; commit?: unknown };
    if (!response.ok) {
      return { provider: 'Prospectra Web Scraper', baseUrl, configured, reachable: true, status: 'provider_failed' };
    }
    return {
      provider: 'Prospectra Web Scraper',
      baseUrl,
      configured,
      reachable: true,
      status: 'ready',
      engine: typeof body.engine === 'string' ? body.engine : undefined,
      commit: typeof body.commit === 'string' ? body.commit : undefined,
    };
  } catch {
    return { provider: 'Prospectra Web Scraper', baseUrl, configured, reachable: false, status: 'unreachable' };
  }
}

function privateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function privateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return Boolean(mapped && privateIpv4(mapped[1]));
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return privateIpv4(address);
  if (version === 6) return privateIpv6(address);
  return true;
}

export async function validatePublicUrl(value: string): Promise<URL> {
  if (value.length > 2048) throw new Error('SCRAPEGRAPH_INVALID_URL');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('SCRAPEGRAPH_INVALID_URL'); }
  const hostname = parsed.hostname.toLowerCase();
  const blockedHost = hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || hostname.endsWith('.local') || hostname.endsWith('.internal');
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || blockedHost || !hostname.includes('.')) throw new Error('SCRAPEGRAPH_INVALID_URL');
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error('SCRAPEGRAPH_INVALID_URL');
  } catch (error) {
    if (error instanceof Error && error.message === 'SCRAPEGRAPH_INVALID_URL') throw error;
    throw new Error('SCRAPEGRAPH_INVALID_URL');
  }
  return parsed;
}

export async function enrichCompany(url: string): Promise<ScrapeGraphExtraction> {
  const apiKey = scrapeGraphApiKey();
  if (!apiKey) throw new Error('SCRAPEGRAPH_NOT_CONFIGURED');
  const source = await validatePublicUrl(url);
  const response = await fetch(`${scrapeGraphBaseUrl()}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'SGAI-APIKEY': apiKey },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    // O novo scraper recebe somente a URL e devolve o contrato Prospectra.
    // Campos adicionais do contrato antigo não são mais enviados.
    body: JSON.stringify({ url: source.toString(), crawl: { maxDepth: 3, maxPages: 30, followPaths: ['/equipe', '/time', '/lideranca', '/people', '/about', '/sobre', '/autores', '/noticias'] }, extraction: { focus: 'public_professional_contacts', requireNameAndRole: true, excludeGenericMailboxes: true, fields: ['name', 'role', 'workEmail', 'phone', 'linkedinUrl', 'sourceUrl', 'confidence'] } }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; json?: unknown; raw?: string };
  if (!response.ok) {
    console.error('prospectra_scraper_error', `HTTP_${response.status}`);
    throw new Error(`SCRAPEGRAPH_FAILED_${response.status}`);
  }
  const data = body.json && typeof body.json === 'object' && !Array.isArray(body.json) ? body.json as Record<string, unknown> : {};
  const extractedAt = new Date().toISOString();
  return { provider: 'Prospectra Web Scraper', requestId: body.id, sourceUrl: source.toString(), extractedAt, data: { ...data, contacts: normalizeProfessionalContacts(data, source.toString(), extractedAt) }, raw: typeof body.raw === 'string' ? body.raw : undefined };
}

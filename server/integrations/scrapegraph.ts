import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_BASE_URL = 'https://v2-api.scrapegraphai.com';
const REQUEST_TIMEOUT_MS = 45_000;

export interface PublicContactCandidate {
  name: string;
  role: string;
  email: string;
  phone: string;
  linkedin: string;
  sourceUrl: string;
  sourceUrls?: string[];
}
export interface ScrapeGraphExtraction {
  provider: 'ScrapeGraphAI';
  requestId?: string;
  sourceUrl: string;
  extractedAt: string;
  data: Record<string, unknown>;
  contacts: PublicContactCandidate[];
}
export interface PublicDiscovery {
  provider: 'ScrapeGraphAI';
  requestId?: string;
  searchedAt: string;
  company: string;
  pages: { url: string; title: string; excerpt: string }[];
  contacts: PublicContactCandidate[];
}

export function scrapeGraphBaseUrl() {
  const configured = process.env.SGAI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'v2-api.scrapegraphai.com' || parsed.port || parsed.username || parsed.password || (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) throw new Error('SCRAPEGRAPH_INVALID_BASE_URL');
  } catch { throw new Error('SCRAPEGRAPH_INVALID_BASE_URL'); }
  return DEFAULT_BASE_URL;
}
export function scrapeGraphConfigured() {
  return Boolean(process.env.SGAI_API_KEY?.trim());
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
  } catch {
    throw new Error('SCRAPEGRAPH_INVALID_URL');
  }
  return parsed;
}

const contactSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' }, role: { type: 'string' }, email: { type: 'string' },
    phone: { type: 'string' }, linkedin: { type: 'string' }, sourceUrl: { type: 'string' },
  },
};
const extractionSchema = {
  type: 'object',
  properties: {
    companyName: { type: 'string' }, description: { type: 'string' }, sector: { type: 'string' },
    employees: { type: 'string' },
    contacts: { type: 'array', items: contactSchema },
    signals: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' }, date: { type: 'string' }, sourceUrl: { type: 'string' } } } },
    publicChannels: { type: 'array', items: { type: 'string' } },
  },
};
function text(value: unknown, limit = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
function publicHttpUrl(value: unknown): string {
  try {
    const url = new URL(text(value, 2048));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || isIP(url.hostname)) return '';
    return url.toString();
  } catch { return ''; }
}
export function linkedinProfileUrl(value: unknown): string {
  const candidate = publicHttpUrl(value);
  if (!candidate) return '';
  const url = new URL(candidate);
  if (!['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase()) || !/^\/(in|pub)\/[^/]+/i.test(url.pathname)) return '';
  url.search = ''; url.hash = '';
  return url.toString();
}
function normalizedPhone(value: unknown): string {
  const candidate = text(value, 60);
  const digits = candidate.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? candidate : '';
}
function urlKey(value: string): string { return value.replace(/\/$/, '').toLowerCase(); }
export function normalizePublicContacts(value: unknown, allowedSources: string[], sourceContents: Record<string, string> = {}): PublicContactCandidate[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Map(allowedSources.map((source) => [urlKey(source), source]));
  const seen = new Set<string>();
  const contacts: PublicContactCandidate[] = [];
  for (const raw of value.slice(0, 30)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const name = text(item.name, 120);
    const sourceUrl = allowed.get(urlKey(publicHttpUrl(item.sourceUrl))) || (allowed.size === 1 ? [...allowed.values()][0] : '');
    if (name.length < 4 || !sourceUrl) continue;
    const content = sourceContents[urlKey(sourceUrl)];
    const rawPhone = normalizedPhone(item.phone);
    const phone = rawPhone && (!content || content.replace(/\D/g, '').includes(rawPhone.replace(/\D/g, ''))) ? rawPhone : '';
    const email = text(item.email, 160).toLowerCase();
    const safeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && (!content || content.toLowerCase().includes(email)) ? email : '';
    const profile = linkedinProfileUrl(item.linkedin) || linkedinProfileUrl(sourceUrl);
    const linkedin = profile && (!content || urlKey(linkedinProfileUrl(sourceUrl)) === urlKey(profile) || Boolean(content.includes(profile) || content.includes(profile.replace(/\/$/, '')))) ? profile : '';
    const key = `${name.toLowerCase()}|${linkedin || safeEmail || sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({ name, role: text(item.role, 120), email: safeEmail, phone, linkedin, sourceUrl });
  }
  return contacts;
}
async function providerRequest(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  if (!scrapeGraphConfigured()) throw new Error('SCRAPEGRAPH_NOT_CONFIGURED');
  const baseUrl = scrapeGraphBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'SGAI-APIKEY': process.env.SGAI_API_KEY!.trim(), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(path === '/api/credits' ? 7_000 : REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('SCRAPEGRAPH_TIMEOUT');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('prospectra_scrapegraph_error', `HTTP_${response.status}`);
    throw new Error(`SCRAPEGRAPH_FAILED_${response.status}`);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('SCRAPEGRAPH_EMPTY_RESULT');
  return body as Record<string, unknown>;
}
export async function scrapeGraphCredits() {
  const body = await providerRequest('/api/credits');
  const remaining = Number(body.remaining);
  return { remaining: Number.isFinite(remaining) ? remaining : null };
}
export async function enrichCompany(url: string): Promise<ScrapeGraphExtraction> {
  const source = await validatePublicUrl(url);
  const body = await providerRequest('/api/extract', {
    method: 'POST',
    body: JSON.stringify({
      url: source.toString(),
      prompt: 'Extraia apenas informações explicitamente presentes nesta página pública da empresa. Inclua nome, descrição, setor, porte, sinais recentes e pessoas identificadas nominalmente. Para cada pessoa, informe cargo, telefone profissional publicado, email profissional publicado e URL exata do perfil LinkedIn somente se aparecerem na página; caso contrário deixe os campos vazios. Nunca invente dados nem suponha um padrão de endereço de email. Inclua sourceUrl para cada pessoa.',
      schema: extractionSchema,
      allowedTypes: ['text/html'],
      fetchConfig: { mode: 'auto', timeout: 30000 },
    }),
  });
  const data = body.json && typeof body.json === 'object' && !Array.isArray(body.json) ? body.json as Record<string, unknown> : {};
  const contacts = normalizePublicContacts(data.contacts, [source.toString()]);
  const hasContent = ['companyName', 'description', 'sector', 'employees'].some((key) => text(data[key])) || contacts.length || (Array.isArray(data.signals) && data.signals.length);
  if (!hasContent) throw new Error('SCRAPEGRAPH_EMPTY_RESULT');
  return { provider: 'ScrapeGraphAI', requestId: text(body.id, 80) || undefined, sourceUrl: source.toString(), extractedAt: new Date().toISOString(), data, contacts };
}
export async function discoverCompanyPeople(company: string, domain: string): Promise<PublicDiscovery> {
  const name = text(company, 120);
  if (name.length < 3) throw new Error('SCRAPEGRAPH_INVALID_COMPANY');
  const source = await validatePublicUrl(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`);
  const body = await providerRequest('/api/search', {
    method: 'POST',
    body: JSON.stringify({
      query: `${name} ${source.hostname} equipe liderança diretores LinkedIn telefone contato`,
      numResults: 5,
      format: 'markdown',
      allowedTypes: ['text/html'],
      prompt: 'Identifique apenas pessoas explicitamente associadas à empresa pesquisada e presentes nos resultados fornecidos. Para cada pessoa, extraia nome, cargo, URL exata do perfil LinkedIn se publicada, telefone profissional e email profissional se publicados. Não adivinhe perfis, emails nem telefones. sourceUrl deve ser uma URL de resultado correspondente à pessoa. Se nenhum dado estiver disponível, retorne contacts vazio.',
      schema: { type: 'object', properties: { contacts: { type: 'array', items: contactSchema } } },
    }),
  });
  const rawResults = Array.isArray(body.results) ? body.results : [];
  const results = rawResults.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))).slice(0, 5);
  const pages = results.map((item) => ({ url: publicHttpUrl(item.url), title: text(item.title, 180), excerpt: text(item.content, 350) })).filter((item) => item.url);
  const contents = Object.fromEntries(results.map((item) => [urlKey(publicHttpUrl(item.url)), text(item.content, 80_000)]));
  const extracted = body.json && typeof body.json === 'object' && !Array.isArray(body.json) ? body.json as Record<string, unknown> : {};
  const individual = normalizePublicContacts(extracted.contacts, pages.map((item) => item.url), contents);
  const byPerson = new Map<string, PublicContactCandidate>();
  for (const contact of individual) {
    const key = contact.name.toLocaleLowerCase('pt-BR');
    const previous = byPerson.get(key);
    if (!previous) { byPerson.set(key, { ...contact, sourceUrls: [contact.sourceUrl] }); continue; }
    byPerson.set(key, {
      ...previous,
      role: previous.role || contact.role,
      email: previous.email || contact.email,
      phone: previous.phone || contact.phone,
      linkedin: previous.linkedin || contact.linkedin,
      sourceUrls: [...new Set([...(previous.sourceUrls || [previous.sourceUrl]), contact.sourceUrl])],
    });
  }
  const contacts = [...byPerson.values()];
  return { provider: 'ScrapeGraphAI', requestId: text(body.id, 80) || undefined, searchedAt: new Date().toISOString(), company: name, pages, contacts };
}

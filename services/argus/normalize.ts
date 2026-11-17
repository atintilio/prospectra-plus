import type { InvestigationTarget } from './types';

const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeTarget(input: Partial<InvestigationTarget>): InvestigationTarget {
  const target: InvestigationTarget = {};
  if (input.name?.trim()) target.name = input.name.trim();
  if (input.urls?.length) target.urls = [...new Set(input.urls.map((value) => normalizeUrl(value).toString()))];
  if (input.company?.trim()) target.company = input.company.trim();
  if (input.person?.trim()) target.person = input.person.trim();
  if (input.domain?.trim()) target.domain = normalizeDomain(input.domain);
  if (input.email?.trim()) {
    const value = input.email.trim().toLowerCase();
    if (!email.test(value)) throw new Error('E-mail inválido');
    target.email = value;
  }
  if (input.profileUrl?.trim()) target.profileUrl = normalizeUrl(input.profileUrl).toString();
  if (!Object.keys(target).length) throw new Error('Alvo vazio');
  return target;
}

export function normalizeDomain(value: string): string {
  const raw = value.includes('://') ? value : `https://${value}`;
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash) throw new Error('Domínio não pode conter credenciais ou parâmetros');
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

export function normalizeUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('URL pública inválida');
  if (url.username || url.password) throw new Error('URL não pode conter credenciais');
  url.hash = '';
  return url;
}

export function correlationKey(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

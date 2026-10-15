// Leitura de CSV (exportação do Sales Navigator, planilhas, listas próprias) e de URLs coladas.

export type ParsedLead = { linkedinUrl: string; fullName: string; headline: string; company: string; location: string };

export function normalizeLinkedinUrl(raw: string): string | null {
  const m = raw.trim().match(/linkedin\.com\/(in|sales\/lead|sales\/people)\/([^/?#\s,]+)/i);
  if (!m) return null;
  const slug = decodeURIComponent(m[2]).replace(/\/$/, '');
  return m[1].toLowerCase() === 'in' ? `https://www.linkedin.com/in/${slug.toLowerCase()}` : `https://www.linkedin.com/${m[1].toLowerCase()}/${slug}`;
}

function nameFromSlug(url: string): string {
  const slug = url.split('/').filter(Boolean).pop() ?? '';
  return slug.replace(/-[0-9a-f]{6,}$/i, '').split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

const H = {
  url: ['linkedin', 'linkedin url', 'profile url', 'url', 'perfil', 'link', 'linkedin_url', 'person linkedin url'],
  name: ['nome', 'name', 'full name', 'nome completo', 'fullname'],
  first: ['first name', 'primeiro nome', 'firstname'],
  last: ['last name', 'sobrenome', 'lastname'],
  title: ['cargo', 'title', 'headline', 'job title', 'position', 'título'],
  company: ['empresa', 'company', 'company name', 'organization', 'organização'],
  location: ['cidade', 'location', 'localização', 'local', 'city'],
};

function findCol(headers: string[], keys: string[]): number {
  const h = headers.map((x) => x.trim().toLowerCase());
  for (const k of keys) { const i = h.indexOf(k); if (i >= 0) return i; }
  for (const k of keys) { const i = h.findIndex((x) => x.includes(k)); if (i >= 0) return i; }
  return -1;
}

export function leadsFromCsv(text: string): { leads: ParsedLead[]; invalid: number } {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) return { leads: [], invalid: 0 };
  const [headers, ...data] = rows;
  const c = {
    url: findCol(headers, H.url), name: findCol(headers, H.name), first: findCol(headers, H.first), last: findCol(headers, H.last),
    title: findCol(headers, H.title), company: findCol(headers, H.company), location: findCol(headers, H.location),
  };
  const out: ParsedLead[] = [];
  let invalid = 0;
  for (const r of data) {
    const rawUrl = c.url >= 0 ? r[c.url] ?? '' : r.find((v) => /linkedin\.com\//i.test(v)) ?? '';
    const url = normalizeLinkedinUrl(rawUrl);
    if (!url) { invalid++; continue; }
    const name = (c.name >= 0 ? r[c.name] : [c.first >= 0 ? r[c.first] : '', c.last >= 0 ? r[c.last] : ''].join(' ')).trim() || nameFromSlug(url);
    out.push({
      linkedinUrl: url, fullName: name,
      headline: (c.title >= 0 ? r[c.title] : '')?.trim() ?? '',
      company: (c.company >= 0 ? r[c.company] : '')?.trim() ?? '',
      location: (c.location >= 0 ? r[c.location] : '')?.trim() ?? '',
    });
  }
  return { leads: dedupe(out), invalid };
}

export function leadsFromUrls(text: string): { leads: ParsedLead[]; invalid: number } {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const out: ParsedLead[] = [];
  let invalid = 0;
  for (const p of parts) {
    const url = normalizeLinkedinUrl(p);
    if (!url) { invalid++; continue; }
    out.push({ linkedinUrl: url, fullName: nameFromSlug(url), headline: '', company: '', location: '' });
  }
  return { leads: dedupe(out), invalid };
}

function dedupe(list: ParsedLead[]): ParsedLead[] {
  const seen = new Set<string>();
  return list.filter((l) => (seen.has(l.linkedinUrl) ? false : (seen.add(l.linkedinUrl), true)));
}

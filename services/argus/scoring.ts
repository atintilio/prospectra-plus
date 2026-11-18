import type { Confidence, CommercialSignal, Evidence } from './types';

const RANK: Record<Confidence, number> = { conflict: 0, unverified: 1, candidate: 2, probable: 3, confirmed: 4 };
function best(a: Confidence, b: Confidence): Confidence { return RANK[a] >= RANK[b] ? a : b; }

// Converte evidências em sinais comerciais acionáveis. Cada sinal aponta as
// evidências que o sustentam (rastreabilidade) e nunca inventa dado ausente.
export function score(evidence: Evidence[]): CommercialSignal[] {
  if (!evidence.length) return [];
  const signals: CommercialSignal[] = [];
  const byKind = new Map<string, Evidence[]>();
  for (const e of evidence) { const l = byKind.get(e.kind) ?? []; l.push(e); byKind.set(e.kind, l); }

  const first = (kind: string) => byKind.get(kind)?.[0];
  const all = (kind: string) => byKind.get(kind) ?? [];

  const li = first('linkedin_profile');
  if (li) signals.push({ key: 'linkedin_profile', value: li.value, confidence: li.confidence, evidenceIds: all('linkedin_profile').map((e) => e.id) });

  const email = first('email');
  if (email) signals.push({ key: 'email', value: email.value, confidence: email.confidence, evidenceIds: [email.id] });

  const mx = first('email_deliverable');
  if (mx) signals.push({ key: 'email_deliverable', value: `MX ${mx.value}`, confidence: mx.confidence, evidenceIds: [mx.id] });
  else if (first('email_no_mx')) signals.push({ key: 'email_deliverable', value: 'sem MX — verificar', confidence: 'candidate', evidenceIds: [first('email_no_mx')!.id] });

  const mentions = all('web_mention');
  if (mentions.length) signals.push({ key: 'public_mentions', value: String(mentions.length), confidence: 'candidate', evidenceIds: mentions.map((e) => e.id) });

  // Presença pública consolidada: qualquer evidência observável.
  const presence = evidence.filter((e) => ['public_page', 'dns_a', 'web_mention', 'linkedin_profile'].includes(e.kind));
  if (presence.length) {
    signals.push({ key: 'public_presence', value: 'evidence_found', confidence: presence.reduce<Confidence>((acc, e) => best(acc, e.confidence), 'candidate'), evidenceIds: presence.map((e) => e.id) });
  }
  return signals;
}

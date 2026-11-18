import { promises as dns } from 'node:dns';
import { createHash } from 'node:crypto';
import type { Evidence, InvestigationTarget, SourceAdapter } from '../types';

// Validação pública keyless do e-mail do lead: confirma que o domínio tem MX
// (sinal de entregabilidade/vetting). Não envia e-mail, não usa chave de API.

type MxResolver = (domain: string) => Promise<{ exchange: string; priority: number }[]>;

function hash(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 16); }

export function emailSource(resolveMx: MxResolver = (d) => dns.resolveMx(d)): SourceAdapter {
  return { name: 'email-mx', async collect(target: InvestigationTarget) {
    if (!target.email) return [];
    const domain = target.email.split('@')[1]?.toLowerCase();
    if (!domain) return [];
    const now = new Date().toISOString();
    const evidence: Evidence[] = [
      // O e-mail informado é um identificador confirmado do lead.
      { id: hash(`email|${target.email}`), source: 'email-mx', url: `mailto:${target.email}`, kind: 'email', value: target.email, collectedAt: now, confidence: 'confirmed' },
    ];
    try {
      const mx = (await resolveMx(domain)).filter((r) => r.exchange);
      if (mx.length) {
        const best = mx.sort((a, b) => a.priority - b.priority)[0].exchange.toLowerCase();
        evidence.push({ id: hash(`mx|${domain}|${best}`), source: 'email-mx', url: `https://${domain}`, kind: 'email_deliverable', value: best, collectedAt: now, confidence: 'confirmed' });
      } else {
        evidence.push({ id: hash(`nomx|${domain}`), source: 'email-mx', url: `https://${domain}`, kind: 'email_no_mx', value: domain, collectedAt: now, confidence: 'candidate' });
      }
    } catch {
      evidence.push({ id: hash(`nomx|${domain}`), source: 'email-mx', url: `https://${domain}`, kind: 'email_no_mx', value: domain, collectedAt: now, confidence: 'candidate' });
    }
    return evidence;
  } };
}

import { describe, expect, it, vi } from 'vitest';
import { extractResultUrls, webSearchSource } from '../sources/websearch';
import { emailSource } from '../sources/email';
import { score } from '../scoring';
import { runInvestigation } from '../worker';
import { hunterSource, apolloSource } from '../sources/paid';

const ddg = (urls: string[]) => `<html><body>${urls
  .map((u) => `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}&rut=x">link</a>`)
  .join('')}</body></html>`;

describe('Argus · web-search', () => {
  it('extrai URLs resolvendo o redirect uddg e ignora links internos', () => {
    const out = extractResultUrls(ddg(['https://www.linkedin.com/in/maria-silva', 'https://acme.com/sobre']));
    expect(out).toContain('https://www.linkedin.com/in/maria-silva');
    expect(out).toContain('https://acme.com/sobre');
    expect(out.some((u) => u.includes('duckduckgo.com'))).toBe(false);
  });

  it('descobre o perfil do LinkedIn quando o lead não tem URL', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const q = String(input);
      const body = /linkedin\.com%2Fin/i.test(q) || /site%3Alinkedin/i.test(q)
        ? ddg(['https://br.linkedin.com/in/Maria-Silva-123/'])
        : ddg(['https://acme.com/time/maria', 'https://noticias.com/maria-silva']);
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const ev = await webSearchSource(fetcher).collect({ name: 'Maria Silva', company: 'Acme' });
    const li = ev.find((e) => e.kind === 'linkedin_profile');
    expect(li?.value).toBe('https://www.linkedin.com/in/maria-silva-123');
    expect(ev.some((e) => e.kind === 'web_mention')).toBe(true);
  });

  it('não busca sem um nome', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect(await webSearchSource(fetcher).collect({ company: 'Acme' })).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Argus · email-mx', () => {
  it('confirma entregabilidade quando há MX', async () => {
    const ev = await emailSource(async () => [{ exchange: 'mx1.acme.com', priority: 10 }]).collect({ email: 'joao@acme.com' });
    expect(ev.find((e) => e.kind === 'email')?.value).toBe('joao@acme.com');
    expect(ev.find((e) => e.kind === 'email_deliverable')?.value).toBe('mx1.acme.com');
  });
  it('marca para verificar quando não há MX', async () => {
    const ev = await emailSource(async () => { throw new Error('ENOTFOUND'); }).collect({ email: 'x@dominio-invalido.test' });
    expect(ev.some((e) => e.kind === 'email_no_mx')).toBe(true);
  });
});

describe('Argus · scoring', () => {
  it('gera sinais de linkedin, e-mail e presença pública', async () => {
    const result = await runInvestigation({ id: 's-1', target: { name: 'Maria', email: 'maria@acme.com' } }, {
      sources: [
        { name: 'ws', collect: async () => [{ id: '1', source: 'web-search', url: 'https://www.linkedin.com/in/maria', kind: 'linkedin_profile', value: 'https://www.linkedin.com/in/maria', collectedAt: new Date().toISOString(), confidence: 'probable' as const }] },
        { name: 'em', collect: async () => [
          { id: '2', source: 'email-mx', url: 'mailto:maria@acme.com', kind: 'email', value: 'maria@acme.com', collectedAt: new Date().toISOString(), confidence: 'confirmed' as const },
          { id: '3', source: 'email-mx', url: 'https://acme.com', kind: 'email_deliverable', value: 'mx1.acme.com', collectedAt: new Date().toISOString(), confidence: 'confirmed' as const },
        ] },
      ],
    });
    const keys = score(result.evidence).map((s) => s.key);
    expect(keys).toContain('linkedin_profile');
    expect(keys).toContain('email');
    expect(keys).toContain('email_deliverable');
    expect(keys).toContain('public_presence');
  });
});

describe('Argus · conectores pagos (opcionais)', () => {
  it('ficam inativos sem chave', () => {
    expect(hunterSource(undefined)).toBeNull();
    expect(apolloSource(undefined)).toBeNull();
  });

  it('Hunter descobre o LinkedIn a partir do e-mail (confirmed)', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ data: { linkedin: { handle: 'maria-silva' } } }), { status: 200 })) as unknown as typeof fetch;
    const ev = await hunterSource('key-test', fetcher)!.collect({ email: 'maria@acme.com' });
    expect(ev[0]).toMatchObject({ kind: 'linkedin_profile', value: 'https://www.linkedin.com/in/maria-silva', confidence: 'confirmed', source: 'hunter' });
  });

  it('Apollo descobre o LinkedIn por e-mail/nome (confirmed)', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ person: { linkedin_url: 'https://www.linkedin.com/in/joao-souza/' } }), { status: 200 })) as unknown as typeof fetch;
    const ev = await apolloSource('key-test', fetcher)!.collect({ email: 'joao@acme.com', name: 'João Souza' });
    expect(ev[0]).toMatchObject({ kind: 'linkedin_profile', value: 'https://www.linkedin.com/in/joao-souza', confidence: 'confirmed', source: 'apollo' });
  });
});

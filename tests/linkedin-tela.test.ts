import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LinkedInMark, LINKEDIN_BRAND_COLOR } from '@/components/linkedin-mark';
import {
  describeLinkedInStatus,
  formatLinkedInDate,
  LINKEDIN_STATUSES,
  LINKEDIN_STATUS_VIEW,
  LINKEDIN_TONE_CLASS,
  normalizeLinkedInConnection,
  normalizeLinkedInStatus,
} from '@/app/(app)/linkedin/status';

describe('tela do LinkedIn — estado da conexão', () => {
  it('cada status tem rótulo, tom e explicação próprios', () => {
    expect(LINKEDIN_STATUSES).toEqual(['disconnected', 'authenticated', 'configuration_required', 'unavailable']);
    for (const status of LINKEDIN_STATUSES) {
      const view = describeLinkedInStatus(status);
      expect(view.status).toBe(status);
      expect(view.label.length).toBeGreaterThan(0);
      expect(view.hint.length).toBeGreaterThan(0);
      expect(['neutral', 'good', 'warn', 'danger']).toContain(view.tone);
      expect(LINKEDIN_TONE_CLASS[view.tone].length).toBeGreaterThan(0);
      expect(view.label).toBe(LINKEDIN_STATUS_VIEW[status].label);
    }
  });

  it('o tom acompanha o estado: conectado é bom, pendente é atenção', () => {
    expect(describeLinkedInStatus('authenticated').tone).toBe('good');
    expect(describeLinkedInStatus('disconnected').tone).toBe('neutral');
    expect(describeLinkedInStatus('configuration_required').tone).toBe('warn');
    expect(describeLinkedInStatus('unavailable').tone).toBe('danger');
    expect(describeLinkedInStatus('configuration_required').label).toBe('Configuração pendente');
  });

  it('status desconhecido nunca finge estar conectado', () => {
    expect(normalizeLinkedInStatus('authenticated_x')).toBe('unavailable');
    expect(describeLinkedInStatus(undefined).status).toBe('unavailable');
    expect(describeLinkedInStatus(null).label).toBe('Indisponível');
  });

  it('normaliza a resposta da API e mantém o perfil vinculado', () => {
    const connection = normalizeLinkedInConnection({
      status: 'authenticated',
      profile: { name: 'João da Silva', email: 'joao.silva@atlasconsultoria.demo', connectedAt: '2026-11-01T10:00:00.000Z' },
    });
    expect(connection.status).toBe('authenticated');
    expect(connection.profile?.name).toBe('João da Silva');
    expect(connection.profile?.email).toBe('joao.silva@atlasconsultoria.demo');
    expect(formatLinkedInDate(connection.profile?.connectedAt)).toContain('2026');
    expect(normalizeLinkedInConnection({}).status).toBe('unavailable');
  });
});

describe('marca oficial do LinkedIn', () => {
  it('o SVG usa a cor oficial #0A66C2 com o "in" em branco', () => {
    const markup = renderToStaticMarkup(createElement(LinkedInMark, { size: 24 }));
    expect(LINKEDIN_BRAND_COLOR).toBe('#0A66C2');
    expect(markup).toContain('#0A66C2');
    expect(markup).toContain('#FFFFFF');
    expect(markup).toContain('<svg');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('width="24"');
    expect(markup).toContain('height="24"');
    expect(markup).toContain('aria-label="LinkedIn"');
  });

  it('aceita tamanho e classe sem perder a cor oficial', () => {
    const markup = renderToStaticMarkup(createElement(LinkedInMark, { size: 40, className: 'mr-2' }));
    expect(markup).toContain('#0A66C2');
    expect(markup).toContain('width="40"');
    expect(markup).toContain('class="mr-2"');
  });
});

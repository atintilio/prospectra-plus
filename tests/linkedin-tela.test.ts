import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LinkedInMark, LINKEDIN_BRAND_COLOR } from '@/components/linkedin-mark';
import {
  describeLinkedInStatus,
  formatLinkedInDate,
  linkedInStatusBadge,
  LINKEDIN_STATUSES,
  LINKEDIN_STATUS_VIEW,
  LINKEDIN_TONE_CLASS,
  normalizeLinkedInConnection,
  normalizeLinkedInStatus,
} from '@/app/(app)/linkedin/status';
import {
  LinkedInConnectButton,
  LinkedInProfileCard,
  LinkedInStatusBadge,
} from '@/app/(app)/linkedin/linkedin-view';
import { LinkedInShortcutBody } from '@/app/(app)/conta/linkedin-shortcut';

/** Razão de contraste WCAG entre duas cores hex (garantia AA do botão de marca). */
function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const value = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => {
      const channel = parseInt(value.slice(i, i + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

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

  it('pode ser decorativo quando o texto vizinho já nomeia a marca', () => {
    const markup = renderToStaticMarkup(createElement(LinkedInMark, { size: 18, decorative: true }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('aria-label=');
    expect(markup).toContain('#0A66C2');
  });
});

describe('botão de conectar com a identidade oficial', () => {
  it('traz o símbolo da marca e o azul oficial #0A66C2', () => {
    const markup = renderToStaticMarkup(createElement(LinkedInConnectButton));
    expect(markup).toContain('Conectar conta');
    expect(markup).toContain('<svg');
    expect(markup).toContain('#0A66C2');
    expect(markup).toContain('bg-[#0A66C2]');
    expect(markup).toContain('aria-label="Conectar conta do LinkedIn"');
  });

  it('não usa o azul primário do app e mantém foco visível e contraste AA', () => {
    const markup = renderToStaticMarkup(createElement(LinkedInConnectButton));
    expect(markup).not.toContain('bg-accent');
    expect(markup).toContain('text-white');
    expect(markup).toContain('focus-visible:outline-2');
    expect(markup).toContain('focus-visible:outline-[#0A66C2]');
    expect(markup).toContain('focus-visible:ring-2');
    // Texto branco sobre o azul oficial: 5,68:1 (acima de 4,5:1 do AA).
    expect(contrastRatio(LINKEDIN_BRAND_COLOR, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('avisa que está aguardando o LinkedIn e bloqueia o clique', () => {
    const markup = renderToStaticMarkup(createElement(LinkedInConnectButton, { connecting: true }));
    expect(markup).toContain('Aguardando o LinkedIn');
    expect(markup).toContain('disabled');
    expect(markup).toContain('#0A66C2');
  });
});

describe('selos de estado com a marca oficial', () => {
  it('cada selo tem rótulo, tom e símbolo', () => {
    for (const status of LINKEDIN_STATUSES) {
      const badge = linkedInStatusBadge(status);
      expect(badge.label).toBe(LINKEDIN_STATUS_VIEW[status].label);
      expect(badge.tone).toBe(describeLinkedInStatus(status).tone);
      expect(badge.symbol).toBe('linkedin');
      expect(badge.className).toContain(LINKEDIN_TONE_CLASS[badge.tone]);
      expect(badge.className).toContain('#0A66C2');
    }
  });

  it('o selo da tela usa o símbolo com a cor oficial', () => {
    const markup = renderToStaticMarkup(createElement(LinkedInStatusBadge, { status: 'authenticated' }));
    expect(markup).toContain('Conta conectada');
    expect(markup).toContain('<svg');
    expect(markup).toContain('#0A66C2');
  });

  it('o status "authenticated" aparece com o nome do perfil', () => {
    const connection = normalizeLinkedInConnection({
      status: 'authenticated',
      profile: { name: 'João da Silva', email: 'joao.silva@atlasconsultoria.demo', connectedAt: '2026-11-01T10:00:00.000Z' },
    });
    const badge = renderToStaticMarkup(createElement(LinkedInStatusBadge, { status: connection.status }));
    const card = renderToStaticMarkup(createElement(LinkedInProfileCard, { connection }));
    expect(badge).toContain('Conta conectada');
    expect(card).toContain('João da Silva');
    expect(card).toContain('joao.silva@atlasconsultoria.demo');
    expect(card).toContain('2026');
    expect(card).toContain('#0A66C2');
  });
});

describe('atalho da conta (/conta)', () => {
  it('mantém o símbolo e mostra "Conectar conta" quando a conta não está conectada', () => {
    const markup = renderToStaticMarkup(createElement(LinkedInShortcutBody, { connection: { status: 'disconnected' } }));
    expect(markup).toContain('#0A66C2');
    expect(markup).toContain('Conectar conta');
    expect(markup).toContain('/linkedin');
  });

  it('mostra a conta conectada com o nome do perfil', () => {
    const markup = renderToStaticMarkup(
      createElement(LinkedInShortcutBody, { connection: { status: 'authenticated', profile: { name: 'João da Silva' } } }),
    );
    expect(markup).toContain('Conta conectada');
    expect(markup).toContain('João da Silva');
    expect(markup).not.toContain('Conectar conta');
  });
});

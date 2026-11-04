import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChannelMark, DragHandleMark, EMAIL_BRAND_COLOR } from '@/components/channel-marks';
import { LINKEDIN_BRAND_COLOR } from '@/components/linkedin-mark';
import { WHATSAPP_BRAND_COLOR } from '@/components/whatsapp-mark';

/**
 * Os blocos do construtor de fluxos usam o selo do canal: LinkedIn no azul
 * oficial, WhatsApp no verde oficial e e-mail num envelope pintado. É a regra
 * de marca do app — a origem externa aparece com o símbolo e a cor dela.
 */
describe('selos de canal do construtor de fluxos', () => {
  it('LinkedIn usa o azul oficial e o "in" da marca', () => {
    const markup = renderToStaticMarkup(createElement(ChannelMark, { channel: 'linkedin', size: 24 }));
    expect(markup).toContain(LINKEDIN_BRAND_COLOR);
    expect(markup).toContain('#0A66C2');
    expect(markup).toContain('M5.337 7.433');
  });

  it('WhatsApp usa o verde oficial e o balão da marca', () => {
    const markup = renderToStaticMarkup(createElement(ChannelMark, { channel: 'whatsapp', size: 24 }));
    expect(markup).toContain(WHATSAPP_BRAND_COLOR);
    expect(markup).toContain('#25D366');
    expect(markup).toContain('M17.472 14.382');
  });

  it('e-mail usa envelope pintado em âmbar (sem colidir com o azul do app)', () => {
    const markup = renderToStaticMarkup(createElement(ChannelMark, { channel: 'email', size: 24 }));
    expect(markup).toContain(EMAIL_BRAND_COLOR);
    // envelope desenhado no selo (caminho preenchido), nao um icone generico
    expect(markup).toContain('M2.6 7.4A2.9 2.9 0 0 1 5.5 4.5');
    expect(markup).not.toContain('#155dfc');
  });

  it('o punho de arraste é um desenho próprio (seis pontos)', () => {
    const markup = renderToStaticMarkup(createElement(DragHandleMark, { size: 18 }));
    expect(markup.match(/<circle/g)?.length).toBe(6);
    expect(markup).toContain('fill="currentColor"');
  });
});

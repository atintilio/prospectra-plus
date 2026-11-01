import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhatsAppMark, WHATSAPP_BRAND_COLOR } from '@/components/whatsapp-mark';
import {
  INTEGRATION_STATE_LABEL,
  INTEGRATION_TONE_CLASS,
  IntegrationBadge,
} from '@/components/integration-badge';
import {
  describeWhatsAppStatus,
  WHATSAPP_STATUS_VIEW,
} from '@/app/(app)/whatsapp/status';

describe('marca oficial do WhatsApp', () => {
  it('o símbolo usa a cor oficial #25D366', () => {
    const markup = renderToStaticMarkup(createElement(WhatsAppMark, { size: 24 }));
    expect(WHATSAPP_BRAND_COLOR).toBe('#25D366');
    expect(markup).toContain('#25D366');
    expect(markup).toContain('<svg');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('width="24"');
    expect(markup).toContain('height="24"');
    expect(markup).toContain('aria-label="WhatsApp"');
  });

  it('o símbolo é o glifo oficial (telefone dentro do balão), não um desenho novo', () => {
    const markup = renderToStaticMarkup(createElement(WhatsAppMark, {}));
    // Balão do WhatsApp + telefone: os traços oficiais da marca.
    expect(markup).toContain('M17.472 14.382');
    expect(markup).toContain('m-5.421 7.403');
    expect(markup).toContain('m8.413-18.297');
    expect(markup.match(/<path/g)?.length).toBe(1);
  });

  it('aceita tamanho e classe sem perder a cor oficial', () => {
    const markup = renderToStaticMarkup(createElement(WhatsAppMark, { size: 40, className: 'mr-2' }));
    expect(markup).toContain('#25D366');
    expect(markup).toContain('width="40"');
    expect(markup).toContain('height="40"');
    expect(markup).toContain('class="mr-2"');
  });
});

describe('selo de integração', () => {
  it('renderiza o nome da integração e o estado', () => {
    const markup = renderToStaticMarkup(
      createElement(IntegrationBadge, {
        name: 'WhatsApp',
        state: 'ok',
        status: 'Pareado',
        symbol: createElement(WhatsAppMark, { size: 16 }),
      }),
    );
    expect(markup).toContain('WhatsApp');
    expect(markup).toContain('Pareado');
    expect(markup).toContain('#25D366');
    expect(markup).toContain('data-state="ok"');
  });

  it('cada estado usa as classes de tom que já existem no design', () => {
    expect(INTEGRATION_TONE_CLASS.ok).toBe('bg-success-soft text-success');
    expect(INTEGRATION_TONE_CLASS.alerta).toBe('bg-warning-soft text-warning');
    expect(INTEGRATION_TONE_CLASS.neutro).toBe('bg-surface text-muted');
    expect(INTEGRATION_STATE_LABEL.ok.length).toBeGreaterThan(0);
    expect(INTEGRATION_STATE_LABEL.alerta.length).toBeGreaterThan(0);
    expect(INTEGRATION_STATE_LABEL.neutro.length).toBeGreaterThan(0);

    const ok = renderToStaticMarkup(createElement(IntegrationBadge, { name: 'WhatsApp', state: 'ok' }));
    expect(ok).toContain('bg-success-soft');
    expect(ok).toContain(INTEGRATION_STATE_LABEL.ok);

    const alerta = renderToStaticMarkup(createElement(IntegrationBadge, { name: 'WhatsApp', state: 'alerta' }));
    expect(alerta).toContain('bg-warning-soft');
    expect(alerta).toContain(INTEGRATION_STATE_LABEL.alerta);

    const neutro = renderToStaticMarkup(createElement(IntegrationBadge, { name: 'WhatsApp', state: 'neutro' }));
    expect(neutro).toContain('bg-surface');
    expect(neutro).toContain(INTEGRATION_STATE_LABEL.neutro);
  });
});

describe('estados do WhatsApp na tela', () => {
  it('pareado é o tom verde (ok), pareando pede atenção e desconectado é neutro', () => {
    expect(describeWhatsAppStatus('connected').tone).toBe('ok');
    expect(describeWhatsAppStatus('connected').label).toBe('Pareado');
    expect(describeWhatsAppStatus('connecting').tone).toBe('alerta');
    expect(describeWhatsAppStatus('connecting').label).toBe('Pareando');
    expect(describeWhatsAppStatus('qr_ready').tone).toBe('alerta');
    expect(describeWhatsAppStatus('qr_ready').label).toBe('Pareando');
    expect(describeWhatsAppStatus('disconnected').tone).toBe('neutro');
    expect(describeWhatsAppStatus('disconnected').label).toBe('Desconectado');
  });

  it('todo estado tem rótulo, tom e explicação, e estado desconhecido não finge pareamento', () => {
    for (const state of Object.keys(WHATSAPP_STATUS_VIEW) as (keyof typeof WHATSAPP_STATUS_VIEW)[]) {
      const view = WHATSAPP_STATUS_VIEW[state];
      expect(view.label.length).toBeGreaterThan(0);
      expect(view.hint.length).toBeGreaterThan(0);
      expect(['ok', 'alerta', 'neutro']).toContain(view.tone);
    }
    const desconhecido = describeWhatsAppStatus('state_desconhecido' as never);
    expect(desconhecido.tone).toBe('alerta');
    expect(desconhecido.label).not.toBe('Pareado');
    expect(describeWhatsAppStatus(undefined).label).not.toBe('Pareado');
  });
});

import { count, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as schema from '../src/db/schema';
import { validateFlowSteps } from '@/lib/flows/validate';
import { FLOW_STEP_BLOCKS } from '@/lib/flows/types';
import { ensureDemo } from '@/lib/demo';
import { listFlows } from '@/app/(app)/fluxos/flows';
import { seedOrg, testDb } from './helpers';

// O construtor chama a server action ao salvar; na tela ela nunca dispara.
vi.mock('../src/app/(app)/fluxos/actions', () => ({ saveFlowAction: vi.fn() }));

const { FlowBuilder } = await import('@/app/(app)/fluxos/[id]/builder');

const features = { image: false, call: false, linkedin: false };
const featuresOn = { image: true, call: true, linkedin: true };

function step(over: Partial<{ id: string; position: number; type: 'react' | 'message' | 'invite' | 'image'; name: string; delayDays: number; condition: 'always' | 'accepted'; template: string; useAi: boolean }> = {}) {
  return {
    id: 'b1',
    position: 0,
    type: 'message' as const,
    name: '',
    delayDays: 0,
    condition: 'always' as const,
    template: 'Olá {nome}',
    useAi: false,
    subject: '',
    mediaUrl: '',
    ...over,
  };
}

describe('construtor de fluxo — o que o servidor aceita', () => {
  it('recusa bloco novo de recurso travado na operação', () => {
    const erro = validateFlowSteps(features, [step({ type: 'invite' })]);
    expect(erro).toContain('Convite');
  });

  it('mantém etapa que já existia e ficou travada', () => {
    const erro = validateFlowSteps(features, [step({ id: 'existente', type: 'invite' })], new Set(['existente']));
    expect(erro).toBeNull();
  });

  it('na demonstração o gate não prende a construção', () => {
    const erro = validateFlowSteps(features, [step({ type: 'invite' })], new Set<string>(), { demo: true });
    expect(erro).toBeNull();
  });

  it('exige texto (ou IA) em todo bloco que manda mensagem', () => {
    expect(validateFlowSteps(featuresOn, [step({ template: '', useAi: false })])).toContain('texto');
    expect(validateFlowSteps(featuresOn, [step({ template: '', useAi: true })])).toBeNull();
  });

  it('reação do LinkedIn roda sem texto', () => {
    expect(validateFlowSteps(featuresOn, [step({ type: 'react', template: '', useAi: false })])).toBeNull();
  });

  it('todo bloco tem rótulo e ícone próprios', () => {
    for (const [type, bloco] of Object.entries(FLOW_STEP_BLOCKS)) {
      expect(bloco.label.length).toBeGreaterThan(0);
      expect(bloco.short.length).toBeGreaterThan(0);
      expect(bloco.icon).toBeTruthy();
      expect(Object.keys(FLOW_STEP_BLOCKS)).toContain(type);
    }
  });
});

describe('tela do construtor de fluxo', () => {
  it('mostra a sequência, o dia acumulado e os blocos travados', () => {
    const markup = renderToStaticMarkup(createElement(FlowBuilder, {
      flowId: '11111111-1111-4111-8111-111111111111',
      initialName: 'Abertura quente',
      initialStatus: 'active',
      initialSteps: [
        step({ id: 'b1', type: 'react', name: 'Reagir ao post', delayDays: 0, template: '' }),
        step({ id: 'b2', position: 1, type: 'message', name: 'Mensagem', delayDays: 3, template: 'Olá {nome}' }),
      ],
      available: ['react', 'message', 'email'],
      blocked: [{ type: 'invite', reason: 'LinkedIn não ativado' }],
    }));
    expect(markup).toContain('Abertura quente');
    expect(markup).toContain('Reagir ao post');
    expect(markup).toContain('Dia 3');
    expect(markup).toContain('Travados na operação');
    expect(markup).toContain('Convite');
  });
});

describe('demonstração — o módulo de fluxos aparece pronto', () => {
  it('semeia dois fluxos e liga um deles a uma campanha', async () => {
    const db = await testDb();
    const { user } = await seedOrg(db, 'Real');
    const orgId = await ensureDemo(db, user);
    const flows = await db.select().from(schema.flows).where(eq(schema.flows.orgId, orgId));
    expect(flows.length).toBe(2);
    const steps = await db.select().from(schema.flowSteps).where(eq(schema.flowSteps.orgId, orgId));
    expect(steps.length).toBeGreaterThan(4);
    const ligados = await db.select().from(schema.campaigns)
      .where(eq(schema.campaigns.orgId, orgId));
    expect(ligados.filter((c) => c.flowId).length).toBe(1);
    const doFlow = ligados.find((c) => c.flowId)!;
    expect(flows.some((f) => f.id === doFlow.flowId)).toBe(true);
    const contagem = await db.select({ n: count() }).from(schema.flowSteps).where(eq(schema.flowSteps.orgId, orgId));
    expect(contagem[0].n).toBe(steps.length);
  });
});

describe('lista de fluxos — contagens reais', () => {
  it('conta os blocos do fluxo e as campanhas que o usam', async () => {
    const db = await testDb();
    const { org, user } = await seedOrg(db, 'Real');
    const [flow] = await db.insert(schema.flows).values({ orgId: org.id, name: 'Abertura quente' }).returning();
    await db.insert(schema.flowSteps).values([
      { flowId: flow.id, orgId: org.id, position: 0, type: 'react' },
      { flowId: flow.id, orgId: org.id, position: 1, type: 'message' },
      { flowId: flow.id, orgId: org.id, position: 2, type: 'invite' },
    ]);
    await db.insert(schema.campaigns).values({ orgId: org.id, ownerId: user.id, name: 'CFO', flowId: flow.id });

    const rows = await listFlows(db, org.id);
    expect(rows.length).toBe(1);
    expect(rows[0].steps).toBe(3);
    expect(rows[0].campaigns).toBe(1);

    // fluxo de outra operação não aparece
    const { org: outra } = await seedOrg(db, 'Outra');
    expect((await listFlows(db, outra.id)).length).toBe(0);
  });
});

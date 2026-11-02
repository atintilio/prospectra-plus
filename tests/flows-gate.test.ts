import { describe, expect, it } from 'vitest';
import { campaignFeatures, type CampaignFeatures } from '@/lib/campaign-features';
import { availableFlowStepTypes, flowBlockedTypes, flowStepTypeEnabled } from '@/lib/flows/gate';
import { reorderFlowSteps } from '@/lib/flows/order';
import * as schema from '@/db/schema';
import { seedOrg, testDb } from './helpers';

/** Operação com tudo desligado: só os tipos sem gate ficam disponíveis. */
const SEM_RECURSO: CampaignFeatures = campaignFeatures({
  active: true, isDemo: false, imageEnabled: false, callEnabled: false, linkedinEnabled: false,
});

describe('gate do fluxo nativo', () => {
  it('tipo bloqueado não entra na paleta', () => {
    expect(availableFlowStepTypes(SEM_RECURSO)).toEqual(['email', 'whatsapp', 'voice']);
    expect(availableFlowStepTypes(SEM_RECURSO)).not.toContain('image');
    expect(availableFlowStepTypes(SEM_RECURSO)).not.toContain('invite');
  });

  it('a paleta devolve todos os tipos travados', () => {
    expect(flowBlockedTypes(SEM_RECURSO)).toEqual(['react', 'comment', 'invite', 'message', 'image', 'call']);
    expect(flowStepTypeEnabled(SEM_RECURSO, 'image')).toBe(false);
    expect(flowStepTypeEnabled(SEM_RECURSO, 'invite')).toBe(false);
    expect(flowStepTypeEnabled(SEM_RECURSO, 'whatsapp')).toBe(true);
  });

  it('recurso ligado libera o bloco correspondente', () => {
    const comImagem = campaignFeatures({ active: true, isDemo: false, imageEnabled: true, callEnabled: false, linkedinEnabled: false });
    expect(flowStepTypeEnabled(comImagem, 'image')).toBe(true);
    expect(availableFlowStepTypes(comImagem)).toContain('image');
    expect(flowBlockedTypes(comImagem)).not.toContain('image');

    const comLinkedIn = campaignFeatures({ active: true, isDemo: false, imageEnabled: false, callEnabled: false, linkedinEnabled: true });
    expect(flowStepTypeEnabled(comLinkedIn, 'invite')).toBe(true);
    expect(flowStepTypeEnabled(comLinkedIn, 'message')).toBe(true);
    expect(flowStepTypeEnabled(comLinkedIn, 'react')).toBe(true);
    expect(flowStepTypeEnabled(comLinkedIn, 'comment')).toBe(true);
    expect(flowBlockedTypes(comLinkedIn)).toEqual(['image', 'call']);
  });

  it('etapa já existente de recurso desligado continua visível, mas sinalizada como travada', async () => {
    const db = await testDb();
    const { org } = await seedOrg(db);
    const [flow] = await db.insert(schema.flows).values({ orgId: org.id, name: 'Fluxo com imagem' }).returning();
    await db.insert(schema.flowSteps).values([
      { flowId: flow.id, orgId: org.id, position: 0, type: 'invite' },
      { flowId: flow.id, orgId: org.id, position: 1, type: 'image' },
    ]);

    const etapas = await db.select().from(schema.flowSteps);
    expect(etapas).toHaveLength(2);

    const bloqueada = etapas.find((e) => e.type === 'image');
    expect(bloqueada).toBeDefined();
    // A etapa não sai da lista (o vendedor precisa ver o que está no fluxo)...
    expect(bloqueada?.type).toBe('image');
    // ...mas o gate avisa que ela não pode ser usada nesta operação.
    expect(flowStepTypeEnabled(SEM_RECURSO, bloqueada!.type)).toBe(false);
    expect(flowBlockedTypes(SEM_RECURSO)).toContain(bloqueada!.type);
  });
});

describe('ordem das etapas do fluxo', () => {
  const etapas = [
    { id: 'a', position: 0, type: 'react' as const, name: 'Reagir' },
    { id: 'b', position: 1, type: 'invite' as const, name: 'Convidar' },
    { id: 'c', position: 2, type: 'message' as const, name: 'Mensagem' },
  ];

  it('move a etapa para a posição final correta', () => {
    const nova = reorderFlowSteps(etapas, 0, 2);
    expect(nova.map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(nova.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it('move para cima sem buraco e sem duplicar etapa', () => {
    const nova = reorderFlowSteps(etapas, 2, 0);
    expect(nova.map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(nova.map((e) => e.position)).toEqual([0, 1, 2]);
    expect(nova).toHaveLength(etapas.length);
    expect(new Set(nova.map((e) => e.id)).size).toBe(etapas.length);
  });

  it('preserva a etapa movida e os demais campos', () => {
    const nova = reorderFlowSteps(etapas, 1, 2);
    const movida = nova.find((e) => e.id === 'b');
    expect(movida).toBeDefined();
    expect(movida?.name).toBe('Convidar');
    expect(movida?.type).toBe('invite');
    expect(movida?.position).toBe(2);
  });

  it('renumera a partir de 0 mesmo quando a lista chega com buraco', () => {
    const comBuraco = [
      { id: 'a', position: 0 },
      { id: 'b', position: 5 },
      { id: 'c', position: 9 },
    ];
    const nova = reorderFlowSteps(comBuraco, 0, 1);
    expect(nova.map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(nova.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it('não mexe na lista original', () => {
    const original = [...etapas];
    reorderFlowSteps(etapas, 0, 2);
    expect(etapas).toEqual(original);
  });

  it('posição inválida é recusada', () => {
    expect(() => reorderFlowSteps(etapas, 0, 9)).toThrow(RangeError);
    expect(() => reorderFlowSteps(etapas, -1, 0)).toThrow(RangeError);
    expect(reorderFlowSteps([], 0, 0)).toEqual([]);
  });
});

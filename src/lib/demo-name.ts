// Nome de exibição da operação de demonstração.
//
// No banco a operação de demonstração se chama "Demonstração · Atlas Consultoria"
// (cenário fictício interno, com nome de empresa para a demo contar uma história).
// O dono não conhece e não quer conhecer esse nome: na interface a demonstração
// aparece sempre como "Ambiente de demonstração".
//
// O BANCO NÃO É RENOMEADO — isto aqui é só o que a pessoa lê na tela.

export const DEMO_DISPLAY_NAME = 'Ambiente de demonstração';

/** Nome da operação como a pessoa vê: na demo, o rótulo genérico. */
export function displayOrgName(org: { name: string; isDemo: boolean }): string {
  return org.isDemo ? DEMO_DISPLAY_NAME : org.name;
}

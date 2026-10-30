import { describe, expect, test } from 'vitest';
import { decideRepair } from '../scripts/migrate-repair.mjs';

describe('decisao de auto-cura da migration', () => {
  test('banco completo nao mexe em nada', () => {
    expect(decideRepair({ faltando: 0, tem_ledger: true })).toEqual({ acao: 'nenhuma', motivo: 'schema completo' });
  });

  test('schema inteiro ausente com ledger recria', () => {
    const r = decideRepair({ faltando: 3, tem_ledger: true });
    expect(r.acao).toBe('recriar');
  });

  test('estado parcial aborta sem apagar nada', () => {
    const r = decideRepair({ faltando: 1, tem_ledger: true });
    expect(r.acao).toBe('abortar');
    expect(r.motivo).toContain('nada foi apagado');
  });

  test('sem ledger aborta mesmo com as tabelas ausentes', () => {
    expect(decideRepair({ faltando: 3, tem_ledger: false }).acao).toBe('abortar');
  });

  test('PROSPERTA_DB_REPAIR=0 desliga a auto-cura', () => {
    const r = decideRepair({ faltando: 3, tem_ledger: true, autoCura: false });
    expect(r.acao).toBe('abortar');
    expect(r.motivo).toContain('auto-cura esta desligada');
  });
});

export declare const CORE_TABLES: readonly ['users', 'orgs', 'leads'];

export declare function decideRepair(estado: {
  faltando: number;
  tem_ledger: boolean;
  autoCura?: boolean;
}): {
  acao: 'nenhuma' | 'recriar' | 'abortar';
  motivo: string;
};

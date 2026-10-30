// Decide o que a migration faz quando o schema da aplicação não bate com o
// ledger do drizzle. Extraído do scripts/migrate.mjs para poder ser testado
// sem tocar em banco de produção.
//
// Contexto: o ledger (`drizzle.__drizzle_migrations`) pode sobreviver a um banco
// recriado ou limpo — as tabelas do app somem, mas o registro das migrações
// continua. O drizzle então acha que já aplicou tudo, não recria nada, e toda
// rota que toca o banco quebra com `relation "users" does not exist`.
//
// A correção recria o schema do zero, então ela só pode rodar no estado
// quebrado, nunca num banco em uso. Por isso o estado parcial ABORTA em vez de
// apagar qualquer coisa.

export const CORE_TABLES = ['users', 'orgs', 'leads'];

/**
 * @param {{ faltando: number, tem_ledger: boolean, autoCura?: boolean }} estado
 * @returns {{ acao: 'nenhuma'|'recriar'|'abortar', motivo: string }}
 */
export function decideRepair(estado) {
  const faltando = Number(estado.faltando) || 0;
  const temLedger = Boolean(estado.tem_ledger);
  const autoCura = estado.autoCura !== false;

  if (faltando <= 0) return { acao: 'nenhuma', motivo: 'schema completo' };

  const total = CORE_TABLES.length;
  if (faltando !== total || !temLedger) {
    return {
      acao: 'abortar',
      motivo:
        `${faltando} de ${total} tabelas centrais ausentes (ledger presente: ${temLedger}). ` +
        'Estado parcial — nada foi apagado; inspecione o banco antes de seguir.',
    };
  }
  if (!autoCura) {
    return {
      acao: 'abortar',
      motivo:
        'schema da aplicacao ausente e PROSPERTA_DB_REPAIR=0: ' +
        'a auto-cura esta desligada e nada foi alterado.',
    };
  }
  return {
    acao: 'recriar',
    motivo: `schema da aplicacao ausente (${faltando}/${total} tabelas, ledger presente)`,
  };
}

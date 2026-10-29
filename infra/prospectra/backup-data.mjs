// Snapshot consistente dos dados; o schema é reproduzido pelas migrações do commit.
import { mkdir, writeFile } from 'node:fs/promises';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const database = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 });
try {
  const snapshot = await database.begin('isolation level repeatable read read only', async tx => {
    const tables = await tx`select table_schema, table_name from information_schema.tables
      where table_type='BASE TABLE' and table_schema in ('public','drizzle')
      order by table_schema, table_name`;
    const result = {};
    for (const { table_schema: schema, table_name: name } of tables) {
      result[`${schema}.${name}`] = Array.from(await tx`select * from ${tx(schema)}.${tx(name)}`);
    }
    return result;
  });
  const directory = '/var/backups/prospectra-plus';
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = `${directory}/data-${new Date().toISOString().replaceAll(':', '-')}.json`;
  await writeFile(file, JSON.stringify({ createdAt: new Date().toISOString(), tables: snapshot }),
    { mode: 0o600, flag: 'wx' });
  const rows = Object.values(snapshot).reduce((sum, values) => sum + values.length, 0);
  console.log(JSON.stringify({ file, tables: Object.keys(snapshot).length, rows }));
} finally {
  await database.end({ timeout: 3 });
}

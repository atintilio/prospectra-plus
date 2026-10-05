import mysql, { type Pool } from 'mysql2/promise';

let pool: Pool | undefined;
let schemaPromise: Promise<void> | undefined;

export function getDb(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('AUTH_DATABASE_NOT_CONFIGURED');
  if (!pool) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 4,
      enableKeepAlive: true,
      ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: true },
    });
  }
  return pool;
}

export async function ensureAuthSchema(): Promise<Pool> {
  const database = getDb();
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await database.query(`CREATE TABLE IF NOT EXISTS prospectra_users (
        id CHAR(36) PRIMARY KEY,
        email VARCHAR(320) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'master',
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        INDEX idx_prospectra_users_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await database.query(`CREATE TABLE IF NOT EXISTS prospectra_password_resets (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at DATETIME(3) NOT NULL,
        used_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_prospectra_password_resets_user (user_id),
        INDEX idx_prospectra_password_resets_expiry (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    })().catch((error) => { schemaPromise = undefined; throw error; });
  }
  await schemaPromise;
  return database;
}

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export function isDatabaseConfigured(): boolean {
  const connUrl = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (connUrl) return true;
  return Boolean(
    process.env.SQL_HOST?.trim() &&
      process.env.SQL_USER?.trim() &&
      process.env.SQL_DB_NAME?.trim()
  );
}

function buildPoolConfig(): PoolConfig {
  const connectionString =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();

  if (connectionString) {
    const disableSsl =
      connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1') ||
      connectionString.includes('sslmode=disable');

    return {
      connectionString,
      max: 10,
      connectionTimeoutMillis: 15000,
      ...(disableSsl ? {} : { ssl: { rejectUnauthorized: false } }),
    };
  }

  const useSsl = process.env.SQL_SSL === 'true';
  return {
    host: process.env.SQL_HOST,
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    max: 10,
    connectionTimeoutMillis: 15000,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool(buildPoolConfig());

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });

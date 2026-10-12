import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  /** Applies pending migrations from the `drizzle` folder (relative to the working directory). */
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const migrationsFolder = path.resolve('drizzle');

export function connectPostgres(url: string): Database {
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzlePostgres(client, { schema });
  return {
    db,
    migrate: () => migratePostgres(db, { migrationsFolder }),
    close: () => client.end({ timeout: 5 }),
  };
}

/**
 * Embedded Postgres (WASM) for local development and tests, so no Docker is needed.
 * Loaded lazily: it is a dev dependency. Without `dataDir` the database lives in memory.
 */
export async function connectPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  // PGlite does not create missing parent folders.
  if (dataDir) mkdirSync(path.resolve(dataDir), { recursive: true });
  const client = dataDir ? new PGlite(path.resolve(dataDir)) : new PGlite();
  const db = drizzle(client, { schema });
  return {
    db,
    migrate: () => migrate(db, { migrationsFolder }),
    close: () => client.close(),
  };
}

export async function connect(env: { DATABASE_URL?: string | undefined; PGLITE_DIR: string }): Promise<Database> {
  return env.DATABASE_URL ? connectPostgres(env.DATABASE_URL) : connectPglite(env.PGLITE_DIR);
}

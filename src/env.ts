import { z } from 'zod';

const DEV_AUTH_SECRET = 'development-only-secret-never-used-on-a-server';

const schema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8787),
  /** Postgres connection string. Without it the app uses an embedded PGlite database (dev only). */
  DATABASE_URL: z.url().optional(),
  PGLITE_DIR: z.string().default('.data/pglite'),
  /** Where this site is reached from outside. */
  PUBLIC_URL: z.url().default('http://localhost:8787'),
  /** Signs sessions. At least 32 random characters in production (openssl rand -hex 32). */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof schema> & { BETTER_AUTH_SECRET: string };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = schema.parse(source);
  if (env.APP_ENV === 'production' && (!env.BETTER_AUTH_SECRET || !env.DATABASE_URL)) {
    throw new Error('BETTER_AUTH_SECRET and DATABASE_URL are required in production');
  }
  return { ...env, BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET };
}

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Db } from './db/client';
import * as schema from './db/schema';
import type { Env } from './env';

export const MIN_PASSWORD_LENGTH = 8;

/** Any email and password may sign up; no verification yet (prototype). */
export function createAuth(env: Env, db: Db) {
  return betterAuth({
    appName: 'Lectures',
    baseURL: env.PUBLIC_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    session: { expiresIn: 60 * 60 * 24 * 60 },
  });
}

export type Auth = ReturnType<typeof createAuth>;

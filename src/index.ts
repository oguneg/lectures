import { serve } from '@hono/node-server';
import { createAuth } from './auth';
import { connect } from './db/client';
import { loadEnv } from './env';
import { createApp } from './web/app';

const env = loadEnv();
const database = await connect(env);
await database.migrate();

const app = createApp({ db: database.db, auth: createAuth(env, database.db) });
const server = serve({ fetch: app.fetch, hostname: env.HOST, port: env.PORT }, (info) => {
  console.log(`lectures on ${env.PUBLIC_URL} (port ${info.port}, ${env.DATABASE_URL ? 'postgres' : `pglite:${env.PGLITE_DIR}`})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close();
    void database.close().finally(() => process.exit(0));
  });
}

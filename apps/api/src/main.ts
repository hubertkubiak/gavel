import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

const { app } = await buildApp({
  seedFast: process.env.SEED_FAST === '1',
  latencyMs: Number(process.env.LATENCY_MS ?? 0),
  corsOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:4200').split(','),
  log: process.env.RPC_LOG !== '0',
});

await app.listen({ port, host });
console.info(`🔨 Gavel API listening on http://localhost:${port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app.close().then(() => process.exit(0));
  });
}

import { cors as connectCors } from '@connectrpc/connect';
import { fastifyConnectPlugin } from '@connectrpc/connect-fastify';
import fastifyCors from '@fastify/cors';
import { fastify } from 'fastify';
import { AuctionEvents } from './auction.events.js';
import { AuctionStore } from './auction.store.js';
import { authInterceptor, latencyInterceptor, loggingInterceptor } from './auth.interceptor.js';
import { createRoutes } from './routes.js';
import { AuctionScheduler } from './scheduler.js';

export interface AppOptions {
  store?: AuctionStore;
  events?: AuctionEvents;
  seedFast?: boolean;
  latencyMs?: number;
  heartbeatMs?: number;
  corsOrigins?: string[];
  log?: boolean;
}

/** Builds the Fastify app with the Connect plugin. Shared by main.ts and integration tests. */
export async function buildApp(options: AppOptions = {}) {
  const store = options.store ?? AuctionStore.seeded({ fast: options.seedFast });
  const events = options.events ?? new AuctionEvents();
  const scheduler = new AuctionScheduler(store, events);

  const app = fastify({ logger: false });

  await app.register(fastifyCors, {
    origin: options.corsOrigins ?? ['http://localhost:4200'],
    methods: [...connectCors.allowedMethods],
    allowedHeaders: [...connectCors.allowedHeaders, 'Authorization'],
    exposedHeaders: [...connectCors.exposedHeaders],
    maxAge: 7200,
  });

  await app.register(fastifyConnectPlugin, {
    interceptors: [
      ...(options.log ? [loggingInterceptor] : []),
      authInterceptor,
      latencyInterceptor(options.latencyMs ?? 0),
    ],
    routes: createRoutes({ store, events, heartbeatMs: options.heartbeatMs }),
  });

  app.get('/healthz', () => ({ ok: true }));

  scheduler.start();
  app.addHook('onClose', async () => scheduler.stop());

  return { app, store, events, scheduler };
}

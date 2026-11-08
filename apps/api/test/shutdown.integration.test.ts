import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { AuctionService } from '@gavel/proto';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('graceful shutdown', () => {
  it('app.close() ends open WatchItem streams instead of waiting for clients', async () => {
    const { app, events } = await buildApp({ heartbeatMs: 50 });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const client = createClient(
      AuctionService,
      createConnectTransport({ baseUrl, httpVersion: '1.1' }),
    );

    const { items } = await client.listItems({});
    const itemId = items[0]!.id;
    const stream = client.watchItem({ itemId })[Symbol.asyncIterator]();
    await stream.next(); // snapshot — the stream is open on the server
    expect(events.viewerCount(itemId)).toBe(1);

    // Drain the stream in the background; it must finish once the server shuts down.
    const drained = (async () => {
      try {
        for (;;) if ((await stream.next()).done) return;
      } catch {
        /* a transport error is fine too — the point is that it ends */
      }
    })();

    const closed = app.close().then(() => 'closed' as const);
    const timeout = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 2000));
    expect(await Promise.race([closed, timeout])).toBe('closed');
    await drained;
    expect(events.viewerCount(itemId)).toBe(0);
  });
});

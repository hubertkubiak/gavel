import { createClient, type Transport } from '@connectrpc/connect';
import { createConnectTransport, createGrpcWebTransport } from '@connectrpc/connect-node';
import { AuctionService, type ItemEvent } from '@gavel/proto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AuctionEvents } from '../src/auction.events.js';

let baseUrl: string;
let events: AuctionEvents;
let close: () => Promise<void>;

// A real Fastify server on a random port, exercised by real Connect clients.
beforeAll(async () => {
  const built = await buildApp();
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}`;
  events = built.events;
  close = () => built.app.close();
});
afterAll(() => close());

async function until(it: AsyncIterator<ItemEvent>, pred: (e: ItemEvent) => boolean) {
  for (;;) {
    const r = await it.next();
    if (r.done) throw new Error('stream ended');
    if (pred(r.value)) return r.value;
  }
}

const transports: [string, () => Transport][] = [
  ['Connect', () => createConnectTransport({ baseUrl, httpVersion: '1.1' })],
  ['gRPC-Web', () => createGrpcWebTransport({ baseUrl, httpVersion: '1.1' })],
];

describe.each(transports)('WatchItem over %s', (_, transport) => {
  it('streams a snapshot, a bid from a second client, and tracks viewers', async () => {
    const watcher = createClient(AuctionService, transport());
    const bidder = createClient(AuctionService, transport());
    const { items } = await watcher.listItems({});
    const item = items[0]!;

    const ac = new AbortController();
    const call = watcher.watchItem({ itemId: item.id }, { signal: ac.signal });
    const stream = call[Symbol.asyncIterator]();

    const first = await stream.next();
    expect(first.value?.event.case).toBe('snapshot');
    await expect.poll(() => events.viewerCount(item.id)).toBe(1);

    const { item: fresh } = await bidder.getItem({ itemId: item.id });
    const minimum = fresh!.currentPrice!.amountMinor + fresh!.minIncrement!.amountMinor;
    await bidder.placeBid(
      { itemId: item.id, amount: { amountMinor: minimum, currency: 'PLN' } },
      { headers: { Authorization: 'Bearer integration' } },
    );

    const bid = await until(stream, (e) => e.event.case === 'bidPlaced');
    expect(bid.event.case === 'bidPlaced' && bid.event.value.bidder).toBe('integration');

    ac.abort();
    await expect.poll(() => events.viewerCount(item.id)).toBe(0);
    await expect.poll(() => events.listenerCount(item.id)).toBe(0);
  });
});

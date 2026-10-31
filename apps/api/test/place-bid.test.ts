import { Code, ConnectError } from '@connectrpc/connect';
import { BidRejectedDetailSchema, ItemStatus } from '@gavel/proto';
import { describe, expect, it } from 'vitest';
import { pln } from '../src/auction.store.js';
import { fixture } from './helpers.js';

async function codeOf(p: Promise<unknown>): Promise<Code | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return ConnectError.from(e).code;
  }
}

describe('PlaceBid', () => {
  it('accepts a valid bid and updates the item', async () => {
    const { client, as } = fixture();
    const res = await client.placeBid({ itemId: 'lamp', amount: pln(150) }, as('alice'));
    expect(res.bid?.bidder).toBe('alice');
    expect(res.item?.currentPrice?.amountMinor).toBe(15_000n);
    expect(res.item?.bidCount).toBe(1);
    expect(res.item?.leadingBidder).toBe('alice');
  });

  it.each([
    ['empty item_id', { itemId: '', amount: pln(150) }],
    ['zero amount', { itemId: 'lamp', amount: pln(0) }],
    ['negative amount', { itemId: 'lamp', amount: pln(-5) }],
    ['missing amount', { itemId: 'lamp' }],
    ['wrong currency', { itemId: 'lamp', amount: { amountMinor: 15_000n, currency: 'EUR' } }],
  ])('rejects %s with INVALID_ARGUMENT', async (_, req) => {
    const { client, as } = fixture();
    expect(await codeOf(client.placeBid(req, as('alice')))).toBe(Code.InvalidArgument);
  });

  it('rejects unknown items with NOT_FOUND', async () => {
    const { client, as } = fixture();
    expect(await codeOf(client.placeBid({ itemId: 'nope', amount: pln(150) }, as('alice')))).toBe(
      Code.NotFound,
    );
  });

  it('rejects low bids with FAILED_PRECONDITION and a typed minimum', async () => {
    const { client, as } = fixture();
    await client.placeBid({ itemId: 'lamp', amount: pln(150) }, as('alice'));
    const err = await client
      .placeBid({ itemId: 'lamp', amount: pln(140) }, as('bob'))
      .catch((e: unknown) => ConnectError.from(e));
    expect(err).toBeInstanceOf(ConnectError);
    const e = err as ConnectError;
    expect(e.code).toBe(Code.FailedPrecondition);
    const [detail] = e.findDetails(BidRejectedDetailSchema);
    expect(detail?.minimumBid?.amountMinor).toBe(16_000n);
  });

  it('rejects bids on ended auctions with FAILED_PRECONDITION', async () => {
    const { client, store, as } = fixture();
    store.end(store.get('lamp')!);
    expect(await codeOf(client.placeBid({ itemId: 'lamp', amount: pln(500) }, as('alice')))).toBe(
      Code.FailedPrecondition,
    );
  });

  it('requires an Authorization header (UNAUTHENTICATED)', async () => {
    const { client } = fixture();
    expect(await codeOf(client.placeBid({ itemId: 'lamp', amount: pln(150) }))).toBe(
      Code.Unauthenticated,
    );
  });

  it('allows anonymous reads', async () => {
    const { client } = fixture();
    const res = await client.listItems({ status: ItemStatus.UNSPECIFIED });
    expect(res.items).toHaveLength(1);
  });

  it('rate limits more than 5 bids per second per user (RESOURCE_EXHAUSTED)', async () => {
    const { client, clock, as } = fixture();
    for (let i = 1; i <= 5; i++) {
      await client.placeBid({ itemId: 'lamp', amount: pln(100 + i * 10) }, as('alice'));
    }
    expect(await codeOf(client.placeBid({ itemId: 'lamp', amount: pln(200) }, as('alice')))).toBe(
      Code.ResourceExhausted,
    );
    // Other users are unaffected…
    await client.placeBid({ itemId: 'lamp', amount: pln(200) }, as('bob'));
    // …and the window slides.
    clock.now += 1001;
    await client.placeBid({ itemId: 'lamp', amount: pln(300) }, as('alice'));
  });

  it('only one of two concurrent bids at the same price wins', async () => {
    const { client, as } = fixture();
    const results = await Promise.allSettled([
      client.placeBid({ itemId: 'lamp', amount: pln(150) }, as('alice')),
      client.placeBid({ itemId: 'lamp', amount: pln(150) }, as('bob')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('GetItem', () => {
  it('returns the 20 most recent bids, newest first', async () => {
    const { client, clock, as } = fixture();
    for (let i = 1; i <= 25; i++) {
      clock.now += 1000;
      await client.placeBid({ itemId: 'lamp', amount: pln(100 + i * 10) }, as(`user${i}`));
    }
    const res = await client.getItem({ itemId: 'lamp' });
    expect(res.recentBids).toHaveLength(20);
    expect(res.recentBids[0]?.bidder).toBe('user25');
  });

  it('returns NOT_FOUND for unknown ids', async () => {
    const { client } = fixture();
    expect(await codeOf(client.getItem({ itemId: 'ghost' }))).toBe(Code.NotFound);
  });
});

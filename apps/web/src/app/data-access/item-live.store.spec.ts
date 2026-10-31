import { create } from '@bufbuild/protobuf';
import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { TestBed } from '@angular/core/testing';
import { Code, ConnectError, createClient, createRouterTransport } from '@connectrpc/connect';
import {
  AuctionService,
  BidSchema,
  type ItemEvent,
  ItemEventSchema,
  ItemSchema,
  ItemStatus,
} from '@gavel/proto';
import { AUCTION_CLIENT } from '../core/grpc/grpc-client.token';
import { NicknameService } from '../core/services/nickname.service';
import { backoff, ItemLiveStore } from './item-live.store';

const pln = (zl: number) => ({ amountMinor: BigInt(zl * 100), currency: 'PLN' });
const item = create(ItemSchema, {
  id: 'lamp',
  title: 'Lamp',
  startingPrice: pln(100),
  currentPrice: pln(100),
  minIncrement: pln(10),
  status: ItemStatus.ACTIVE,
  leadingBidder: 'alice',
  bidCount: 1,
});
const bid = (id: string, bidder: string, zl: number) =>
  create(BidSchema, {
    id,
    itemId: 'lamp',
    bidder,
    amount: pln(zl),
    placedAt: timestampFromMs(Date.now()),
  });

/** A controllable in-memory WatchItem stream (Connect's createRouterTransport). */
function setup(nick: string | null = 'alice', script?: (push: (e: ItemEvent) => void) => void) {
  let push!: (e: ItemEvent) => void;
  let fail!: (e: unknown) => void;
  let watchCalls = 0;
  const transport = createRouterTransport(({ service }) => {
    service(AuctionService, {
      getItem: () => ({ item, recentBids: [bid('b1', 'alice', 100)] }),
      async *watchItem(req) {
        watchCalls++;
        if (req.itemId === 'ghost') throw new ConnectError('nope', Code.NotFound);
        const queue: ItemEvent[] = [];
        let wake: (() => void) | undefined;
        let error: unknown;
        push = (e) => {
          queue.push(e);
          wake?.();
        };
        fail = (e) => {
          error = e;
          wake?.();
        };
        yield create(ItemEventSchema, { event: { case: 'snapshot', value: item }, viewers: 2 });
        script?.(push);
        for (;;) {
          if (error) throw error;
          const next = queue.shift();
          if (next) yield next;
          else await new Promise<void>((r) => (wake = r));
        }
      },
    });
  });

  TestBed.configureTestingModule({
    providers: [
      ItemLiveStore,
      { provide: AUCTION_CLIENT, useValue: createClient(AuctionService, transport) },
    ],
  });
  const nicknames = TestBed.inject(NicknameService);
  if (nick) nicknames.set(nick);
  else nicknames.clear();
  const store = TestBed.inject(ItemLiveStore);
  return {
    store,
    push: (e: ItemEvent) => push(e),
    fail: (e: unknown) => fail(e),
    watchCalls: () => watchCalls,
  };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('ItemLiveStore', () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('applies the snapshot, loads history and goes live', async () => {
    const { store } = setup();
    store.connect('lamp');
    await settle();
    expect(store.connection()).toBe('live');
    expect(store.item()?.title).toBe('Lamp');
    expect(store.viewers()).toBe(2);
    expect(store.bids().map((b) => b.id)).toEqual(['b1']);
    expect(store.minimumBid()?.amountMinor).toBe(11_000n);
  });

  it('updates price and history on bid_placed and reports being outbid', async () => {
    const { store, push } = setup('alice');
    const outbid = vi.fn();
    store.outbid$.subscribe(outbid);
    store.connect('lamp');
    await settle();

    push(
      create(ItemEventSchema, {
        event: { case: 'bidPlaced', value: bid('b2', 'bob', 150) },
        viewers: 3,
      }),
    );
    await settle();

    expect(store.item()?.currentPrice?.amountMinor).toBe(15_000n);
    expect(store.item()?.leadingBidder).toBe('bob');
    expect(store.bids()[0]?.id).toBe('b2');
    expect(store.freshBidId()).toBe('b2');
    expect(store.viewers()).toBe(3);
    expect(outbid).toHaveBeenCalledOnce();
  });

  it('marks the auction as ended', async () => {
    const { store, push } = setup();
    const ended = vi.fn();
    store.ended$.subscribe(ended);
    store.connect('lamp');
    await settle();
    push(
      create(ItemEventSchema, {
        event: { case: 'auctionEnded', value: { ...item, status: ItemStatus.ENDED } },
      }),
    );
    await settle();
    expect(store.connection()).toBe('ended');
    expect(store.isEnded()).toBe(true);
    expect(ended).toHaveBeenCalledOnce();
  });

  it('surfaces NOT_FOUND without retrying', async () => {
    const { store, watchCalls } = setup();
    store.connect('ghost');
    await settle();
    expect(store.notFound()).toBe(true);
    expect(watchCalls()).toBe(1);
  });

  it('reconnects with backoff after UNAVAILABLE', async () => {
    const { store, fail, watchCalls } = setup();
    store.connect('lamp');
    await settle();
    fail(new ConnectError('down', Code.Unavailable));
    await settle();
    expect(store.connection()).toBe('reconnecting');
    await new Promise((r) => setTimeout(r, 1100));
    expect(watchCalls()).toBe(2);
    expect(store.connection()).toBe('live');
  });

  it('uses exponential backoff capped at 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(backoff)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);
  });
});

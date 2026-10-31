import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect';
import { AuctionService, BidRejectedDetailSchema, ItemEventSchema, ItemStatus } from '@gavel/proto';
import type { AuctionEvents } from './auction.events.js';
import { CURRENCY, type AuctionStore } from './auction.store.js';
import { kNickname } from './auth.interceptor.js';
import { RateLimiter } from './rate-limiter.js';

export interface AuctionServiceDeps {
  store: AuctionStore;
  events: AuctionEvents;
  rateLimiter?: RateLimiter;
  heartbeatMs?: number;
}

export function createAuctionService({
  store,
  events,
  rateLimiter = new RateLimiter(5, 1000, () => store.now()),
  heartbeatMs = 15_000,
}: AuctionServiceDeps): ServiceImpl<typeof AuctionService> {
  const requireItem = (itemId: string) => {
    if (!itemId) throw new ConnectError('item_id is required', Code.InvalidArgument);
    const item = store.get(itemId);
    if (!item) throw new ConnectError(`Item ${itemId} not found`, Code.NotFound);
    return item;
  };

  return {
    listItems(req) {
      const items = store
        .list(req.status)
        .sort((a, b) => Number((a.endsAt?.seconds ?? 0n) - (b.endsAt?.seconds ?? 0n)));
      return { items };
    },

    getItem(req) {
      const item = requireItem(req.itemId);
      return { item, recentBids: store.recentBids(item.id) };
    },

    placeBid(req, ctx) {
      // 1. INVALID_ARGUMENT
      const amount = req.amount;
      if (!req.itemId) throw new ConnectError('item_id is required', Code.InvalidArgument);
      if (!amount || amount.amountMinor <= 0n) {
        throw new ConnectError('amount must be positive', Code.InvalidArgument);
      }
      if (amount.currency !== CURRENCY) {
        throw new ConnectError(`currency must be ${CURRENCY}`, Code.InvalidArgument);
      }
      // 2. NOT_FOUND
      const item = requireItem(req.itemId);
      // 3. FAILED_PRECONDITION
      if (item.status === ItemStatus.ENDED) {
        throw new ConnectError('Auction has ended', Code.FailedPrecondition);
      }
      const minimum = store.minimumBid(item);
      if (amount.amountMinor < minimum.amountMinor) {
        throw new ConnectError('Bid is below the minimum', Code.FailedPrecondition, undefined, [
          { desc: BidRejectedDetailSchema, value: { minimumBid: minimum } },
        ]);
      }
      // 4. UNAUTHENTICATED — already enforced by authInterceptor; guard for direct use.
      const bidder = ctx.values.get(kNickname);
      if (!bidder) throw new ConnectError('Missing nickname', Code.Unauthenticated);
      // 5. RESOURCE_EXHAUSTED
      if (!rateLimiter.tryAcquire(bidder)) {
        throw new ConnectError('Too many bids, slow down', Code.ResourceExhausted);
      }
      // Write + broadcast happen synchronously in a single tick, so two concurrent
      // bids can never both win at the same price.
      const bid = store.recordBid(item, bidder, amount);
      events.emitBid(bid);
      return { bid, item };
    },

    async *watchItem(req, ctx: HandlerContext) {
      const item = requireItem(req.itemId);
      const event = (init: MessageInitShape<typeof ItemEventSchema> = {}) =>
        create(ItemEventSchema, { ...init, viewers: events.viewerCount(item.id) });

      // Ends the subscription when the client disconnects (ctx.signal) or we return.
      const done = new AbortController();
      const onAbort = () => done.abort();
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      // Subscribe before joining so this stream also sees its own viewer bump.
      const signals = events.subscribe(item.id, done.signal, heartbeatMs);
      events.join(item.id);
      try {
        yield event({ event: { case: 'snapshot', value: item } });
        if (item.status === ItemStatus.ENDED) {
          yield event({ event: { case: 'auctionEnded', value: item } });
          return;
        }
        for await (const s of signals) {
          switch (s.kind) {
            case 'bid':
              yield event({ event: { case: 'bidPlaced', value: s.bid } });
              break;
            case 'ended':
              yield event({ event: { case: 'auctionEnded', value: s.item } });
              return;
            case 'viewers':
            case 'heartbeat':
              yield event();
              break;
          }
        }
      } finally {
        ctx.signal.removeEventListener('abort', onAbort);
        done.abort();
        events.leave(item.id);
      }
    },
  };
}

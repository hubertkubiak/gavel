import { create } from '@bufbuild/protobuf';
import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { createClient, createRouterTransport } from '@connectrpc/connect';
import { AuctionService, ItemSchema, ItemStatus } from '@gavel/proto';
import { AuctionEvents } from '../src/auction.events.js';
import { AuctionStore, pln } from '../src/auction.store.js';
import { authInterceptor } from '../src/auth.interceptor.js';
import { RateLimiter } from '../src/rate-limiter.js';
import { createRoutes } from '../src/routes.js';

/** One active item ("lamp", 100 zł, +10 zł) served through an in-memory Connect transport. */
export function fixture(now = 1_000_000) {
  const clock = { now };
  const store = new AuctionStore(() => clock.now);
  store.add(
    create(ItemSchema, {
      id: 'lamp',
      title: 'Lamp',
      startingPrice: pln(100),
      currentPrice: pln(100),
      minIncrement: pln(10),
      endsAt: timestampFromMs(now + 60_000),
      status: ItemStatus.ACTIVE,
    }),
  );
  const events = new AuctionEvents();
  const rateLimiter = new RateLimiter(5, 1000, () => clock.now);
  const transport = createRouterTransport(createRoutes({ store, events, rateLimiter }), {
    router: { interceptors: [authInterceptor] },
  });
  const client = createClient(AuctionService, transport);
  const as = (nick: string) => ({ headers: { Authorization: `Bearer ${nick}` } });
  return { clock, store, events, client, as };
}

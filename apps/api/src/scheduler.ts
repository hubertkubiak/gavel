import { timestampMs } from '@bufbuild/protobuf/wkt';
import { ItemStatus } from '@gavel/proto';
import type { AuctionEvents } from './auction.events.js';
import type { AuctionStore } from './auction.store.js';

/** Closes every auction at its `ends_at` and broadcasts `auction_ended`. */
export class AuctionScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: AuctionStore,
    private readonly events: AuctionEvents,
  ) {}

  start(): void {
    for (const item of this.store.items.values()) this.schedule(item.id);
  }

  schedule(itemId: string): void {
    const item = this.store.get(itemId);
    if (!item?.endsAt || item.status !== ItemStatus.ACTIVE) return;
    clearTimeout(this.timers.get(itemId));
    const delay = Math.max(0, timestampMs(item.endsAt) - this.store.now());
    this.timers.set(
      itemId,
      setTimeout(() => this.close(itemId), delay),
    );
  }

  close(itemId: string): void {
    this.timers.delete(itemId);
    const item = this.store.get(itemId);
    if (!item || item.status === ItemStatus.ENDED) return;
    this.store.end(item);
    this.events.emitEnded(item);
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

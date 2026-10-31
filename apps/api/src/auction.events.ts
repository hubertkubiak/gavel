import { EventEmitter } from 'node:events';
import type { Bid, Item } from '@gavel/proto';

export type ItemSignal =
  | { kind: 'bid'; bid: Bid }
  | { kind: 'ended'; item: Item }
  | { kind: 'viewers' }
  | { kind: 'heartbeat' };

/**
 * Per-item pub/sub on top of a plain EventEmitter.
 * Channels: `bid:<id>`, `ended:<id>`, `viewers:<id>`.
 */
export class AuctionEvents {
  private readonly emitter = new EventEmitter();
  private readonly viewers = new Map<string, number>();

  constructor() {
    // Each open WatchItem stream adds three listeners — lift the default cap of 10.
    this.emitter.setMaxListeners(0);
  }

  emitBid(bid: Bid): void {
    this.emitter.emit(`bid:${bid.itemId}`, { kind: 'bid', bid } satisfies ItemSignal);
  }

  emitEnded(item: Item): void {
    this.emitter.emit(`ended:${item.id}`, { kind: 'ended', item } satisfies ItemSignal);
  }

  viewerCount(itemId: string): number {
    return this.viewers.get(itemId) ?? 0;
  }

  join(itemId: string): void {
    this.viewers.set(itemId, this.viewerCount(itemId) + 1);
    this.emitter.emit(`viewers:${itemId}`, { kind: 'viewers' } satisfies ItemSignal);
  }

  leave(itemId: string): void {
    const next = Math.max(0, this.viewerCount(itemId) - 1);
    if (next === 0) this.viewers.delete(itemId);
    else this.viewers.set(itemId, next);
    this.emitter.emit(`viewers:${itemId}`, { kind: 'viewers' } satisfies ItemSignal);
  }

  listenerCount(itemId: string): number {
    return this.emitter.listenerCount(`bid:${itemId}`);
  }

  /**
   * Merges the item's channels (plus an optional heartbeat) into one async iterable.
   * Listeners are attached synchronously, so nothing emitted after this call is lost.
   * Iteration finishes — and listeners are removed — when `signal` aborts.
   */
  subscribe(
    itemId: string,
    signal: AbortSignal,
    heartbeatMs = 0,
  ): AsyncIterableIterator<ItemSignal> {
    const queue: ItemSignal[] = [];
    let wake: (() => void) | undefined;
    const push = (s: ItemSignal) => {
      queue.push(s);
      wake?.();
    };
    const names = [`bid:${itemId}`, `ended:${itemId}`, `viewers:${itemId}`];
    for (const n of names) this.emitter.on(n, push);
    const timer =
      heartbeatMs > 0 ? setInterval(() => push({ kind: 'heartbeat' }), heartbeatMs) : undefined;

    const cleanup = () => {
      for (const n of names) this.emitter.off(n, push);
      if (timer) clearInterval(timer);
      wake?.();
    };
    signal.addEventListener('abort', cleanup, { once: true });

    async function* iterate(): AsyncGenerator<ItemSignal> {
      try {
        while (!signal.aborted) {
          const next = queue.shift();
          if (next) {
            yield next;
            continue;
          }
          await new Promise<void>((resolve) => (wake = resolve));
          wake = undefined;
        }
      } finally {
        signal.removeEventListener('abort', cleanup);
        cleanup();
      }
    }
    return iterate();
  }
}

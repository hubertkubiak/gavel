import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { timestampMs } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError } from '@connectrpc/connect';
import { type Bid, type Item, type ItemEvent, ItemStatus, type Money } from '@gavel/proto';
import { Subject, type Subscription, concat, defer, retry, tap, throwError, timer } from 'rxjs';
import { isRetryable, toUiError, type UiError } from '../core/grpc/grpc-error';
import { NicknameService } from '../core/services/nickname.service';
import { AuctionApi } from './auction.api';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'ended';

const HISTORY_LIMIT = 20;
const MAX_BACKOFF_MS = 30_000;

/** 1 s, 2 s, 4 s … capped at 30 s. */
export function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

function newestFirst(a: Bid, b: Bid): number {
  return (b.placedAt ? timestampMs(b.placedAt) : 0) - (a.placedAt ? timestampMs(a.placedAt) : 0);
}

/**
 * Live state of a single item, fed by `WatchItem`. Provided per `ItemDetailPage`.
 *
 * The stream is the single source of truth: after `PlaceBid` the UI waits for the
 * `bid_placed` event instead of updating optimistically. Every (re)connect starts
 * with a `snapshot` that overwrites local state, so nothing is lost while offline.
 */
@Service({ autoProvided: false })
export class ItemLiveStore {
  private readonly api = inject(AuctionApi);
  private readonly nickname = inject(NicknameService);

  readonly item = signal<Item | null>(null);
  readonly bids = signal<Bid[]>([]);
  readonly viewers = signal(0);
  readonly connection = signal<ConnectionState>('connecting');
  readonly error = signal<UiError | null>(null);
  readonly notFound = computed(() => this.error()?.code === Code.NotFound);
  /** Id of the bid that just arrived over the stream — drives the highlight animation. */
  readonly freshBidId = signal<string | null>(null);

  /** Fires when somebody overbids the current user. */
  readonly outbid$ = new Subject<Bid>();
  /** Fires once when the auction ends while being watched. */
  readonly ended$ = new Subject<Item>();

  readonly isEnded = computed(() => this.item()?.status === ItemStatus.ENDED);
  readonly isLeading = computed(() => {
    const nick = this.nickname.nickname();
    return !!nick && this.item()?.leadingBidder === nick;
  });
  readonly minimumBid = computed<Money | undefined>(() => {
    const item = this.item();
    if (!item?.currentPrice || !item.minIncrement) return undefined;
    return {
      ...item.currentPrice,
      amountMinor: item.currentPrice.amountMinor + item.minIncrement.amountMinor,
    };
  });
  /** Price over time, oldest first, for the sparkline. */
  readonly priceSeries = computed(() => {
    const start = this.item()?.startingPrice?.amountMinor;
    const points = [...this.bids()].reverse().map((b) => b.amount?.amountMinor ?? 0n);
    return start === undefined ? points : [start, ...points];
  });

  private sub?: Subscription;
  private historySub?: Subscription;
  private historyFor = -1;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  connect(itemId: string): void {
    this.disconnect();
    this.item.set(null);
    this.bids.set([]);
    this.error.set(null);
    this.historyFor = -1;
    this.connection.set('connecting');

    const watch = defer(() =>
      concat(
        this.api.watchItem(itemId),
        // A stream that closes without `auction_ended` is a dropped connection.
        defer(() =>
          this.connection() === 'ended'
            ? []
            : throwError(() => new ConnectError('stream closed', Code.Unavailable)),
        ),
      ),
    );

    this.sub = watch
      .pipe(
        tap((event) => this.apply(itemId, event)),
        retry({
          resetOnSuccess: true,
          delay: (err: unknown, attempt) => {
            if (!isRetryable(err)) return throwError(() => err);
            this.connection.set('reconnecting');
            return timer(backoff(attempt));
          },
        }),
      )
      .subscribe({
        error: (err: unknown) => {
          this.error.set(toUiError(err));
          this.connection.set('ended');
        },
      });
  }

  disconnect(): void {
    this.sub?.unsubscribe();
    this.historySub?.unsubscribe();
  }

  private apply(itemId: string, event: ItemEvent): void {
    this.viewers.set(event.viewers);
    const e = event.event;
    switch (e.case) {
      case 'snapshot':
        this.item.set(e.value);
        this.connection.set(e.value.status === ItemStatus.ENDED ? 'ended' : 'live');
        this.syncHistory(itemId, e.value.bidCount);
        break;
      case 'bidPlaced':
        this.onBid(e.value);
        break;
      case 'auctionEnded':
        this.item.set(e.value);
        this.connection.set('ended');
        this.ended$.next(e.value);
        break;
      case undefined:
        // Heartbeat / viewer-count update only.
        break;
      default: {
        const exhaustive: never = e;
        return exhaustive;
      }
    }
  }

  private onBid(bid: Bid): void {
    if (this.bids().some((b) => b.id === bid.id)) return;
    const item = this.item();
    const me = this.nickname.nickname();
    if (item) {
      if (me && item.leadingBidder === me && bid.bidder !== me) this.outbid$.next(bid);
      this.item.set({
        ...item,
        currentPrice: bid.amount,
        bidCount: item.bidCount + 1,
        leadingBidder: bid.bidder,
      });
    }
    this.mergeBids([bid]);
    this.freshBidId.set(bid.id);
  }

  /** The snapshot carries the item only; fetch the bid history when ours is stale. */
  private syncHistory(itemId: string, bidCount: number): void {
    if (this.historyFor === bidCount) return;
    this.historyFor = bidCount;
    this.historySub?.unsubscribe();
    this.historySub = this.api.getItem(itemId).subscribe({
      next: (res) => this.mergeBids(res.recentBids),
      error: () => (this.historyFor = -1),
    });
  }

  /** Merge by id — keeps bids that arrived over the stream while history was in flight. */
  private mergeBids(incoming: Bid[]): void {
    const byId = new Map(this.bids().map((b) => [b.id, b]));
    for (const b of incoming) byId.set(b.id, b);
    this.bids.set([...byId.values()].sort(newestFirst).slice(0, HISTORY_LIMIT));
  }
}

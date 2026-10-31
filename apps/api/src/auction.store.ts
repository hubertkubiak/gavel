import { create } from '@bufbuild/protobuf';
import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import {
  type Bid,
  BidSchema,
  type Item,
  ItemSchema,
  ItemStatus,
  type Money,
  MoneySchema,
} from '@gavel/proto';

export const CURRENCY = 'PLN';
export const RECENT_BIDS_LIMIT = 20;

export function pln(zloty: number): Money {
  return create(MoneySchema, { amountMinor: BigInt(Math.round(zloty * 100)), currency: CURRENCY });
}

export type Clock = () => number;

interface SeedItem {
  id: string;
  title: string;
  description: string;
  image: string;
  start: number;
  increment: number;
  /** Minutes until the end (normal / SEED_FAST=1). */
  endsIn: [normal: number, fast: number];
  bids: [bidder: string, zloty: number][];
}

const SEED: SeedItem[] = [
  {
    id: 'rangefinder-1957',
    title: 'Aparat dalmierzowy, 1957',
    description:
      'Kultowy dalmierz z mosiężnym korpusem i obiektywem 50 mm f/2. Migawka sprawna, wizjer jasny, skórka oryginalna. Pełen serwis w 2024.',
    image: '/items/camera.svg',
    start: 100,
    increment: 10,
    endsIn: [3, 1],
    bids: [],
  },
  {
    id: 'vinyl-first-press',
    title: 'Winyl jazzowy — pierwsze tłoczenie',
    description:
      'Modalny jazz z 1959 roku, mono, oryginalna koperta z drobnymi przetarciami. Płyta w stanie VG+, bez trzasków na pierwszej stronie.',
    image: '/items/vinyl.svg',
    start: 250,
    increment: 25,
    endsIn: [8, 2],
    bids: [
      ['koneser', 275],
      ['bluenote', 300],
    ],
  },
  {
    id: 'chrono-moonwatch',
    title: 'Chronograf z ręcznym naciągiem',
    description:
      'Stalowy chronograf 42 mm, mechanizm z ręcznym naciągiem, tachymetr na lunecie. Komplet: pudełko i papiery.',
    image: '/items/watch.svg',
    start: 9000,
    increment: 250,
    endsIn: [14, 3],
    bids: [
      ['tiktak', 9250],
      ['zegarmistrz', 9500],
      ['tiktak', 10_000],
    ],
  },
  {
    id: 'poster-school-1962',
    title: 'Plakat filmowy, polska szkoła plakatu',
    description:
      'Offset z 1962 roku, 67 × 98 cm. Odważna typografia i ręcznie malowana ilustracja. Złożony w czworo, jak większość egzemplarzy z epoki.',
    image: '/items/poster.svg',
    start: 600,
    increment: 50,
    endsIn: [20, 4],
    bids: [['galeria', 650]],
  },
  {
    id: 'keyboard-custom-65',
    title: 'Klawiatura mechaniczna 65%',
    description:
      'Aluminiowa obudowa, płytka z mosiądzu, przełączniki liniowe smarowane ręcznie, keycapy PBT w kolorach fioletu i grafitu.',
    image: '/items/keyboard.svg',
    start: 800,
    increment: 50,
    endsIn: [25, 4.5],
    bids: [],
  },
  {
    id: 'bauhaus-lamp',
    title: 'Lampa biurkowa w duchu Bauhausu',
    description:
      'Szklany klosz, niklowany trzon, oryginalny przełącznik łańcuszkowy. Instalacja wymieniona na nową, gotowa do użytku.',
    image: '/items/lamp.svg',
    start: 1200,
    increment: 100,
    endsIn: [30, 5],
    bids: [
      ['projektant', 1300],
      ['modernista', 1400],
    ],
  },
];

/** In-memory auction state. Everything is lost on restart — by design. */
export class AuctionStore {
  readonly items = new Map<string, Item>();
  readonly bids = new Map<string, Bid[]>();
  private seq = 0;

  constructor(private readonly clock: Clock = Date.now) {}

  static seeded(options: { fast?: boolean; clock?: Clock } = {}): AuctionStore {
    const store = new AuctionStore(options.clock);
    store.seed(options.fast ?? false);
    return store;
  }

  now(): number {
    return this.clock();
  }

  seed(fast: boolean): void {
    const now = this.now();
    for (const s of SEED) {
      const minutes = fast ? s.endsIn[1] : s.endsIn[0];
      const item = create(ItemSchema, {
        id: s.id,
        title: s.title,
        description: s.description,
        imageUrl: s.image,
        startingPrice: pln(s.start),
        currentPrice: pln(s.start),
        minIncrement: pln(s.increment),
        endsAt: timestampFromMs(now + minutes * 60_000),
        status: ItemStatus.ACTIVE,
      });
      this.add(item);
      s.bids.forEach(([bidder, zloty], i) => {
        const placedAt = now - (s.bids.length - i) * 47_000;
        this.recordBid(item, bidder, pln(zloty), placedAt);
      });
    }
  }

  add(item: Item): void {
    this.items.set(item.id, item);
    this.bids.set(item.id, []);
  }

  get(id: string): Item | undefined {
    return this.items.get(id);
  }

  list(status: ItemStatus): Item[] {
    const all = [...this.items.values()];
    return status === ItemStatus.UNSPECIFIED ? all : all.filter((i) => i.status === status);
  }

  recentBids(id: string): Bid[] {
    return (this.bids.get(id) ?? []).slice(-RECENT_BIDS_LIMIT).reverse();
  }

  /** Minimum acceptable next bid: current price + min increment. */
  minimumBid(item: Item): Money {
    const current = item.currentPrice?.amountMinor ?? 0n;
    const increment = item.minIncrement?.amountMinor ?? 0n;
    return create(MoneySchema, { amountMinor: current + increment, currency: CURRENCY });
  }

  /** Mutates the item synchronously — callers rely on this being a single tick. */
  recordBid(item: Item, bidder: string, amount: Money, placedAtMs = this.now()): Bid {
    const bid = create(BidSchema, {
      id: `b${++this.seq}`,
      itemId: item.id,
      bidder,
      amount,
      placedAt: timestampFromMs(placedAtMs),
    });
    this.bids.get(item.id)?.push(bid);
    item.currentPrice = amount;
    item.bidCount += 1;
    item.leadingBidder = bidder;
    return bid;
  }

  end(item: Item): void {
    item.status = ItemStatus.ENDED;
  }
}

import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ItemStatus } from '@gavel/proto';
import { LucideRefreshCw } from '@lucide/angular';
import { map } from 'rxjs';
import { toUiError } from '../../core/grpc/grpc-error';
import { AuctionApi } from '../../data-access/auction.api';
import { ItemCard } from './item-card';

const FILTERS = [
  { status: ItemStatus.ACTIVE, label: 'Aktywne' },
  { status: ItemStatus.ENDED, label: 'Zakończone' },
  { status: ItemStatus.UNSPECIFIED, label: 'Wszystkie' },
] as const;

const REFRESH_MS = 10_000;

/** US-2: bento grid of auctions with status filter and live countdowns. */
@Component({
  selector: 'gv-item-list-page',
  imports: [ItemCard, LucideRefreshCw],
  template: `
    <section class="mb-8 flex flex-col gap-6 sm:mb-10 md:flex-row md:items-end md:justify-between">
      <div class="fade-up">
        <p
          class="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-accent"
        >
          <span class="size-1.5 rounded-full bg-live"></span> gRPC · server streaming
        </p>
        <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">Licytuj na żywo.</h1>
        <p class="mt-3 max-w-xl text-muted">
          Każda oferta płynie strumieniem prosto do Twojej przeglądarki — bez odświeżania, bez
          Envoya.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Filtr statusu"
        class="flex w-fit rounded-xl border border-border bg-surface p-1"
      >
        @for (f of filters; track f.status) {
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="status() === f.status"
            (click)="status.set(f.status)"
            class="rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors"
            [class]="
              status() === f.status ? 'bg-surface-2 text-fg shadow-sm' : 'text-muted hover:text-fg'
            "
          >
            {{ f.label }}
          </button>
        }
      </div>
    </section>

    @if (items.error(); as err) {
      <div class="card flex flex-col items-center gap-4 p-10 text-center" role="alert">
        <p class="font-medium">{{ errorMessage(err) }}</p>
        <button type="button" class="btn btn-ghost" (click)="items.reload()">
          <svg lucideRefreshCw [size]="16" aria-hidden="true"></svg> Spróbuj ponownie
        </button>
      </div>
    } @else if (!items.hasValue()) {
      <div
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-busy="true"
        aria-label="Ładowanie aukcji"
      >
        @for (i of skeletons; track i) {
          <div class="card overflow-hidden" [class]="i === 0 ? 'sm:col-span-2 sm:row-span-2' : ''">
            <div
              class="skeleton aspect-[4/3] rounded-none"
              [class.md:aspect-auto]="i === 0"
              [class.md:h-80]="i === 0"
            ></div>
            <div class="space-y-3 p-4">
              <div class="skeleton h-5 w-3/4"></div>
              <div class="skeleton h-7 w-1/3"></div>
            </div>
          </div>
        }
      </div>
    } @else {
      <ul class="grid auto-rows-auto gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Aukcje">
        @for (item of sorted(); track item.id; let i = $index) {
          <li
            class="fade-up"
            [class]="i === 0 && featuredFirst() ? 'sm:col-span-2 sm:row-span-2' : ''"
            [style.animation-delay.ms]="i * 40"
          >
            <gv-item-card [item]="item" [featured]="i === 0 && featuredFirst()" />
          </li>
        } @empty {
          <li class="card col-span-full p-10 text-center text-muted">
            Brak aukcji w tej kategorii.
          </li>
        }
      </ul>
    }
  `,
})
export class ItemListPage {
  private readonly api = inject(AuctionApi);
  protected readonly filters = FILTERS;
  protected readonly skeletons = [0, 1, 2, 3, 4, 5];
  protected readonly status = signal<ItemStatus>(ItemStatus.ACTIVE);

  protected readonly items = rxResource({
    params: () => this.status(),
    stream: ({ params }) => this.api.listItems(params).pipe(map((r) => r.items)),
  });

  /** Server sorts by ends_at; the soonest-ending active auction gets the big bento tile. */
  protected readonly sorted = computed(() => this.items.value() ?? []);
  protected readonly featuredFirst = computed(
    () => this.sorted()[0]?.status === ItemStatus.ACTIVE && this.sorted().length > 2,
  );

  constructor() {
    // The list is unary — refresh it quietly so prices don't go stale.
    const id = setInterval(() => this.items.reload(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }

  protected errorMessage(err: unknown): string {
    const ui = toUiError(err);
    return ui.message === 'Łączę ponownie…' ? 'Serwer jest nieosiągalny.' : ui.message;
  }
}

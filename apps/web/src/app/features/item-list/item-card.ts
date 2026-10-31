import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { timestampMs } from '@bufbuild/protobuf/wkt';
import { RouterLink } from '@angular/router';
import { type Item, ItemStatus } from '@gavel/proto';
import { LucideGavel, LucideTimer } from '@lucide/angular';
import { Clock } from '../../core/services/clock.service';
import { Countdown } from '../../shared/ui/countdown';
import { MoneyPipe } from '../../shared/ui/money';

@Component({
  selector: 'gv-item-card',
  imports: [RouterLink, NgOptimizedImage, Countdown, MoneyPipe, LucideGavel, LucideTimer],
  template: `
    <a
      [routerLink]="['/items', item().id]"
      class="card group relative flex h-full flex-col overflow-hidden transition-colors hover:border-accent/60 focus-visible:border-accent"
    >
      <div
        class="relative overflow-hidden bg-surface-2"
        [class]="featured() ? 'aspect-[4/3] md:aspect-auto md:min-h-80 md:flex-1' : 'aspect-[4/3]'"
      >
        <img
          [ngSrc]="item().imageUrl"
          fill
          [priority]="featured()"
          sizes="(min-width: 768px) 50vw, 100vw"
          alt=""
          class="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          [style.view-transition-name]="'item-' + item().id"
        />
        <div class="absolute left-3 top-3 flex gap-2">
          @if (ended()) {
            <span class="badge bg-bg/80 text-muted backdrop-blur-sm">Zakończona</span>
          } @else {
            <span class="badge bg-bg/80 text-fg backdrop-blur-sm">
              <svg lucideTimer [size]="12" aria-hidden="true"></svg>
              <gv-countdown [endsAt]="endsAtMs()" />
            </span>
          }
          @if (featured() && !ended()) {
            <span class="badge bg-accent-strong text-accent-fg">Kończy się najszybciej</span>
          }
        </div>
      </div>
      <div class="flex flex-col gap-3 p-4" [class.sm:p-5]="featured()">
        <h2
          class="line-clamp-2 font-semibold leading-snug tracking-tight"
          [class]="featured() ? 'text-xl sm:text-2xl' : 'text-base'"
        >
          {{ item().title }}
        </h2>
        <div class="mt-auto flex items-end justify-between gap-2">
          <div>
            <p class="text-xs text-muted">{{ ended() ? 'Cena końcowa' : 'Aktualna cena' }}</p>
            <p
              class="font-mono font-semibold tabular-nums text-accent"
              [class]="featured() ? 'text-3xl' : 'text-xl'"
            >
              {{ item().currentPrice | money }}
            </p>
          </div>
          <p class="flex items-center gap-1.5 text-sm text-muted">
            <svg lucideGavel [size]="14" aria-hidden="true"></svg>
            <span class="font-mono tabular-nums">{{ item().bidCount }}</span>
            <span class="sr-only">ofert</span>
          </p>
        </div>
      </div>
    </a>
  `,
  host: { class: 'block' },
})
export class ItemCard {
  private readonly clock = inject(Clock);
  readonly item = input.required<Item>();
  readonly featured = input(false);

  protected readonly endsAtMs = computed(() => {
    const t = this.item().endsAt;
    return t ? timestampMs(t) : 0;
  });
  protected readonly ended = computed(
    () => this.item().status === ItemStatus.ENDED || this.endsAtMs() <= this.clock.now(),
  );
}

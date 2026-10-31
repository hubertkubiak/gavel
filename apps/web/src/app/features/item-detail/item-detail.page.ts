import { NgOptimizedImage } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { type Timestamp, timestampMs } from '@bufbuild/protobuf/wkt';
import {
  LucideArrowLeft,
  LucideCrown,
  LucideEye,
  LucideSearchX,
  LucideTimer,
} from '@lucide/angular';
import { toast } from 'ngx-sonner';
import { NicknameService } from '../../core/services/nickname.service';
import { ItemLiveStore } from '../../data-access/item-live.store';
import { AnimatedPrice } from '../../shared/ui/animated-price';
import { Avatar } from '../../shared/ui/avatar';
import { celebrate } from '../../shared/ui/celebrate';
import { ConnectionBanner } from '../../shared/ui/connection-banner';
import { Countdown } from '../../shared/ui/countdown';
import { LiveDot } from '../../shared/ui/live-dot';
import { formatMoney, MoneyPipe } from '../../shared/ui/money';
import { RelativeTime } from '../../shared/ui/relative-time';
import { Sparkline } from '../../shared/ui/sparkline';
import { BidForm } from '../bid-form/bid-form';

/** US-3, US-4, US-6: item details, live bid history, viewers, and the end of the auction. */
@Component({
  selector: 'gv-item-detail-page',
  providers: [ItemLiveStore],
  imports: [
    NgOptimizedImage,
    RouterLink,
    AnimatedPrice,
    Avatar,
    BidForm,
    ConnectionBanner,
    Countdown,
    LiveDot,
    MoneyPipe,
    RelativeTime,
    Sparkline,
    LucideArrowLeft,
    LucideCrown,
    LucideEye,
    LucideSearchX,
    LucideTimer,
  ],
  templateUrl: './item-detail.page.html',
})
export class ItemDetailPage {
  protected readonly store = inject(ItemLiveStore);
  protected readonly nickname = inject(NicknameService);

  /** Route param `:id`. */
  readonly id = input.required<string>();

  protected readonly item = this.store.item;
  protected readonly endsAtMs = computed(() => {
    const t = this.item()?.endsAt;
    return t ? timestampMs(t) : 0;
  });
  protected readonly priceMinor = computed(() => this.item()?.currentPrice?.amountMinor ?? 0n);
  protected readonly flash = signal(false);
  protected readonly isWinner = computed(() => this.store.isEnded() && this.store.isLeading());

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.store.connect(id));
    });

    this.store.outbid$.pipe(takeUntilDestroyed()).subscribe((bid) => {
      toast.warning('Ktoś Cię przebił', {
        description: `${bid.bidder} daje ${formatMoney(bid.amount)}`,
      });
      this.flash.set(false);
      requestAnimationFrame(() => this.flash.set(true));
      setTimeout(() => this.flash.set(false), 900);
    });

    this.store.ended$.pipe(takeUntilDestroyed()).subscribe((item) => {
      if (this.store.isLeading()) {
        toast.success('Wygrywasz!', {
          description: `${item.title} — ${formatMoney(item.currentPrice)}`,
        });
        void celebrate();
      } else {
        toast.info('Aukcja zakończona');
      }
    });
  }

  protected bidTime(placedAt: Timestamp | undefined): number {
    return placedAt ? timestampMs(placedAt) : 0;
  }
}

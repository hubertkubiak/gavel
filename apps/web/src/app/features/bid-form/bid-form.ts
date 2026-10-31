import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { Code } from '@connectrpc/connect';
import type { Money } from '@gavel/proto';
import { LucideGavel } from '@lucide/angular';
import { toast } from 'ngx-sonner';
import { firstValueFrom } from 'rxjs';
import { toUiError } from '../../core/grpc/grpc-error';
import { NicknameService } from '../../core/services/nickname.service';
import { AuctionApi } from '../../data-access/auction.api';
import { formatMinor, toMajor, toMinor } from '../../shared/ui/money';

const QUICK = [10, 50, 100];

/**
 * US-5: place a bid. Prefilled with the minimum, button busy while sending.
 * Deliberately NOT optimistic — the price changes only when the stream says so.
 * On phones it docks as a sticky bottom bar with quick "+10 / +50 / +100 zł" buttons.
 */
@Component({
  selector: 'gv-bid-form',
  imports: [FormField, LucideGavel],
  template: `
    <form
      (submit)="placeBid($event)"
      novalidate
      class="flex flex-col gap-3"
      aria-label="Złóż ofertę"
    >
      <div class="flex items-center justify-between gap-2 text-sm">
        <label for="bid-amount" class="font-medium">Twoja oferta</label>
        <span class="text-muted"
          >min. <span class="font-mono tabular-nums text-fg">{{ minimumLabel() }}</span></span
        >
      </div>

      <div class="flex gap-2">
        <div class="relative flex-1">
          <input
            id="bid-amount"
            type="number"
            inputmode="decimal"
            class="input pr-12 font-mono text-lg tabular-nums"
            [formField]="bidForm.amount"
            [step]="stepMajor()"
            [attr.aria-invalid]="errorText() ? 'true' : null"
            aria-describedby="bid-error"
          />
          <span
            class="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted"
            >zł</span
          >
        </div>
        <button
          type="submit"
          class="btn btn-primary h-11 min-w-32 px-5 text-base"
          [disabled]="busy()"
          [attr.aria-busy]="busy()"
        >
          @if (busy()) {
            <span
              class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
              aria-hidden="true"
            ></span>
            <span>Wysyłam…</span>
          } @else {
            <svg lucideGavel [size]="16" aria-hidden="true"></svg>
            <span>Licytuj</span>
          }
        </button>
      </div>

      <div class="flex gap-2" role="group" aria-label="Szybkie podbicie">
        @for (q of quick; track q) {
          <button
            type="button"
            class="btn btn-ghost h-8 flex-1 px-2 font-mono text-xs tabular-nums"
            (click)="bump(q)"
          >
            +{{ q }} zł
          </button>
        }
      </div>

      <p id="bid-error" class="min-h-5 text-sm text-danger" role="alert">{{ errorText() }}</p>
    </form>
  `,
})
export class BidForm {
  private readonly api = inject(AuctionApi);
  private readonly nicknames = inject(NicknameService);
  private readonly router = inject(Router);

  readonly itemId = input.required<string>();
  readonly minimum = input.required<Money>();
  readonly increment = input<Money>();

  protected readonly quick = QUICK;
  protected readonly serverError = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly minimumMajor = computed(() => toMajor(this.minimum().amountMinor));
  protected readonly minimumLabel = computed(() => formatMinor(this.minimum().amountMinor));
  protected readonly stepMajor = computed(() => toMajor(this.increment()?.amountMinor ?? 100n));

  /** Follows the minimum, unless the user already typed something higher. */
  private readonly model = linkedSignal<number, { amount: number }>({
    source: this.minimumMajor,
    computation: (minimum, prev) =>
      prev && prev.value.amount >= minimum ? prev.value : { amount: minimum },
  });

  // Only a presence check here: the minimum is enforced by the server, which answers
  // FAILED_PRECONDITION with a typed BidRejectedDetail — that is the point of the demo.
  protected readonly bidForm = form(this.model, (p) => {
    required(p.amount, { message: 'Podaj kwotę' });
  });

  protected readonly errorText = computed(() => {
    const field = this.bidForm.amount();
    if (field.touched() && field.invalid()) return field.errors()[0]?.message ?? '';
    return this.serverError() ?? '';
  });

  constructor() {
    // A new minimum (somebody bid) makes the old server error stale.
    effect(() => {
      this.minimumMajor();
      untracked(() => this.serverError.set(null));
    });
  }

  protected bump(zloty: number): void {
    this.serverError.set(null);
    this.model.update(({ amount }) => ({
      amount: Math.max(amount || 0, this.minimumMajor()) + zloty,
    }));
  }

  protected async placeBid(event: Event): Promise<void> {
    event.preventDefault();
    this.serverError.set(null);
    if (!this.nicknames.hasNickname()) {
      await this.goToNickname();
      return;
    }
    await submit(this.bidForm, async () => {
      this.busy.set(true);
      const amount = {
        amountMinor: toMinor(this.model().amount),
        currency: this.minimum().currency,
      };
      try {
        const res = await firstValueFrom(this.api.placeBid(this.itemId(), amount));
        toast.success('Oferta przyjęta', {
          description: `${formatMinor(res.bid?.amount?.amountMinor ?? amount.amountMinor)} — prowadzisz!`,
        });
      } catch (err) {
        const ui = toUiError(err);
        if (ui.code === Code.Unauthenticated) await this.goToNickname();
        else this.serverError.set(ui.message);
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }

  private goToNickname() {
    return this.router.navigate(['/nickname'], { queryParams: { returnUrl: this.router.url } });
  }
}

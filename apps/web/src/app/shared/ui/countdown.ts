import { Component, computed, inject, input } from '@angular/core';
import { Clock } from '../../core/services/clock.service';

export function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Ticking mm:ss countdown. Turns warning-coloured in the last minute, pulses faster in the last 10 s. */
@Component({
  selector: 'gv-countdown',
  template: `
    <span class="sr-only">Do końca: </span>
    <time [attr.datetime]="iso()">{{ label() }}</time>
  `,
  host: {
    class: 'font-mono tabular-nums inline-flex items-center gap-1',
    '[class.text-warn]': 'phase() !== "normal"',
    '[class.animate-pulse-slow]': 'phase() === "warning"',
    '[class.animate-pulse-fast]': 'phase() === "critical"',
    '[class.text-muted]': 'phase() === "over"',
  },
})
export class Countdown {
  private readonly clock = inject(Clock);
  /** Unix ms. */
  readonly endsAt = input.required<number>();

  protected readonly remaining = computed(() => this.endsAt() - this.clock.now());
  protected readonly label = computed(() => formatRemaining(this.remaining()));
  protected readonly iso = computed(() => new Date(this.endsAt()).toISOString());
  protected readonly phase = computed(() => {
    const r = this.remaining();
    if (r <= 0) return 'over';
    if (r <= 10_000) return 'critical';
    if (r <= 60_000) return 'warning';
    return 'normal';
  });
}

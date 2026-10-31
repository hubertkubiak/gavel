import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { prefersReducedMotion } from '../../core/services/motion.service';
import { formatMinor } from './money';

const DURATION_MS = 400;

/** Price that "counts" from the old to the new value in ~400 ms (instant with reduced motion). */
@Component({
  selector: 'gv-animated-price',
  template: `{{ text() }}`,
  host: { class: 'font-mono tabular-nums' },
})
export class AnimatedPrice {
  readonly amountMinor = input.required<bigint>();
  readonly currency = input('PLN');

  protected readonly text = signal('');
  private shown: number | null = null;
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
    effect(() => {
      const target = Number(this.amountMinor());
      const currency = this.currency();
      untracked(() => this.animateTo(target, currency));
    });
  }

  private animateTo(target: number, currency: string): void {
    cancelAnimationFrame(this.frame);
    const from = this.shown;
    if (from === null || from === target || prefersReducedMotion()) {
      this.render(target, currency);
      return;
    }
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / DURATION_MS);
      const eased = 1 - (1 - p) ** 3;
      this.render(p === 1 ? target : Math.round(from + (target - from) * eased), currency);
      if (p < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private render(minor: number, currency: string): void {
    this.shown = minor;
    this.text.set(formatMinor(BigInt(minor), currency));
  }
}

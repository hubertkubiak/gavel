import { Component, computed, inject, input } from '@angular/core';
import { Clock } from '../../core/services/clock.service';

const rtf = new Intl.RelativeTimeFormat('pl-PL', { numeric: 'auto', style: 'short' });

export function relative(ms: number, now: number): string {
  const s = Math.round((ms - now) / 1000);
  if (Math.abs(s) < 5) return 'teraz';
  if (Math.abs(s) < 60) return rtf.format(s, 'second');
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(m, 'minute');
  return rtf.format(Math.round(m / 60), 'hour');
}

@Component({
  selector: 'gv-relative-time',
  template: `<time [attr.datetime]="iso()">{{ text() }}</time>`,
})
export class RelativeTime {
  private readonly clock = inject(Clock);
  readonly at = input.required<number>();
  protected readonly iso = computed(() => new Date(this.at()).toISOString());
  protected readonly text = computed(() => relative(this.at(), this.clock.now()));
}

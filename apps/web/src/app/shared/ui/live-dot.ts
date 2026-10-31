import { Component, computed, input } from '@angular/core';
import type { ConnectionState } from '../../data-access/item-live.store';

const LABELS: Record<ConnectionState, string> = {
  connecting: 'Łączenie',
  live: 'Live',
  reconnecting: 'Offline',
  ended: 'Koniec',
};

/** Pulsing "LIVE" indicator — accent while the stream is up, grey while reconnecting. */
@Component({
  selector: 'gv-live-dot',
  template: `
    <span class="relative flex size-2.5" aria-hidden="true">
      @if (state() === 'live') {
        <span
          class="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-70 motion-reduce:hidden"
        ></span>
      }
      <span class="relative inline-flex size-2.5 rounded-full" [class]="dot()"></span>
    </span>
    <span>{{ label() }}</span>
  `,
  host: {
    class: 'inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider',
    '[class.text-live]': 'state() === "live"',
    '[class.text-muted]': 'state() !== "live"',
  },
})
export class LiveDot {
  readonly state = input.required<ConnectionState>();
  protected readonly label = computed(() => LABELS[this.state()]);
  protected readonly dot = computed(() =>
    this.state() === 'live'
      ? 'bg-live'
      : this.state() === 'ended'
        ? 'bg-muted'
        : 'bg-muted animate-pulse',
  );
}

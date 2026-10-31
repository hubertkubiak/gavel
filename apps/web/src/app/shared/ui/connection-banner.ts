import { Component, input } from '@angular/core';
import { LucideWifiOff } from '@lucide/angular';

/** Glass banner shown while the live stream reconnects with backoff. */
@Component({
  selector: 'gv-connection-banner',
  imports: [LucideWifiOff],
  template: `
    @if (visible()) {
      <div
        role="status"
        animate.enter="banner-enter"
        animate.leave="banner-leave"
        class="glass fixed inset-x-0 top-16 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-warn/40 px-4 py-2 text-sm font-medium text-fg shadow-lg"
      >
        <svg lucideWifiOff [size]="16" class="text-warn" aria-hidden="true"></svg>
        <span>Łączę ponownie…</span>
        <span
          class="size-3 animate-spin rounded-full border-2 border-warn border-t-transparent motion-reduce:animate-none"
          aria-hidden="true"
        ></span>
      </div>
    }
  `,
})
export class ConnectionBanner {
  readonly visible = input(false);
}

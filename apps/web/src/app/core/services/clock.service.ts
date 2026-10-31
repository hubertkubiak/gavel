import { DestroyRef, Service, inject, signal } from '@angular/core';

/** A shared 250 ms heartbeat so every countdown on the page ticks in sync. */
@Service()
export class Clock {
  readonly now = signal(Date.now());

  constructor() {
    const id = setInterval(() => this.now.set(Date.now()), 250);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}

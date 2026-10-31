import { DestroyRef, Service, inject, signal } from '@angular/core';

/** Mirrors `prefers-reduced-motion` — gates counters, confetti and view transitions. */
@Service()
export class Motion {
  private readonly query = matchMedia('(prefers-reduced-motion: reduce)');
  readonly reduced = signal(this.query.matches);

  constructor() {
    const onChange = (e: MediaQueryListEvent) => this.reduced.set(e.matches);
    this.query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.query.removeEventListener('change', onChange));
  }
}

export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
